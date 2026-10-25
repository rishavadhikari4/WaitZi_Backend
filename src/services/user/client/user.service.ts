// src/services/user/client/user.service.ts
// Staff management inside one organization. "Users" here are memberships:
// identity lives on users (global), role/status/branches on memberships.
import type { ActiveStatus } from '@prisma/client';

import { asPlatform, withTenant, type TenantContext, type TenantTx } from '../../../config/prisma.js';
import { ALL } from '../../../constants/permissions.js';
import RoleRepository from '../../../repository/role.repository.js';
import UserRepository from '../../../repository/user.repository.js';
import UserOrganizationRepository, { type MemberRow } from '../../../repository/userOrganization.repository.js';
import { AppError } from '../../../utils/AppError.js';
import { hashPassword, paginationMeta, verifyPassword } from '../../../utils/Helpers.js';
import type { CreateMemberInput, MemberQuery, UpdateMemberInput, UpdateProfileInput } from '../../../validators/user.schema.js';
import PasswordService from '../../auth/password.service.js';
import { recordAudit } from '../../audit/audit.service.js';
import ImageService from '../../media/image.service.js';
import { memberToApi } from '../shared/member.mapper.js';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const IDENTITY_FIELDS = ['firstName', 'lastName', 'email', 'number', 'address'] as const;

async function requireMember(tx: TenantTx, orgId: string, userId: string): Promise<MemberRow> {
  const member = await UserOrganizationRepository.findMember(tx, orgId, userId);
  if (!member) throw AppError.notFound('User not found');
  return member;
}

const isAdminRole = (permissions: string[]) => permissions.includes(ALL);

/** Refuse changes that would leave the org with no active admin. */
async function assertKeepsAnAdmin(tx: TenantTx, member: MemberRow, next: { status?: ActiveStatus; roleId?: string }) {
  if (!isAdminRole(member.role.permissions) || member.status !== 'Active') return;
  let losesAdmin = next.status === 'Inactive';
  if (next.roleId && next.roleId !== member.roleId) {
    const role = await RoleRepository.findById(tx, next.roleId);
    losesAdmin ||= !role || !isAdminRole(role.permissions);
  }
  if (losesAdmin && (await UserOrganizationRepository.countActiveAdmins(tx)) <= 1) {
    throw AppError.badRequest('An organization needs at least one active admin', 'LAST_ADMIN');
  }
}

/** Email and phone are unique across the whole platform. */
async function assertIdentityAvailable(email: string | undefined, phone: string | undefined, excludeId?: string) {
  if (!email && !phone) return;
  const clash = await asPlatform('users: global uniqueness check', (db) =>
    UserRepository.findByEmailOrPhone(db, email ?? '', phone ?? '', excludeId),
  );
  if (clash) {
    throw clash.email === email
      ? AppError.conflict('User with this email already exists', 'EMAIL_TAKEN')
      : AppError.conflict('User with this phone number already exists', 'PHONE_TAKEN');
  }
}

/** Profile fields of a person in several orgs may only be edited by that person. */
async function assertMayEditIdentity(targetUserId: string, actorUserId: string | undefined) {
  if (targetUserId === actorUserId) return;
  const orgs = await asPlatform('users: shared account check', (db) =>
    UserOrganizationRepository.countOrgsForUser(db, targetUserId),
  );
  if (orgs > 1) {
    throw AppError.forbidden(
      'This person also works at another organization; only they can change their profile details',
      'SHARED_ACCOUNT',
    );
  }
}

class ClientUserService {
  list = (tenant: TenantContext, q: MemberQuery) =>
    withTenant(tenant, async (tx) => {
      const { items, total } = await UserOrganizationRepository.list(
        tx,
        { ...(q.role && { roleId: q.role }), ...(q.status && { status: q.status }), ...(q.search && { search: q.search }) },
        { skip: (q.page - 1) * q.limit, take: q.limit },
        { field: q.sortBy, dir: q.sortOrder },
      );
      return {
        members: items.map((m) => memberToApi(m)),
        pagination: paginationMeta(q.page, q.limit, total),
        stats: await this.stats(tx),
      };
    });

