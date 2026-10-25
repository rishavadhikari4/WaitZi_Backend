// src/repository/order.repository.ts
import type { OrderItemStatus, OrderStatus, Prisma } from '@prisma/client';

import type { DBClient, TenantTx } from '../config/prisma.js';
import { inOrder } from '../utils/Helpers.js';

const person = { select: { id: true, firstName: true, lastName: true } } as const;

export const orderInclude = {
  table: { select: { id: true, tableNumber: true, capacity: true, status: true, assignedWaiterId: true } },
  items: {
    orderBy: { id: 'asc' },
    include: { menuItem: { select: { id: true, name: true, categoryId: true, image: true, description: true } } },
  },
  assignedWaiter: person,
  cookedBy: person,
  servedBy: person,
} satisfies Prisma.OrderInclude;

export type OrderRow = Prisma.OrderGetPayload<{ include: typeof orderInclude }>;

/** Orders still occupying the kitchen or the table. */
export const ACTIVE_STATUSES: OrderStatus[] = ['Pending', 'InKitchen', 'Served'];

export interface IOrderFilters {
  status?: OrderStatus;
  statuses?: OrderStatus[];
  tableId?: string;
  from?: Date;
  to?: Date;
  branchIds?: string[];
  /** Orders assigned to this waiter, or placed at a table assigned to them. */
  waiterId?: string;
}

function where(f: IOrderFilters): Prisma.OrderWhereInput {
  return {
    ...(f.status ? { status: f.status } : f.statuses ? { status: { in: f.statuses } } : {}),
    ...(f.tableId && { tableId: f.tableId }),
    ...((f.from || f.to) && { createdAt: { ...(f.from && { gte: f.from }), ...(f.to && { lte: f.to }) } }),
    ...(f.branchIds?.length && { branchId: { in: f.branchIds } }),
    ...(f.waiterId && { OR: [{ assignedWaiterId: f.waiterId }, { table: { assignedWaiterId: f.waiterId } }] }),
  };
}

class OrderRepository {
  async list(tx: TenantTx, f: IOrderFilters, page: { skip: number; take: number }, orderBy: Prisma.OrderOrderByWithRelationInput) {
    const w = where(f);
    const [items, total] = await inOrder(
      () => tx.order.findMany({ where: w, include: orderInclude, orderBy, ...page }),
      () => tx.order.count({ where: w }),
    );
    return { items, total };
  }

  find(tx: TenantTx, f: IOrderFilters, orderBy: Prisma.OrderOrderByWithRelationInput) {
    return tx.order.findMany({ where: where(f), include: orderInclude, orderBy });
  }

  findById(tx: TenantTx, id: string) {
    return tx.order.findUnique({ where: { id }, include: orderInclude });
  }

  recent(tx: TenantTx, take: number) {
    return tx.order.findMany({ include: orderInclude, orderBy: { createdAt: 'desc' }, take });
  }

  /** Row lock so concurrent status changes on one order serialize. */
  async lock(tx: TenantTx, id: string) {
    await tx.$queryRaw`SELECT id FROM orders WHERE id = ${id}::uuid FOR UPDATE`;
  }

  findRecentForCustomer(tx: TenantTx, tableId: string, customerName: string, since: Date) {
    return tx.order.findFirst({
      where: {
        tableId,
        customerName: { equals: customerName, mode: 'insensitive' },
        createdAt: { gte: since },
        status: { notIn: ['Cancelled', 'Completed'] },
      },
      include: orderInclude,
    });
  }

  countKitchenLoad(tx: TenantTx, branchId: string) {
    return tx.order.count({ where: { branchId, status: { in: ['Pending', 'InKitchen'] } } });
  }

  activeOrdersPerWaiter(tx: TenantTx, waiterIds: string[]) {
    return tx.order.groupBy({
      by: ['assignedWaiterId'],
      where: { assignedWaiterId: { in: waiterIds }, status: { in: ['Pending', 'InKitchen'] } },
      _count: { _all: true },
    });
  }

  create(tx: TenantTx, data: Prisma.OrderUncheckedCreateInput) {
    return tx.order.create({ data, include: orderInclude });
  }

  update(tx: TenantTx, id: string, data: Prisma.OrderUncheckedUpdateInput) {
    return tx.order.update({ where: { id }, data, include: orderInclude });
  }

  updateItem(tx: TenantTx, itemId: string, data: { status: OrderItemStatus; notes?: string }) {
    return tx.orderItem.update({ where: { id: itemId }, data });
  }

  async stats(tx: TenantTx, startOfToday: Date, scope: Pick<IOrderFilters, 'branchIds' | 'waiterId'> = {}) {
    const base = where(scope);
    const paid: Prisma.OrderWhereInput = { ...base, status: { in: ['Paid', 'Completed'] } };
    const [total, today, byStatus, revenueToday, revenueTotal] = await inOrder(
      () => tx.order.count({ where: base }),
      () => tx.order.count({ where: { ...base, createdAt: { gte: startOfToday } } }),
      () => tx.order.groupBy({ by: ['status'], where: base, _count: { _all: true } }),
      () => tx.order.aggregate({ where: { ...paid, createdAt: { gte: startOfToday } }, _sum: { finalPaisa: true } }),
      () => tx.order.aggregate({ where: paid, _sum: { finalPaisa: true } }),
    );
    return {
      total,
      today,
      byStatus,
      revenueTodayPaisa: revenueToday._sum.finalPaisa ?? 0,
      revenueTotalPaisa: revenueTotal._sum.finalPaisa ?? 0,
    };
  }

  // ── Timeout sweep (platform client: runs across every org) ────────────────

  /**
   * Cancel Pending orders whose timeout has passed and free their tables, in
   * one statement. SKIP LOCKED lets several server processes sweep safely.
   */
  expirePending(db: DBClient) {
    return db.$queryRaw<{ id: string; org_id: string; table_id: string }[]>`
      WITH expired AS (
        SELECT id FROM orders
        WHERE status = 'Pending' AND order_timeout < now()
        FOR UPDATE SKIP LOCKED
      ), cancelled AS (
        UPDATE orders o
        SET status = 'Cancelled', is_timed_out = true,
            note = concat_ws(E'\\n', nullif(o.note, ''), '[AUTO-CANCELLED: not accepted in time]'),
            updated_at = now()
        FROM expired e WHERE o.id = e.id
        RETURNING o.id, o.org_id, o.table_id
      ), freed AS (
        UPDATE dining_tables t
        SET status = 'Available', current_order_id = NULL, updated_at = now()
        FROM cancelled c WHERE t.current_order_id = c.id
      )
      SELECT id::text, org_id::text, table_id::text FROM cancelled`;
  }
}

export default new OrderRepository();
