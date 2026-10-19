// tests/api/dashboard.test.ts
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { asPlatform, disconnectDB } from '../../src/config/prisma.js';
import { ROLE_TEMPLATES } from '../../src/constants/permissions.js';
import { rangeFor } from '../../src/services/dashboard/client/dashboard.service.js';
import { hashPassword } from '../../src/utils/Helpers.js';
import { startServer } from '../helpers/http.js';

const PASSWORD = 'Passw0rd!x';
let api: Awaited<ReturnType<typeof startServer>>;
let phone = 9740000000;

/** One restaurant with: a completed Rs 500 order (paid cash, Rs 100 refunded),
 *  a cancelled order, a pending one, and an out-of-stock item. */
async function makeRestaurant(slug: string, withActivity: boolean) {
  return asPlatform('test: dashboard org', async (db) => {
    const org = await db.organization.create({ data: { name: slug, slug, status: 'active' } });
    const branch = await db.branch.create({ data: { orgId: org.id, name: 'Main' } });
    const roles: Record<string, string> = {};
    for (const t of ROLE_TEMPLATES) roles[t.name] = (await db.role.create({ data: { orgId: org.id, ...t, isSystem: true } })).id;
    for (const r of ['manager', 'waiter']) {
      const u = await db.user.create({
        data: { firstName: r, lastName: slug, email: `${r}@${slug}.test`, phone: String(++phone), passwordHash: await hashPassword(PASSWORD) },
      });
      await db.membership.create({ data: { orgId: org.id, userId: u.id, roleId: roles[r]! } });
    }
    if (!withActivity) return org;

    const cat = await db.category.create({ data: { orgId: org.id, name: 'Momo' } });
    const momo = await db.menuItem.create({ data: { orgId: org.id, categoryId: cat.id, name: 'Chicken Momo', pricePaisa: 25000 } });
    await db.menuItem.create({ data: { orgId: org.id, categoryId: cat.id, name: 'Sekuwa', pricePaisa: 38000, availabilityStatus: 'OutOfStock' } });
    const table = await db.diningTable.create({ data: { orgId: org.id, branchId: branch.id, tableNumber: 1, capacity: 4, status: 'Occupied' } });
    const line = (qty: number) => ({ orgId: org.id, menuItemId: momo.id, name: momo.name, quantity: qty, pricePaisa: 25000, subtotalPaisa: 25000 * qty });
    const base = { orgId: org.id, branchId: branch.id, tableId: table.id };

    const done = await db.order.create({
      data: { ...base, customerName: 'Sita', status: 'Completed', totalPaisa: 50000, finalPaisa: 50000, items: { create: [line(2)] } },
    });
    await db.order.create({ data: { ...base, customerName: 'Ram', status: 'Cancelled', totalPaisa: 25000, finalPaisa: 25000, items: { create: [line(1)] } } });
    await db.order.create({ data: { ...base, customerName: 'Hari', status: 'Pending', totalPaisa: 25000, finalPaisa: 25000, items: { create: [line(1)] } } });

    const paid = await db.payment.create({ data: { ...base, orderId: done.id, amountPaisa: 50000, method: 'Cash', status: 'Paid' } });
    await db.payment.create({
      data: { ...base, orderId: done.id, amountPaisa: -10000, method: 'Cash', status: 'Refunded', transactionId: `REFUND-${paid.id}` },
    });
    return org;
  });
}

const login = async (email: string) => (await api.post('/auth/login', { email, password: PASSWORD })).body.data.accessToken as string;
const tok: Record<string, string> = {};

beforeAll(async () => {
  api = await startServer();
  await makeRestaurant('dash-a', true);
  await makeRestaurant('dash-b', false);
  tok['manager'] = await login('manager@dash-a.test');
  tok['waiter'] = await login('waiter@dash-a.test');
  tok['managerB'] = await login('manager@dash-b.test');
});

afterAll(async () => {
  await api.close();
  await disconnectDB();
});

describe('dashboard', () => {
  it('overview counts completed orders as revenue', async () => {
    const d = (await api.get('/client/dashboard/overview', tok['manager'])).body.data;
    expect(d.overview.orders).toMatchObject({ totalOrders: 3, completedOrders: 1, cancelledOrders: 1, totalRevenue: 500 });
    expect(d.overview.payments.totalAmount).toBe(400); // net of the Rs 100 refund
    expect(d.analytics.popularItems[0]).toMatchObject({ name: 'Chicken Momo', totalQuantity: 3 }); // cancelled order excluded
    expect(d.analytics.salesTrends[0]._id.hour).toBeTypeOf('number');
    expect(d.operations.tableStatus.byStatus.occupied).toBe(1);
    expect(d.recentActivity.pendingOrders).toHaveLength(1);
  });

  it('sales are net of refunds', async () => {
    const d = (await api.get('/client/dashboard/sales?period=today', tok['manager'])).body.data;
    expect(d.summary).toMatchObject({ totalSales: 400, grossSales: 500, refunds: 100, totalTransactions: 1 });
    expect(d.breakdowns.paymentMethods).toEqual([{ _id: 'Cash', total: 500, count: 1 }]);
    expect(d.customers[0]).toEqual({ _id: 'Sita', orderCount: 1, totalSpent: 500 });
  });

  it('operations and menu analytics', async () => {
    const ops = (await api.get('/client/dashboard/operations', tok['manager'])).body.data;
    expect(ops.service.cancellationRate).toBe('33.3%');
    expect(ops.kitchen.pendingOrders).toBe(1);
    expect(ops.tables.utilization.occupiedCapacity).toBe(4);

    const menu = (await api.get('/client/dashboard/menu', tok['manager'])).body.data;
    expect(menu.summary).toMatchObject({ totalItemsSold: 3, totalMenuItems: 2, outOfStockItems: 1 });
    expect(menu.alerts.map((a: { name: string }) => a.name)).toEqual(['Sekuwa']);
    expect(menu.analytics.profitability).toEqual([]);
  });

  it('lets every staff member see the live strip but only report.view see analytics', async () => {
    const live = await api.get('/client/dashboard/real-time', tok['waiter']);
    expect(live.status).toBe(200);
    expect(live.body.data).toMatchObject({ activeOrders: 1, pendingOrders: 1, totalRevenue: 400 });
    expect((await api.get('/client/dashboard/overview', tok['waiter'])).status).toBe(403);
  });

  it('shows another restaurant nothing of this one', async () => {
    const d = (await api.get('/client/dashboard/overview', tok['managerB'])).body.data;
    expect(d.overview.orders.totalOrders).toBe(0);
    expect(d.recentActivity.orders).toEqual([]);
    expect((await api.get('/client/dashboard/real-time', tok['managerB'])).body.data.totalRevenue).toBe(0);
  });
});

describe('periods follow Nepal time', () => {
  it('starts the month at local midnight on the 1st', () => {
    const r = rangeFor('month', new Date('2026-10-19T10:00:00Z'));
    expect(r.start.toISOString()).toBe('2026-09-30T18:15:00.000Z');
  });

  it('yesterday is a full local day', () => {
    const r = rangeFor('yesterday', new Date('2026-10-19T10:00:00Z'));
    expect(r.start.toISOString()).toBe('2026-10-17T18:15:00.000Z');
    expect(r.end.getTime() - r.start.getTime()).toBe(24 * 60 * 60 * 1000 - 1);
  });
});