  private stats = async (tx: TenantTx) => {
    const { rows, roles } = await UserOrganizationRepository.statsByRole(tx);
    const roleName = new Map(roles.map((r) => [r.id, r.name]));
    const byRole: Record<string, { total: number; active: number }> = {};
    let total = 0;
    let active = 0;
    for (const row of rows) {
      const name = roleName.get(row.roleId) ?? 'unknown';
      const entry = (byRole[name] ??= { total: 0, active: 0 });
      entry.total += row._count._all;
      total += row._count._all;
      if (row.status === 'Active') {
        entry.active += row._count._all;
        active += row._count._all;
      }
    }
    return { total, active, inactive: total - active, byRole };
  };

  get = (tenant: TenantContext, userId: string) =>
    withTenant(tenant, async (tx) => memberToApi(await requireMember(tx, tenant.orgId, userId)));

  listByRole = (tenant: TenantContext, roleId: string, status: ActiveStatus | 'all') =>
    withTenant(tenant, async (tx) => {
      const members = await UserOrganizationRepository.listByRole(tx, roleId, status === 'all' ? undefined : status);
      return members.map((m) => memberToApi(m));
    });

  create = async (tenant: TenantContext, input: CreateMemberInput) => {
    await assertIdentityAvailable(input.email, input.number);
    const passwordHash = await hashPassword(input.password);

    return withTenant(tenant, async (tx) => {
      const role = UUID.test(input.role)
        ? await RoleRepository.findById(tx, input.role)
        : await RoleRepository.findByName(tx, tenant.orgId, input.role);
      if (!role) {
        throw AppError.badRequest(`Role '${input.role}' does not exist. Create it first or use an existing role.`, 'ROLE_NOT_FOUND');
      }
      const userId = await UserRepository.create(tx, {
        firstName: input.firstName,
        lastName: input.lastName,
        email: input.email,
        phone: input.number,
        address: input.address,
        passwordHash,
      });
      const member = await UserOrganizationRepository.create(tx, {
        orgId: tenant.orgId,
        userId,
        roleId: role.id,
        ...(input.branchIds && { branchIds: input.branchIds }),
      });
      await recordAudit(tx, tenant, { action: 'staff.create', targetType: 'user', targetId: userId, after: { email: input.email, role: role.name } });
      return memberToApi(member);
    });
  };

  update = async (tenant: TenantContext, userId: string, input: UpdateMemberInput, image?: Buffer) => {
    const touchesIdentity = IDENTITY_FIELDS.some((f) => input[f] !== undefined) || image !== undefined;
    if (touchesIdentity) await assertMayEditIdentity(userId, tenant.userId);
    if (userId === tenant.userId && (input.status === 'Inactive' || input.role)) {
      throw AppError.badRequest('You cannot change your own role or deactivate yourself', 'SELF_LOCKOUT');
    }
    await assertIdentityAvailable(input.email, input.number, userId);

    const current = await withTenant(tenant, (tx) => requireMember(tx, tenant.orgId, userId));
    const uploaded = image ? await ImageService.upload(tenant.orgId, 'users', image) : undefined;

    const updated = await withTenant(tenant, async (tx) => {
      const member = await requireMember(tx, tenant.orgId, userId);
      await assertKeepsAnAdmin(tx, member, {
        ...(input.status && { status: input.status }),
        ...(input.role && { roleId: input.role }),
      });
      if (touchesIdentity) {
        await UserRepository.update(tx, userId, {
          ...(input.firstName && { firstName: input.firstName }),
          ...(input.lastName && { lastName: input.lastName }),
          ...(input.email && { email: input.email }),
          ...(input.number && { phone: input.number }),
          ...(input.address && { address: input.address }),
          ...(uploaded && { image: uploaded.url, imageId: uploaded.publicId }),
        });
      }
      const next = await UserOrganizationRepository.update(tx, member.id, {
        ...(input.role && { roleId: input.role }),
        ...(input.status && { status: input.status }),
      });
      if (input.role || input.status || touchesIdentity) {
        await recordAudit(tx, tenant, {
          action: 'staff.update',
          targetType: 'user',
          targetId: userId,
          before: { role: member.role.name, status: member.status },
          after: { role: next.role.name, status: next.status, ...(touchesIdentity && { profileChanged: true }) },
        });
      }
      return next;
    });

    if (uploaded) await ImageService.remove(current.user.imageId);
    return memberToApi(updated);
  };

