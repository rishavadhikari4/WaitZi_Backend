// src/repository/audit.repository.ts
import type { Prisma } from '@prisma/client';

import type { TenantTx } from '../config/prisma.js';
import { inOrder } from '../utils/Helpers.js';

export interface IAuditFilters {
  action?: string;
  actorUserId?: string;
  targetType?: string;
  targetId?: string;
  from?: Date;
  to?: Date;
}

class AuditRepository {
  create(tx: TenantTx, data: Prisma.AuditLogUncheckedCreateInput) {
    return tx.auditLog.create({ data });
  }

  async list(tx: TenantTx, f: IAuditFilters, page: { skip: number; take: number }) {
    const where: Prisma.AuditLogWhereInput = {
      // 'payment.' matches every payment action.
      ...(f.action && (f.action.endsWith('.') ? { action: { startsWith: f.action } } : { action: f.action })),
      ...(f.actorUserId && { actorUserId: f.actorUserId }),
      ...(f.targetType && { targetType: f.targetType }),
      ...(f.targetId && { targetId: f.targetId }),
      ...((f.from || f.to) && { createdAt: { ...(f.from && { gte: f.from }), ...(f.to && { lte: f.to }) } }),
    };
    const [items, total] = await inOrder(
      () => tx.auditLog.findMany({ where, orderBy: { createdAt: 'desc' }, ...page }),
      () => tx.auditLog.count({ where }),
    );
    return { items, total };
  }
}

export default new AuditRepository();
