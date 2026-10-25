// src/services/audit/audit.service.ts
// Append-only audit trail (the app role cannot UPDATE or DELETE audit_logs).
// recordAudit() runs inside the caller's transaction, so an entry exists
// exactly when the change it describes was committed.
import type { Prisma } from '@prisma/client';

import { withTenant, type TenantContext, type TenantTx } from '../../config/prisma.js';
import AuditRepository, { type IAuditFilters } from '../../repository/audit.repository.js';
import { paginationMeta } from '../../utils/Helpers.js';
import { logger } from '../../utils/logger.js';

export interface AuditEntry {
  /** 'resource.verb', e.g. 'payment.refund', 'role.update', 'permission.denied'. */
  action: string;
  targetType?: string;
  targetId?: string;
  before?: unknown;
  after?: unknown;
  /** Who else signed off, e.g. the manager whose PIN approved a refund. */
  approvedBy?: string;
}

const json = (v: unknown) => (v === undefined ? undefined : (JSON.parse(JSON.stringify(v)) as Prisma.InputJsonValue));

export async function recordAudit(tx: TenantTx, tenant: TenantContext, e: AuditEntry) {
  await AuditRepository.create(tx, {
    orgId: tenant.orgId,
    actorUserId: tenant.userId ?? null,
    action: e.action,
    targetType: e.targetType ?? null,
    targetId: e.targetId ?? null,
    ...(e.before !== undefined && { before: json(e.before) }),
    ...((e.after !== undefined || e.approvedBy) && { after: json({ ...(e.after as object), ...(e.approvedBy && { approvedBy: e.approvedBy }) }) }),
    ip: tenant.ip ?? null,
  });
}

/** For events outside a business transaction (permission denials). Never throws. */
export function recordAuditDetached(tenant: TenantContext, e: AuditEntry) {
  withTenant(tenant, (tx) => recordAudit(tx, tenant, e)).catch((err: unknown) =>
    logger.warn(`audit write failed: ${(err as Error).message}`),
  );
}

class ClientAuditService {
  list = (tenant: TenantContext, f: IAuditFilters, page: number, limit: number) =>
    withTenant(tenant, async (tx) => {
      const { items, total } = await AuditRepository.list(tx, f, { skip: (page - 1) * limit, take: limit });
      // Actors are org members, so RLS lets us read their names.
      const ids = [...new Set(items.map((i) => i.actorUserId).filter((x): x is string => !!x))];
      const users = ids.length
        ? await tx.user.findMany({ where: { id: { in: ids } }, select: { id: true, firstName: true, lastName: true, email: true } })
        : [];
      const byId = new Map(users.map((u) => [u.id, u]));
      return {
        entries: items.map((i) => {
          const actor = i.actorUserId ? byId.get(i.actorUserId) : undefined;
          return {
            id: i.id,
            _id: i.id,
            action: i.action,
            targetType: i.targetType,
            targetId: i.targetId,
            before: i.before,
            after: i.after,
            ip: i.ip,
            actor: actor ? { id: actor.id, firstName: actor.firstName, lastName: actor.lastName, email: actor.email } : null,
            createdAt: i.createdAt,
          };
        }),
        pagination: paginationMeta(page, limit, total),
      };
    });
}

export default new ClientAuditService();
