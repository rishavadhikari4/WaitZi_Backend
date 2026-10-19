// src/services/order/shared/order.core.ts
// Order logic shared by guest (QR) and staff ordering. Everything here runs
// inside the caller's withTenant() transaction.
import type { DiningTable, Prisma } from '@prisma/client';

import config from '../../../config/config.js';
import type { TenantTx } from '../../../config/prisma.js';
import { ALL } from '../../../constants/permissions.js';
import OrderRepository, { type OrderRow } from '../../../repository/order.repository.js';
import { AppError } from '../../../utils/AppError.js';
import type { OrderLineInput } from '../../../validators/order.schema.js';
import { inOrder } from '../../../utils/Helpers.js';

/**
 * Price lines from the live menu and snapshot name + price onto the order, so
 * later menu edits never rewrite history. Unknown or unavailable items fail
 * the whole order with a per-line reason.
 */
export async function priceLines(tx: TenantTx, orgId: string, lines: OrderLineInput[]) {
  const ids = [...new Set(lines.map((l) => l.menuItem))];
  const menu = new Map(
    (await tx.menuItem.findMany({ where: { id: { in: ids } }, include: { category: { select: { isActive: true } } } })).map(
      (m) => [m.id, m],
    ),
  );

  const errors: string[] = [];
  const items: Prisma.OrderItemCreateManyOrderInput[] = [];
  lines.forEach((line, i) => {
    const m = menu.get(line.menuItem);
    if (!m) return errors.push(`Item ${i + 1}: Menu item not found`);
    if (m.availabilityStatus !== 'Available' || !m.category.isActive) {
      return errors.push(`Item ${i + 1}: ${m.name} is currently out of stock`);
    }
    items.push({
      orgId,
      menuItemId: m.id,
      name: m.name,
      quantity: line.quantity,
      pricePaisa: m.pricePaisa,
      subtotalPaisa: m.pricePaisa * line.quantity,
      notes: line.notes ?? '',
    });
    return undefined;
  });
  if (errors.length) throw AppError.badRequest('Invalid items found', 'INVALID_ITEMS', { errors });

  return { items, totalPaisa: items.reduce((sum, i) => sum + i.subtotalPaisa, 0) };
}

/**
 * The table's own waiter, otherwise the least busy active member who serves
 * tables at that branch. (The old code picked any non-admin user, chefs and
 * cashiers included.)
 */
async function pickWaiter(tx: TenantTx, table: DiningTable): Promise<string | null> {
  if (table.assignedWaiterId) return table.assignedWaiterId;

  const servers = await tx.membership.findMany({
    where: {
      status: 'Active',
      user: { status: 'Active' },
      role: { permissions: { has: 'order.serve' }, NOT: { permissions: { has: ALL } } },
      OR: [{ branchIds: { isEmpty: true } }, { branchIds: { has: table.branchId } }],
    },
    select: { userId: true, role: { select: { name: true } } },
  });
  if (!servers.length) return null;

  const load = new Map(
    (await OrderRepository.activeOrdersPerWaiter(tx, servers.map((s) => s.userId))).map((r) => [r.assignedWaiterId, r._count._all]),
  );
  // Prefer people whose job is waiting tables, then whoever is least busy.
  servers.sort(
    (a, b) =>
      Number(b.role.name === 'waiter') - Number(a.role.name === 'waiter') ||
      (load.get(a.userId) ?? 0) - (load.get(b.userId) ?? 0),
  );
  return servers[0]!.userId;
}

export interface CreateOrderArgs {
  orgId: string;
  table: DiningTable;
  customerName: string;
  lines: OrderLineInput[];
  note?: string | undefined;
  discountPaisa?: number;
}

export async function createOrderTx(tx: TenantTx, args: CreateOrderArgs): Promise<OrderRow> {
  const { orgId, table } = args;

  const since = new Date(Date.now() - config.orders.duplicateWindowMinutes * 60_000);
  const duplicate = await OrderRepository.findRecentForCustomer(tx, table.id, args.customerName, since);
  if (duplicate) {
    throw AppError.conflict('A recent order already exists for this customer on this table', 'DUPLICATE_ORDER', {
      existingOrderId: duplicate.id,
    });
  }

  const load = await OrderRepository.countKitchenLoad(tx, table.branchId);
  if (load >= config.orders.kitchenCapacity) {
    throw new AppError('Kitchen is at full capacity. Please try again shortly.', 503, 'KITCHEN_FULL', {
      data: { activeOrders: load, maxCapacity: config.orders.kitchenCapacity },
    });
  }

  const { items, totalPaisa } = await priceLines(tx, orgId, args.lines);
  const discountPaisa = args.discountPaisa ?? 0;
  if (discountPaisa > totalPaisa) throw AppError.badRequest('Discount cannot exceed the order total', 'DISCOUNT_TOO_LARGE');

  const waiterId = await pickWaiter(tx, table);
  const order = await OrderRepository.create(tx, {
    orgId,
    branchId: table.branchId,
    tableId: table.id,
    customerName: args.customerName,
    note: args.note ?? '',
    totalPaisa,
    discountPaisa,
    finalPaisa: totalPaisa - discountPaisa,
    orderTimeout: new Date(Date.now() + config.orders.timeoutMinutes * 60_000),
    assignedWaiterId: waiterId,
    items: { createMany: { data: items } },
  });

  await tx.diningTable.update({
    where: { id: table.id },
    data: { status: 'Occupied', currentOrderId: order.id, ...(waiterId && { assignedWaiterId: waiterId }) },
  });
  return order;
}

/** Free the table if this order is the one occupying it. */
export async function releaseTable(tx: TenantTx, order: { id: string; tableId: string }) {
  await tx.diningTable.updateMany({
    where: { id: order.tableId, currentOrderId: order.id },
    data: { status: 'Available', currentOrderId: null },
  });
}

/** Recompute totals after items change; discount is kept. */
export async function recomputeTotals(tx: TenantTx, orderId: string) {
  const [sum, order] = await inOrder(
    () => tx.orderItem.aggregate({ where: { orderId }, _sum: { subtotalPaisa: true } }),
    () => tx.order.findUniqueOrThrow({ where: { id: orderId }, select: { discountPaisa: true } }),
  );
  const totalPaisa = sum._sum.subtotalPaisa ?? 0;
  return { totalPaisa, finalPaisa: Math.max(0, totalPaisa - order.discountPaisa) };
}
