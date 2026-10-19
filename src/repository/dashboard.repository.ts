// src/repository/dashboard.repository.ts
// Analytics queries. Raw SQL runs under the tenant's transaction too, so
// row-level security scopes every one of them to the current organization.
import { Prisma } from '@prisma/client';

import type { TenantTx } from '../config/prisma.js';
import { inOrder } from '../utils/Helpers.js';

export type Granularity = 'hour' | 'day' | 'month';

export interface Range {
  start: Date;
  end: Date;
}

/** Money-in payment rows (refund rows are negative and handled separately). */
const PAID = Prisma.sql`amount_paisa > 0 AND status IN ('Paid', 'Refunded')`;
const SOLD_ORDER = Prisma.sql`o.status NOT IN ('Cancelled')`;

const n = (v: bigint | number | null | undefined) => Number(v ?? 0);

class DashboardRepository {
  /** Payments bucketed on the restaurant's clock. */
  async salesTrend(tx: TenantTx, r: Range, g: Granularity, tz: string) {
    const local = Prisma.sql`(payment_time AT TIME ZONE ${tz})`;
    const parts =
      g === 'hour'
        ? Prisma.sql`extract(year FROM ${local})::int AS year, extract(month FROM ${local})::int AS month, extract(day FROM ${local})::int AS day, extract(hour FROM ${local})::int AS hour`
        : g === 'day'
          ? Prisma.sql`extract(year FROM ${local})::int AS year, extract(month FROM ${local})::int AS month, extract(day FROM ${local})::int AS day, NULL::int AS hour`
          : Prisma.sql`extract(year FROM ${local})::int AS year, extract(month FROM ${local})::int AS month, NULL::int AS day, NULL::int AS hour`;
    const rows = await tx.$queryRaw<{ year: number; month: number; day: number | null; hour: number | null; total: bigint; count: bigint }[]>`
      SELECT ${parts}, sum(amount_paisa)::bigint AS total, count(*)::bigint AS count
      FROM payments WHERE ${PAID} AND payment_time BETWEEN ${r.start} AND ${r.end}
      GROUP BY 1, 2, 3, 4 ORDER BY 1, 2, 3, 4`;
    return rows.map((x) => ({ ...x, totalPaisa: n(x.total), count: n(x.count) }));
  }

  async paymentTotals(tx: TenantTx, r: Range) {
    const [row] = await tx.$queryRaw<{ gross: bigint | null; refunds: bigint | null; count: bigint }[]>`
      SELECT sum(amount_paisa) FILTER (WHERE ${PAID})::bigint AS gross,
             (-sum(amount_paisa) FILTER (WHERE amount_paisa < 0))::bigint AS refunds,
             count(*) FILTER (WHERE ${PAID})::bigint AS count
      FROM payments WHERE payment_time BETWEEN ${r.start} AND ${r.end}`;
    const gross = n(row?.gross);
    const refunds = n(row?.refunds);
    return { grossPaisa: gross, refundPaisa: refunds, netPaisa: gross - refunds, count: n(row?.count) };
  }

  async paymentMethods(tx: TenantTx, r: Range) {
    const rows = await tx.$queryRaw<{ method: string; total: bigint; count: bigint }[]>`
      SELECT method::text, sum(amount_paisa)::bigint AS total, count(*)::bigint AS count
      FROM payments WHERE ${PAID} AND payment_time BETWEEN ${r.start} AND ${r.end}
      GROUP BY 1 ORDER BY 2 DESC`;
    return rows.map((x) => ({ method: x.method, totalPaisa: n(x.total), count: n(x.count) }));
  }

  async hourly(tx: TenantTx, r: Range, tz: string) {
    const rows = await tx.$queryRaw<{ hour: number; total: bigint; count: bigint }[]>`
      SELECT extract(hour FROM payment_time AT TIME ZONE ${tz})::int AS hour, sum(amount_paisa)::bigint AS total, count(*)::bigint AS count
      FROM payments WHERE ${PAID} AND payment_time BETWEEN ${r.start} AND ${r.end}
      GROUP BY 1 ORDER BY 1`;
    return rows.map((x) => ({ hour: x.hour, totalPaisa: n(x.total), count: n(x.count) }));
  }

  async orderSummary(tx: TenantTx, r: Range) {
    const [row] = await tx.$queryRaw<{ total: bigint; done: bigint; cancelled: bigint; revenue: bigint | null; avg: number | null }[]>`
      SELECT count(*)::bigint AS total,
             count(*) FILTER (WHERE status IN ('Paid', 'Completed'))::bigint AS done,
             count(*) FILTER (WHERE status = 'Cancelled')::bigint AS cancelled,
             sum(final_paisa) FILTER (WHERE status IN ('Paid', 'Completed'))::bigint AS revenue,
             avg(final_paisa) FILTER (WHERE status <> 'Cancelled')::float AS avg
      FROM orders WHERE created_at BETWEEN ${r.start} AND ${r.end}`;
    return {
      total: n(row?.total),
      completed: n(row?.done),
      cancelled: n(row?.cancelled),
      revenuePaisa: n(row?.revenue),
      avgPaisa: Math.round(row?.avg ?? 0),
    };
  }

