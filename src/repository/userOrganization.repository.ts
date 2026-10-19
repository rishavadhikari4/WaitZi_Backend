// src/repository/userOrganization.repository.ts
// Memberships: a user's place (role, status, branches) in one organization.
import type { ActiveStatus, Prisma } from '@prisma/client';

import type { DBClient, TenantTx } from '../config/prisma.js';
import { inOrder } from '../utils/Helpers.js';

export const memberInclude = {
  user: true,
  role: { select: { id: true, name: true, description: true, permissions: true } },
} satisfies Prisma.MembershipInclude;

export type MemberRow = Prisma.MembershipGetPayload<{ include: typeof memberInclude }>;

export interface IMemberFilters {
  roleId?: string;
  status?: ActiveStatus;
  search?: string;
}

const SORTABLE = ['firstName', 'lastName', 'email', 'createdAt', 'updatedAt'] as const;
export type MemberSortField = (typeof SORTABLE)[number] | 'status';

function where(filters: IMemberFilters): Prisma.MembershipWhereInput {
  return {
    ...(filters.roleId && { roleId: filters.roleId }),
    ...(filters.status && { status: filters.status }),
    ...(filters.search && {
      user: {
        OR: [
          { firstName: { contains: filters.search, mode: 'insensitive' } },
          { lastName: { contains: filters.search, mode: 'insensitive' } },
          { email: { contains: filters.search, mode: 'insensitive' } },
          { phone: { contains: filters.search } },
        ],
      },
    }),
  };
}

function orderBy(field: MemberSortField, dir: 'asc' | 'desc'): Prisma.MembershipOrderByWithRelationInput {
  if (field === 'status') return { status: dir };
  if (field === 'createdAt') return { createdAt: dir };
  return { user: { [field]: dir } };
}

class UserOrganizationRepository {
  findMember(tx: TenantTx, orgId: string, userId: string) {
    return tx.membership.findUnique({ where: { orgId_userId: { orgId, userId } }, include: memberInclude });
  }

  async list(
    tx: TenantTx,
    filters: IMemberFilters,
    page: { skip: number; take: number },
    sort: { field: MemberSortField; dir: 'asc' | 'desc' },
  ) {
    const w = where(filters);
    const [items, total] = await inOrder(
      () => tx.membership.findMany({ where: w, include: memberInclude, orderBy: orderBy(sort.field, sort.dir), ...page }),
      () => tx.membership.count({ where: w }),
    );
    return { items, total };
  }

  listByRole(tx: TenantTx, roleId: string, status?: ActiveStatus) {
    return tx.membership.findMany({
      where: { roleId, ...(status && { status }) },
      include: memberInclude,
      orderBy: [{ user: { firstName: 'asc' } }, { user: { lastName: 'asc' } }],
    });
  }

  async statsByRole(tx: TenantTx) {
    const rows = await tx.membership.groupBy({ by: ['roleId', 'status'], _count: { _all: true } });
    const roles = await tx.role.findMany({ select: { id: true, name: true } });
    return { rows, roles };
  }

  create(tx: TenantTx, data: { orgId: string; userId: string; roleId: string; branchIds?: string[] }) {
    return tx.membership.create({ data, include: memberInclude });
  }

  update(tx: TenantTx, id: string, data: Prisma.MembershipUncheckedUpdateInput) {
    return tx.membership.update({ where: { id }, data, include: memberInclude });
  }

  delete(tx: TenantTx, id: string) {
    return tx.membership.delete({ where: { id } });
  }

  countByRole(tx: TenantTx, roleId: string) {
    return tx.membership.count({ where: { roleId } });
  }

  /** Active members whose role has full access ('*'): the org's admins. */
  countActiveAdmins(tx: TenantTx) {
    return tx.membership.count({ where: { status: 'Active', role: { permissions: { has: '*' } } } });
  }

  /** All memberships of a user across orgs (platform client: used at login). */
  listForUser(db: DBClient, userId: string) {
    return db.membership.findMany({
      where: { userId, status: 'Active', org: { status: { not: 'suspended' } } },
      include: { ...memberInclude, org: { select: { id: true, name: true, slug: true } } },
      orderBy: { createdAt: 'asc' },
    });
  }

  /** How many orgs this user belongs to (platform client). */
  countOrgsForUser(db: DBClient, userId: string) {
    return db.membership.count({ where: { userId } });
  }
}

export default new UserOrganizationRepository();
