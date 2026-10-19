// tests/api/orders.test.ts
// Guest and staff ordering, the kitchen flow, permissions per status, the
// timeout sweep, revenue stats and socket isolation between organizations.
import { io as connect, type Socket } from 'socket.io-client';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { asPlatform, disconnectDB } from '../../src/config/prisma.js';
import { ROLE_TEMPLATES } from '../../src/constants/permissions.js';
import { sweepExpiredOrders } from '../../src/jobs/scheduler/orderTimeout.job.js';
import { hashPassword } from '../../src/utils/Helpers.js';
import { startServer } from '../helpers/http.js';

const PASSWORD = 'Passw0rd!x';
let api: Awaited<ReturnType<typeof startServer>>;
let phone = 9720000000;
const STAFF = ['admin', 'manager', 'cashier', 'waiter', 'kitchen_staff'] as const;

async function makeRestaurant(slug: string) {
  return asPlatform('test: restaurant', async (db) => {
    const org = await db.organization.create({ data: { name: `R ${slug}`, slug, status: 'active' } });
    const branch = await db.branch.create({ data: { orgId: org.id, name: 'Main' } });
    const roles: Record<string, string> = {};
    for (const t of ROLE_TEMPLATES) roles[t.name] = (await db.role.create({ data: { orgId: org.id, ...t, isSystem: true } })).id;
    const users: Record<string, string> = {};
    for (const r of STAFF) {
      const u = await db.user.create({
        data: { firstName: r, lastName: slug, email: `${r}@${slug}.test`, phone: String(++phone), passwordHash: await hashPassword(PASSWORD) },
      });
      await db.membership.create({ data: { orgId: org.id, userId: u.id, roleId: roles[r]! } });
      users[r] = u.id;
    }
    const cat = await db.category.create({ data: { orgId: org.id, name: 'Momo' } });
    const momo = await db.menuItem.create({ data: { orgId: org.id, categoryId: cat.id, name: 'Chicken Momo', pricePaisa: 25000 } });
    const tea = await db.menuItem.create({ data: { orgId: org.id, categoryId: cat.id, name: 'Masala Tea', pricePaisa: 6000 } });
    const gone = await db.menuItem.create({
      data: { orgId: org.id, categoryId: cat.id, name: 'Sekuwa', pricePaisa: 38000, availabilityStatus: 'OutOfStock' },
    });
    const tables = [];
    for (let n = 1; n <= 4; n++) tables.push(await db.diningTable.create({ data: { orgId: org.id, branchId: branch.id, tableNumber: n, capacity: 4 } }));
    return { org, branch, users, menu: { momo, tea, gone }, tables };
  });
}

const login = async (email: string) => (await api.post('/auth/login', { email, password: PASSWORD })).body.data.accessToken as string;

let A: Awaited<ReturnType<typeof makeRestaurant>>;
let B: Awaited<ReturnType<typeof makeRestaurant>>;
const tok: Record<string, string> = {};

beforeAll(async () => {
  api = await startServer({ sockets: true });
  A = await makeRestaurant('ord-a');
  B = await makeRestaurant('ord-b');
  for (const r of STAFF) tok[r] = await login(`${r}@ord-a.test`);
  tok['adminB'] = await login('admin@ord-b.test');
  tok['chefB'] = await login('kitchen_staff@ord-b.test');
});

afterAll(async () => {
  await api.close();
  await disconnectDB();
});

const guestOrder = (table: { qrToken: string }, customerName: string, items: { menuItem: string; quantity: number }[], extra = {}) =>
  api.post('/public/orders', { qrToken: table.qrToken, customerName, items, ...extra });

