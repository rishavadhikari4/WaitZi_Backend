// src/repository/diningTable.repository.ts
import type { Prisma, TableStatus } from '@prisma/client';

import type { DBClient, TenantTx } from '../config/prisma.js';

export const tableInclude = {
  assignedWaiter: { select: { id: true, firstName: true, lastName: true, email: true } },
  currentOrder: {
    select: {
      id: true,
      customerName: true,
      totalPaisa: true,
      finalPaisa: true,
      status: true,
      createdAt: true,
      items: { select: { id: true, name: true, quantity: true, pricePaisa: true, status: true } },
    },
  },
} satisfies Prisma.DiningTableInclude;

export type TableRow = Prisma.DiningTableGetPayload<{ include: typeof tableInclude }>;

export interface ITableFilters {
  status?: TableStatus;
  capacity?: number;
  assignedWaiterId?: string;
  branchIds?: string[];
}

class DiningTableRepository {
  async list(
    tx: TenantTx,
    filters: ITableFilters,
    page: { skip: number; take: number },
    orderBy: Prisma.DiningTableOrderByWithRelationInput,
  ) {
    const where = this.where(filters);
    const [items, total] = await Promise.all([
      tx.diningTable.findMany({ where, include: tableInclude, orderBy, ...page }),
      tx.diningTable.count({ where }),
    ]);
    return { items, total };
  }

  async stats(tx: TenantTx, branchIds?: string[]) {
    const where = this.where({ ...(branchIds && { branchIds }) });
    const [byStatus, totals] = await Promise.all([
      tx.diningTable.groupBy({ by: ['status'], where, _count: { _all: true } }),
      tx.diningTable.aggregate({ where, _count: { _all: true }, _sum: { capacity: true } }),
    ]);
    return { byStatus, total: totals._count._all, totalCapacity: totals._sum.capacity ?? 0 };
  }

  private where(f: ITableFilters): Prisma.DiningTableWhereInput {
    return {
      ...(f.status && { status: f.status }),
      ...(f.capacity !== undefined && { capacity: f.capacity }),
      ...(f.assignedWaiterId && { assignedWaiterId: f.assignedWaiterId }),
      ...(f.branchIds?.length && { branchId: { in: f.branchIds } }),
    };
  }

  findById(tx: TenantTx, id: string) {
    return tx.diningTable.findUnique({ where: { id }, include: tableInclude });
  }

  findByNumber(tx: TenantTx, branchId: string, tableNumber: number) {
    return tx.diningTable.findUnique({
      where: { branchId_tableNumber: { branchId, tableNumber } },
      include: tableInclude,
    });
  }

  listAllOrdered(tx: TenantTx, branchIds?: string[]) {
    return tx.diningTable.findMany({
      where: this.where({ ...(branchIds && { branchIds }) }),
      orderBy: [{ branchId: 'asc' }, { tableNumber: 'asc' }],
    });
  }

  create(tx: TenantTx, data: Prisma.DiningTableUncheckedCreateInput) {
    return tx.diningTable.create({ data, include: tableInclude });
  }

  update(tx: TenantTx, id: string, data: Prisma.DiningTableUncheckedUpdateInput) {
    return tx.diningTable.update({ where: { id }, data, include: tableInclude });
  }

  delete(tx: TenantTx, id: string) {
    return tx.diningTable.delete({ where: { id } });
  }

  orderStats(tx: TenantTx, tableId: string) {
    return tx.order.aggregate({ where: { tableId }, _count: { _all: true }, _max: { createdAt: true } });
  }

  // ── Guest lookups (platform client: the tenant is not known yet) ──────────
  // Only the ids come back; the caller then reads everything else through
  // withTenant() for that org.

  findOrgByQrToken(db: DBClient, qrToken: string) {
    return db.diningTable.findUnique({ where: { qrToken }, select: { id: true, orgId: true } });
  }

  findOrgById(db: DBClient, id: string) {
    return db.diningTable.findUnique({ where: { id }, select: { id: true, orgId: true } });
  }

  findOrgByLegacyId(db: DBClient, legacyId: string) {
    return db.diningTable.findUnique({ where: { legacyId }, select: { id: true, orgId: true } });
  }

  /** Number-only links (old QR stickers) within one org's single/first branch. */
  async findOrgByNumber(db: DBClient, orgId: string, tableNumber: number) {
    return db.diningTable.findFirst({
      where: { orgId, tableNumber },
      orderBy: { branch: { createdAt: 'asc' } },
      select: { id: true, orgId: true },
    });
  }
}

export default new DiningTableRepository();
