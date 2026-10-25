// src/services/approval/approval.service.ts
// Manager PIN approvals: a cashier asks, a manager types their PIN on the
// cashier's screen, and the cashier gets a 5-minute token for that one action.
import { withTenant, type TenantContext, type TenantTx } from '../../config/prisma.js';
import { hasPermission, type Permission } from '../../constants/permissions.js';
import type { RequestUser } from '../../Interface/GlobalInterface.js';
import UserOrganizationRepository from '../../repository/userOrganization.repository.js';
import UserRepository from '../../repository/user.repository.js';
import { AppError } from '../../utils/AppError.js';
import { hashPassword, verifyPassword } from '../../utils/Helpers.js';
import { signApprovalToken, verifyApprovalToken } from '../../utils/tokens.js';
import type { ApprovablePermission, RequestApprovalInput } from '../../validators/approval.schema.js';
import { recordAudit, recordAuditDetached } from '../audit/audit.service.js';

/**
 * The actor may do `perm` themselves, or brings a token from someone who can.
 * Returns the approver's user id when a token was used.
 * ponytail: a token can be replayed within its 5 minutes on the same target;
 * add a used-jti table if that matters (refunds stay capped by what's left).
 */
export function requireApproval(
  tenant: TenantContext,
  actor: RequestUser,
  perm: ApprovablePermission,
  targetId: string,
  approvalToken: string | undefined,
): string | undefined {
  if (hasPermission(actor.role.permissions, perm)) return undefined;
  if (!approvalToken) {
    throw AppError.forbidden('This needs a manager\'s approval', 'APPROVAL_REQUIRED', { permission: perm });
  }
  const t = verifyApprovalToken(approvalToken);
  if (t.orgId !== tenant.orgId || t.requestedBy !== actor.id || t.permission !== perm || (t.targetId && t.targetId !== targetId)) {
    throw AppError.forbidden('That approval was given for something else', 'APPROVAL_MISMATCH');
  }
  return t.approverId;
}

class ClientApprovalService {
  request = async (tenant: TenantContext, actor: RequestUser, input: RequestApprovalInput) => {
    const denied = (reason: string) => {
      recordAuditDetached(tenant, { action: 'approval.denied', targetType: 'approval', ...(input.targetId && { targetId: input.targetId }), after: { permission: input.permission, approverEmail: input.approverEmail, reason } });
      // One message for every failure, so the form doesn't reveal who has a PIN.
      return AppError.forbidden('Approval denied: check the email and PIN', 'APPROVAL_DENIED');
    };

    return withTenant(tenant, async (tx) => {
      const approver = await UserOrganizationRepository.findMemberByEmail(tx, input.approverEmail);
      if (!approver || approver.status !== 'Active' || !approver.pinHash) throw denied('unknown approver or no PIN set');
      if (approver.userId === actor.id) throw denied('cannot approve your own request');
      if (!(await verifyPassword(input.pin, approver.pinHash))) throw denied('wrong PIN');
      if (!hasPermission(approver.role.permissions, input.permission as Permission)) throw denied('approver lacks permission');

      await recordAudit(tx, tenant, {
        action: 'approval.granted',
        targetType: 'approval',
        ...(input.targetId && { targetId: input.targetId }),
        after: { permission: input.permission },
        approvedBy: approver.userId,
      });
      return {
        approvalToken: signApprovalToken({
          orgId: tenant.orgId,
          approverId: approver.userId,
          requestedBy: actor.id,
          permission: input.permission,
          targetId: input.targetId ?? null,
        }),
        approver: { id: approver.userId, firstName: approver.user.firstName, lastName: approver.user.lastName },
        expiresIn: '5m',
      };
    });
  };

  /** Set or change your own approval PIN (re-enter your password to do it). */
  setPin = (tenant: TenantContext, pin: string, currentPassword: string) =>
    withTenant(tenant, async (tx: TenantTx) => {
      const userId = tenant.userId!;
      const user = await UserRepository.findById(tx, userId);
      if (!user || !(await verifyPassword(currentPassword, user.passwordHash))) {
        throw AppError.badRequest('Current password is incorrect', 'WRONG_PASSWORD');
      }
      const member = await UserOrganizationRepository.findMember(tx, tenant.orgId, userId);
      if (!member) throw AppError.notFound('Membership not found');
      await UserOrganizationRepository.setPin(tx, member.id, await hashPassword(pin));
      await recordAudit(tx, tenant, { action: 'approval.pin_set', targetType: 'user', targetId: userId });
      return { hasPin: true };
    });
}

export default new ClientApprovalService();