describe('guest ordering', () => {
  let orderId: string;

  it('places an order from the QR token with snapshotted prices and a real waiter', async () => {
    const res = await guestOrder(A.tables[0]!, 'Sita', [
      { menuItem: A.menu.momo.id, quantity: 2 },
      { menuItem: A.menu.tea.id, quantity: 1 },
    ]);
    expect(res.status).toBe(201);
    const o = res.body.data;
    expect(o.totalAmount).toBe(560);
    expect(o.finalAmount).toBe(560);
    expect(o.items.map((i: { price: number }) => i.price)).toEqual([250, 60]);
    // Picked the waiter, never the chef/cashier/admin.
    expect(o.assignedWaiter.firstName).toBe('waiter');
    expect(o.cookedBy).toBeUndefined();
    orderId = o.id;

    const table = await asPlatform('t', (db) => db.diningTable.findUnique({ where: { id: A.tables[0]!.id } }));
    expect(table?.status).toBe('Occupied');
    expect(table?.currentOrderId).toBe(orderId);
  });

  it('ignores a discount sent by a guest', async () => {
    const res = await guestOrder(A.tables[1]!, 'Hacker', [{ menuItem: A.menu.momo.id, quantity: 1 }], { discount: 250 });
    expect(res.status).toBe(201);
    expect(res.body.data.discount).toBe(0);
    expect(res.body.data.finalAmount).toBe(250);
  });

  it('rejects out-of-stock items, duplicates and other restaurants\' items', async () => {
    const gone = await guestOrder(A.tables[2]!, 'Ram', [{ menuItem: A.menu.gone.id, quantity: 1 }]);
    expect(gone.body.code).toBe('INVALID_ITEMS');
    expect(gone.body.errors[0]).toMatch(/Sekuwa is currently out of stock/);

    const foreign = await guestOrder(A.tables[2]!, 'Ram', [{ menuItem: B.menu.momo.id, quantity: 1 }]);
    expect(foreign.body.errors[0]).toMatch(/not found/);

    const dup = await guestOrder(A.tables[0]!, 'sita', [{ menuItem: A.menu.tea.id, quantity: 1 }]);
    expect(dup.status).toBe(409);
  });

  it('shows the guest only their table\'s active orders, without staff details', async () => {
    const res = await api.get(`/public/qr/${A.tables[0]!.qrToken}/orders`);
    expect(res.body.data.map((o: { id: string }) => o.id)).toEqual([orderId]);
    expect(res.body.data[0].servedBy).toBeUndefined();
    expect(res.body.data[0].assignedWaiter).toEqual({ firstName: 'waiter', lastName: 'ord-a' });
  });

  it('runs the kitchen flow with the right permissions', async () => {
    const queueA = await api.get('/client/orders/kitchen/queue', tok['kitchen_staff']);
    expect(queueA.body.data.some((o: { id: string }) => o.id === orderId)).toBe(true);
    const queueB = await api.get('/client/orders/kitchen/queue', tok['chefB']);
    expect(queueB.body.data).toEqual([]);

    const order = (await api.get(`/client/orders/${orderId}`, tok['kitchen_staff'])).body.data;
    const [momoLine, teaLine] = order.items;
    const cooking = await api.patch(`/client/orders/${orderId}/items/${momoLine.id}/status`, { status: 'Cooking' }, tok['kitchen_staff']);
    expect(cooking.body.data.status).toBe('InKitchen');

    for (const line of [momoLine, teaLine]) {
      await api.patch(`/client/orders/${orderId}/items/${line.id}/status`, { status: 'Served' }, tok['waiter']);
    }
    expect((await api.get(`/client/orders/${orderId}`, tok['waiter'])).body.data.status).toBe('Served');

    // Waiters can't take money; cashiers can.
    expect((await api.patch(`/client/orders/${orderId}/status`, { status: 'Paid' }, tok['waiter'])).status).toBe(403);
    const paid = await api.patch(`/client/orders/${orderId}/status`, { status: 'Paid' }, tok['cashier']);
    expect(paid.body.data.status).toBe('Paid');
    const table = await asPlatform('t', (db) => db.diningTable.findUnique({ where: { id: A.tables[0]!.id } }));
    expect(table?.currentOrderId).toBeNull();

    expect((await api.patch(`/client/orders/${orderId}/complete`, undefined, tok['cashier'])).body.data.status).toBe('Completed');
    expect((await api.patch(`/client/orders/${orderId}/status`, { status: 'Pending' }, tok['admin'])).body.code).toBe('ORDER_CLOSED');
  });

  it('counts completed orders as revenue', async () => {
    const res = await api.get('/client/orders?limit=1', tok['manager']);
    expect(res.body.stats.revenue.total).toBe(560);
    expect(res.body.stats.byStatus.completed).toBe(1);
  });
});