  async statusDistribution(tx: TenantTx, r: Range) {
    const rows = await tx.$queryRaw<{ status: string; count: bigint }[]>`
      SELECT status::text, count(*)::bigint AS count FROM orders
      WHERE created_at BETWEEN ${r.start} AND ${r.end} GROUP BY 1 ORDER BY 2 DESC`;
    return rows.map((x) => ({ status: x.status, count: n(x.count) }));
  }

  /** Units sold and revenue per menu item (all items, best sellers first). */
  async itemSales(tx: TenantTx, r: Range, categoryId?: string) {
    const rows = await tx.$queryRaw<{ id: string; name: string; category: string; quantity: bigint; revenue: bigint }[]>`
      SELECT m.id::text, m.name, c.name AS category,
             coalesce(sum(oi.quantity) FILTER (WHERE o.id IS NOT NULL), 0)::bigint AS quantity,
             coalesce(sum(oi.subtotal_paisa) FILTER (WHERE o.id IS NOT NULL), 0)::bigint AS revenue
      FROM menu_items m
      JOIN categories c ON c.id = m.category_id
      LEFT JOIN order_items oi ON oi.menu_item_id = m.id
      LEFT JOIN orders o ON o.id = oi.order_id AND ${SOLD_ORDER} AND o.created_at BETWEEN ${r.start} AND ${r.end}
      WHERE ${categoryId ? Prisma.sql`m.category_id = ${categoryId}::uuid` : Prisma.sql`true`}
      GROUP BY m.id, m.name, c.name
      ORDER BY quantity DESC, m.name`;
    return rows.map((x) => ({ id: x.id, name: x.name, category: x.category, quantity: n(x.quantity), revenuePaisa: n(x.revenue) }));
  }

  async categorySales(tx: TenantTx, r: Range) {
    const rows = await tx.$queryRaw<{ id: string; name: string; quantity: bigint; revenue: bigint }[]>`
      SELECT c.id::text, c.name, coalesce(sum(oi.quantity), 0)::bigint AS quantity, coalesce(sum(oi.subtotal_paisa), 0)::bigint AS revenue
      FROM order_items oi
      JOIN orders o ON o.id = oi.order_id AND ${SOLD_ORDER} AND o.created_at BETWEEN ${r.start} AND ${r.end}
      JOIN menu_items m ON m.id = oi.menu_item_id
      JOIN categories c ON c.id = m.category_id
      GROUP BY c.id, c.name ORDER BY revenue DESC`;
    return rows.map((x) => ({ id: x.id, name: x.name, quantity: n(x.quantity), revenuePaisa: n(x.revenue) }));
  }

  async topCustomers(tx: TenantTx, r: Range, limit = 10) {
    const rows = await tx.$queryRaw<{ name: string; orders: bigint; spent: bigint }[]>`
      SELECT customer_name AS name, count(*)::bigint AS orders, sum(final_paisa)::bigint AS spent
      FROM orders WHERE status IN ('Paid', 'Completed') AND created_at BETWEEN ${r.start} AND ${r.end}
      GROUP BY customer_name ORDER BY spent DESC LIMIT ${limit}`;
    return rows.map((x) => ({ name: x.name, orders: n(x.orders), spentPaisa: n(x.spent) }));
  }

  async liveCounts(tx: TenantTx) {
    const [row] = await tx.$queryRaw<{ active: bigint; pending: bigint; kitchen: bigint }[]>`
      SELECT count(*) FILTER (WHERE status IN ('Pending', 'InKitchen', 'Served'))::bigint AS active,
             count(*) FILTER (WHERE status = 'Pending')::bigint AS pending,
             count(*) FILTER (WHERE status = 'InKitchen')::bigint AS kitchen
      FROM orders`;
    return { active: n(row?.active), pending: n(row?.pending), kitchen: n(row?.kitchen) };
  }

  async tables(tx: TenantTx) {
    const rows = await tx.$queryRaw<{ status: string; count: bigint; seats: bigint }[]>`
      SELECT status::text, count(*)::bigint AS count, sum(capacity)::bigint AS seats FROM dining_tables GROUP BY 1`;
    const by = Object.fromEntries(rows.map((x) => [x.status.toLowerCase(), n(x.count)]));
    const totalSeats = rows.reduce((s, x) => s + n(x.seats), 0);
    const occupiedSeats = n(rows.find((x) => x.status === 'Occupied')?.seats);
    return {
      total: rows.reduce((s, x) => s + n(x.count), 0),
      byStatus: { available: by['available'] ?? 0, occupied: by['occupied'] ?? 0, reserved: by['reserved'] ?? 0 },
      totalCapacity: totalSeats,
      occupiedCapacity: occupiedSeats,
    };
  }

  async staff(tx: TenantTx) {
    const [total, active] = await inOrder(
      () => tx.membership.count(),
      () => tx.membership.count({ where: { status: 'Active', user: { status: 'Active' } } }),
    );
    return { total, active };
  }

  menuCounts(tx: TenantTx) {
    return inOrder(
      () => tx.menuItem.count(),
      () => tx.menuItem.count({ where: { availabilityStatus: 'Available' } }),
      () => tx.menuItem.findMany({ where: { availabilityStatus: 'OutOfStock' }, select: { id: true, name: true }, orderBy: { name: 'asc' } }),
    );
  }
}

export default new DashboardRepository();