  updateStatus = (tenant: TenantContext, userId: string, status: ActiveStatus) => {
    if (userId === tenant.userId && status === 'Inactive') {
      throw AppError.badRequest('You cannot deactivate yourself', 'SELF_LOCKOUT');
    }
    return withTenant(tenant, async (tx) => {
      const member = await requireMember(tx, tenant.orgId, userId);
      await assertKeepsAnAdmin(tx, member, { status });
      const updated = await UserOrganizationRepository.update(tx, member.id, { status });
      await recordAudit(tx, tenant, { action: 'staff.status', targetType: 'user', targetId: userId, before: { status: member.status }, after: { status } });
      return memberToApi(updated);
    });
  };

  /** Removes the person from this org; the account itself goes once no org uses it. */
  remove = async (tenant: TenantContext, userId: string) => {
    if (userId === tenant.userId) throw AppError.badRequest('You cannot remove yourself', 'SELF_LOCKOUT');
    const member = await withTenant(tenant, async (tx) => {
      const m = await requireMember(tx, tenant.orgId, userId);
      await assertKeepsAnAdmin(tx, m, { status: 'Inactive' });
      await UserOrganizationRepository.delete(tx, m.id);
      await recordAudit(tx, tenant, { action: 'staff.remove', targetType: 'user', targetId: userId, before: { email: m.user.email, role: m.role.name } });
      return m;
    });

    const deletedAccount = await asPlatform('users: delete orphaned account', async (db) => {
      if ((await UserOrganizationRepository.countOrgsForUser(db, userId)) > 0) return false;
      await UserRepository.delete(db, userId);
      return true;
    });
    if (deletedAccount) await ImageService.remove(member.user.imageId);

    return {
      deletedUser: { id: userId, name: `${member.user.firstName} ${member.user.lastName}`, email: member.user.email },
      accountDeleted: deletedAccount,
    };
  };

  // ── Self-service ──────────────────────────────────────────────────────────

  getProfile = (tenant: TenantContext) => this.get(tenant, tenant.userId!);

  updateProfile = async (tenant: TenantContext, input: UpdateProfileInput, image?: Buffer) => {
    const userId = tenant.userId!;
    await assertIdentityAvailable(undefined, input.number, userId);
    const uploaded = image ? await ImageService.upload(tenant.orgId, 'users', image) : undefined;
    const { member, oldImageId } = await withTenant(tenant, async (tx) => {
      const before = await requireMember(tx, tenant.orgId, userId);
      await UserRepository.update(tx, userId, {
        ...(input.firstName && { firstName: input.firstName }),
        ...(input.lastName && { lastName: input.lastName }),
        ...(input.address && { address: input.address }),
        ...(input.number && { phone: input.number }),
        ...(uploaded && { image: uploaded.url, imageId: uploaded.publicId }),
      });
      return { member: await requireMember(tx, tenant.orgId, userId), oldImageId: before.user.imageId };
    });
    if (uploaded) await ImageService.remove(oldImageId);
    return memberToApi(member);
  };

  /** PATCH /users/:id/password: only ever your own password. */
  changeOwnPassword = async (tenant: TenantContext, userId: string, currentPassword: string, newPassword: string) => {
    if (userId !== tenant.userId) throw AppError.forbidden('You can only change your own password', 'NOT_SELF');
    await withTenant(tenant, async (tx) => {
      const user = await UserRepository.findById(tx, userId);
      if (!user || !(await verifyPassword(currentPassword, user.passwordHash))) {
        throw AppError.badRequest('Current password is incorrect', 'WRONG_PASSWORD');
      }
      await UserRepository.update(tx, userId, {
        passwordHash: await hashPassword(newPassword),
        passwordChangedAt: new Date(),
        mustChangePassword: false,
      });
    });
  };

  resetMemberPassword = (tenant: TenantContext, userId: string) =>
    PasswordService.generateTemporaryPassword(tenant, userId);
}

export default new ClientUserService();