describe('staff ordering', () => {
  it('needs discount.apply to discount, and caps it at the total', async () => {
    const body = { tableId: A.tables[3]!.id, customerName: 'Walk-in', items: [{ menuItem: A.menu.momo.id, quantity: 1 }], discount: 50 };
    expect((await api.post('/client/orders', body, tok['waiter'])).status).toBe(403);
    const ok = await api.post('/client/orders', body, tok['admin']);
    expect(ok.body.data.finalAmount).toBe(200);
    const huge = await api.post('/client/orders', { ...body, customerName: 'Other', discount: 999 }, tok['admin']);
    expect(huge.body.code).toBe('DISCOUNT_TOO_LARGE');
  });

  it('adding items to a served order sends it back to the kitchen', async () => {
    const created = (await api.post('/client/orders', { tableId: A.tables[3]!.id, customerName: 'Hari', items: [{ menuItem: A.menu.tea.id, quantity: 1 }] }, tok['waiter'])).body.data;
    await api.patch(`/client/orders/${created.id}/items/${created.items[0].id}/status`, { status: 'Served' }, tok['waiter']);
    const more = await api.post(`/client/orders/${created.id}/items`, { items: [{ menuItem: A.menu.momo.id, quantity: 1 }] }, tok['waiter']);
    expect(more.body.data.status).toBe('InKitchen');
    expect(more.body.data.totalAmount).toBe(310);
  });

  it('only cancels with order.cancel, and never another org\'s order', async () => {
    const o = (await guestOrder(A.tables[2]!, 'Gita', [{ menuItem: A.menu.tea.id, quantity: 1 }])).body.data;
    expect((await api.patch(`/client/orders/${o.id}/cancel`, {}, tok['waiter'])).status).toBe(403);
    expect((await api.patch(`/client/orders/${o.id}/cancel`, {}, tok['adminB'])).status).toBe(404);
    const done = await api.patch(`/client/orders/${o.id}/cancel`, { reason: 'Guest left' }, tok['manager']);
    expect(done.body.data.status).toBe('Cancelled');
    expect(done.body.data.note).toMatch(/Cancelled: Guest left/);
  });
});

describe('timeout sweep', () => {
  it('cancels stale Pending orders but never ones already cooking', async () => {
    const pending = (await guestOrder(A.tables[1]!, 'Late', [{ menuItem: A.menu.tea.id, quantity: 1 }])).body.data;
    const cooking = (await guestOrder(A.tables[3]!, 'Slow', [{ menuItem: A.menu.momo.id, quantity: 1 }])).body.data;
    await api.patch(`/client/orders/${cooking.id}/items/${cooking.items[0].id}/status`, { status: 'Cooking' }, tok['kitchen_staff']);
    await asPlatform('test: expire', (db) =>
      db.order.updateMany({ where: { id: { in: [pending.id, cooking.id] } }, data: { orderTimeout: new Date(Date.now() - 60_000) } }),
    );

    expect(await sweepExpiredOrders()).toBeGreaterThanOrEqual(1);
    const [p, c] = await asPlatform('t', (db) =>
      Promise.all([db.order.findUnique({ where: { id: pending.id } }), db.order.findUnique({ where: { id: cooking.id } })]),
    );
    expect(p?.status).toBe('Cancelled');
    expect(p?.isTimedOut).toBe(true);
    expect(c?.status).toBe('InKitchen');
  });
});

describe('real-time isolation', () => {
  const open = (token?: string) =>
    new Promise<Socket>((resolve) => {
      const s = connect(`http://127.0.0.1:${api.port}`, { transports: ['websocket'], ...(token && { auth: { token } }) });
      s.on('connect', () => resolve(s));
    });
  const settle = () => new Promise((r) => setTimeout(r, 150));

  it('delivers order events only inside the organization', async () => {
    const kitchenA = await open(tok['kitchen_staff']);
    const kitchenB = await open(tok['chefB']);
    const anonymous = await open();
    const seen = { A: 0, B: 0, anon: 0 };
    kitchenA.on('order:new', () => seen.A++);
    kitchenB.on('order:new', () => seen.B++);
    anonymous.on('order:new', () => seen.anon++);
    kitchenA.emit('join', ['kitchen']);
    kitchenB.emit('join', ['kitchen']);
    anonymous.emit('join', ['kitchen', 'dashboard']); // ignored: not staff
    await settle();

    await guestOrder(A.tables[2]!, 'Socket test', [{ menuItem: A.menu.tea.id, quantity: 1 }]);
    await settle();
    expect(seen).toEqual({ A: 1, B: 0, anon: 0 });

    // Staff of B can't subscribe to A's table either.
    kitchenB.emit('join', [`table:${A.tables[2]!.id}`]);
    const guest = await open();
    let guestSeen = 0;
    guest.on('order:status-updated', () => guestSeen++);
    guest.emit('join', [`table:${A.tables[2]!.id}`]);
    let bSeen = 0;
    kitchenB.on('order:status-updated', () => bSeen++);
    await settle();
    const order = (await api.get(`/public/qr/${A.tables[2]!.qrToken}/orders`)).body.data[0];
    await api.patch(`/client/orders/${order.id}/status`, { status: 'InKitchen' }, tok['kitchen_staff']);
    await settle();
    expect(guestSeen).toBe(1);
    expect(bSeen).toBe(0);

    for (const s of [kitchenA, kitchenB, anonymous, guest]) s.close();
  });
});
