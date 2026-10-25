// tests/api/rbac.test.ts
// Stage 2: every role template against every key endpoint, a custom role with
// one permission, waiter floor scope, manager PIN approvals and the audit log.
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { asPlatform, disconnectDB, withTenant } from '../../src/config/prisma.js';
import { hasPermission, ROLE_TEMPLATES, type Permission } from '../../src/constants/permissions.js';
import { hashPassword } from '../../src/utils/Helpers.js';
import { startServer } from '../helpers/http.js';

const PASSWORD = 'Passw0rd!x';
const ROLES = ROLE_TEMPLATES.map((t) => t.name);
const EXTRA = ['menu_reader', 'server'];
let api: Awaited<ReturnType<typeof startServer>>;
let phone = 9730000000;

async function makeRestaurant(slug: string) {
  return asPlatform('test: rbac restaurant', async (db) => {
    const org = await db.organization.create({ data: { name: `R ${slug}`, slug, status: 'active' } });
    const branch = await db.branch.create({ data: { orgId: org.id, name: 'Main' } });
    const roles: Record<string, string> = {};
    for (const t of ROLE_TEMPLATES) roles[t.name] = (await db.role.create({ data: { orgId: org.id, ...t, isSystem: true } })).id;
    // Custom roles: one permission only, and a server who discounts but can't approve.
    roles['menu_reader'] = (await db.role.create({ data: { orgId: org.id, name: 'menu_reader', permissions: ['menu.view'] } })).id;
    roles['server'] = (
      await db.role.create({
        data: { orgId: org.id, name: 'server', permissions: ['menu.view', 'table.view', 'floor.all', 'order.view', 'order.create', 'discount.apply'] },
      })
    ).id;
    const users: Record<string, string> = {};
    for (const r of [...ROLES, ...EXTRA]) {
      const u = await db.user.create({
        data: { firstName: r, lastName: slug, email: `${r}@${slug}.test`, phone: String(++phone), passwordHash: await hashPassword(PASSWORD) },
      });
      await db.membership.create({ data: { orgId: org.id, userId: u.id, roleId: roles[r]! } });
      users[r] = u.id;
    }
    const cat = await db.category.create({ data: { orgId: org.id, name: 'Momo' } });
    const momo = await db.menuItem.create({ data: { orgId: org.id, categoryId: cat.id, name: 'Chicken Momo', pricePaisa: 25000 } });
    const mine = await db.diningTable.create({
      data: { orgId: org.id, branchId: branch.id, tableNumber: 1, capacity: 4, assignedWaiterId: users['waiter']! },
    });
    const other = await db.diningTable.create({ data: { orgId: org.id, branchId: branch.id, tableNumber: 2, capacity: 4 } });
    return { org, branch, roles, users, momo, mine, other };
  });
}

const login = async (email: string) => (await api.post('/auth/login', { email, password: PASSWORD })).body.data.accessToken as string;

let A: Awaited<ReturnType<typeof makeRestaurant>>;
const tok: Record<string, string> = {};
let myOrder: string;
let otherOrder: string;

beforeAll(async () => {
  api = await startServer();
  A = await makeRestaurant('rbac-a');
  for (const r of [...ROLES, ...EXTRA]) tok[r] = await login(`${r}@rbac-a.test`);

  const guest = (table: { qrToken: string }, customerName: string) =>
    api.post('/public/orders', { qrToken: table.qrToken, customerName, items: [{ menuItem: A.momo.id, quantity: 1 }] });
  myOrder = (await guest(A.mine, 'Mine')).body.data.id;
  otherOrder = (await guest(A.other, 'Other')).body.data.id;
  // Guest orders auto-assign the only waiter; make the other table and its order nobody's.
  await asPlatform('test: unassign', async (db) => {
    await db.order.update({ where: { id: otherOrder }, data: { assignedWaiterId: null } });
    await db.diningTable.update({ where: { id: A.other.id }, data: { assignedWaiterId: null } });
  });
}, 30_000);

afterAll(async () => {
  await api.close();
  await disconnectDB();
});

// Writes use a bad id or an empty body: the permission check runs before
// validation, so an allowed role gets 400 and a denied one 403, and nothing changes.
const BAD = 'not-a-uuid';
const MATRIX: [string, string, Permission][] = [
  ['GET', '/client/menu', 'menu.view'],
  ['GET', '/client/categories', 'menu.view'],
  ['POST', '/client/categories', 'menu.manage'],
  ['PATCH', `/client/menu/${BAD}/availability`, 'menu.86'],
  ['GET', '/client/tables', 'table.view'],
  ['POST', '/client/tables', 'table.manage'],
  ['GET', '/client/tables/qr/all', 'table.manage'],
  ['GET', '/client/orders', 'order.view'],
  ['GET', '/client/orders/kitchen/queue', 'kot.view'],
  ['POST', '/client/orders', 'order.create'],
  ['PATCH', `/client/orders/${BAD}/cancel`, 'order.cancel'],
  ['POST', `/client/orders/${BAD}/items`, 'order.edit'],
  ['GET', '/client/payments', 'payment.view'],
  ['POST', '/client/payments', 'payment.create'],
  ['POST', `/client/payments/${BAD}/refund`, 'payment.refund'],
  ['GET', '/client/payments/reports/daily', 'report.view'],
  ['GET', '/client/dashboard/overview', 'report.view'],
  ['GET', '/client/users', 'staff.view'],
  ['POST', '/client/users', 'staff.manage'],
  ['GET', '/client/roles/permissions', 'role.manage'],
  ['POST', '/client/roles', 'role.manage'],
  ['GET', '/client/audit', 'audit.view'],
];

const call = (method: string, path: string, token: string) =>
  method === 'GET' ? api.get(path, token) : method === 'POST' ? api.post(path, {}, token) : api.patch(path, {}, token);

describe('role × endpoint matrix', () => {
  for (const t of ROLE_TEMPLATES) {
    it(`${t.name} gets exactly what its permissions allow`, async () => {
      const wrong: string[] = [];
      for (const [method, path, perm] of MATRIX) {
        const res = await call(method, path, tok[t.name]!);
        const allowed = hasPermission(t.permissions, perm);
        if (allowed ? res.status === 403 : res.status !== 403) wrong.push(`${method} ${path} (${perm}) → ${res.status}`);
      }
      expect(wrong).toEqual([]);
    });
  }

  it('a custom role with only menu.view can read the menu and nothing else', async () => {
    const allowed: string[] = [];
    for (const [method, path] of MATRIX) {
      if ((await call(method, path, tok['menu_reader']!)).status !== 403) allowed.push(`${method} ${path}`);
    }
    expect(allowed).toEqual(['GET /client/menu', 'GET /client/categories']);
  });
});

describe('floor scope', () => {
  it('a waiter sees only tables assigned to them', async () => {
    const res = await api.get('/client/tables', tok['waiter']);
    expect(res.status).toBe(200);
    expect(res.body.data.map((t: { id: string }) => t.id)).toEqual([A.mine.id]);
    expect(res.body.stats.total).toBe(1);
    expect((await api.get(`/client/tables/${A.other.id}`, tok['waiter'])).status).toBe(404);
  });

  it('a waiter sees only orders for their tables or assigned to them', async () => {
    const res = await api.get('/client/orders', tok['waiter']);
    expect(res.body.data.map((o: { id: string }) => o.id)).toEqual([myOrder]);
    expect((await api.get(`/client/orders/${otherOrder}`, tok['waiter'])).status).toBe(404);
    expect((await api.get(`/client/orders/table/${A.other.id}`, tok['waiter'])).body.data).toEqual([]);
  });

  it('a waiter cannot order for a table that is not theirs', async () => {
    const res = await api.post(
      '/client/orders',
      { tableId: A.other.id, customerName: 'Walk In', items: [{ menuItem: A.momo.id, quantity: 1 }] },
      tok['waiter'],
    );
    expect(res.status).toBe(404);
  });

  it('managers and the kitchen see the whole floor', async () => {
    expect((await api.get('/client/tables', tok['manager'])).body.data).toHaveLength(2);
    const ids = (r: { body: { data: { id: string }[] } }) => r.body.data.map((o) => o.id).sort();
    expect(ids(await api.get('/client/orders', tok['manager']))).toEqual([myOrder, otherOrder].sort());
    expect(ids(await api.get('/client/orders', tok['kitchen_staff']))).toEqual([myOrder, otherOrder].sort());
  });
});

describe('manager PIN approvals', () => {
  let paymentId: string;

  beforeAll(async () => {
    // Settle the other table's order in cash so there is something to refund.
    const pay = await api.post('/client/payments', { orderId: otherOrder, paymentMethod: 'Cash', amount: 250 }, tok['cashier']);
    expect(pay.status).toBe(201);
    paymentId = pay.body.data.id;
  });

  const approve = (email: string, pin: string, permission: string, targetId?: string, as = 'cashier') =>
    api.post('/client/approvals', { approverEmail: email, pin, permission, ...(targetId && { targetId }) }, tok[as]);

  it('a cashier cannot refund without a manager', async () => {
    const res = await api.post(`/client/payments/${paymentId}/refund`, { refundAmount: 50 }, tok['cashier']);
    expect(res.status).toBe(403);
    expect(res.body.code).toBe('APPROVAL_REQUIRED');
  });

  it('staff set a PIN after re-entering their password', async () => {
    expect((await api.put('/client/approvals/pin', { pin: '2468', currentPassword: 'wrong' }, tok['manager'])).status).toBe(400);
    expect((await api.put('/client/approvals/pin', { pin: '2468', currentPassword: PASSWORD }, tok['manager'])).status).toBe(200);
    expect((await api.put('/client/approvals/pin', { pin: '1357', currentPassword: PASSWORD }, tok['waiter'])).status).toBe(200);
  });

  it('a wrong PIN, an approver without the permission, an unknown approver or self-approval is denied the same way', async () => {
    for (const res of [
      await approve('manager@rbac-a.test', '0000', 'refund.approve', paymentId),
      await approve('waiter@rbac-a.test', '1357', 'refund.approve', paymentId),
      await approve('nobody@rbac-a.test', '2468', 'refund.approve', paymentId),
      await approve('manager@rbac-a.test', '2468', 'refund.approve', paymentId, 'manager'),
    ]) {
      expect(res.status).toBe(403);
      expect(res.body.code).toBe('APPROVAL_DENIED');
    }
  });

  it('a manager PIN lets the cashier refund that one payment', async () => {
    const ok = await approve('manager@rbac-a.test', '2468', 'refund.approve', paymentId);
    expect(ok.status).toBe(200);
    const token = ok.body.data.approvalToken as string;

    const wrongTarget = await api.post(`/client/payments/${myOrder}/refund`, { refundAmount: 50, approvalToken: token }, tok['cashier']);
    expect(wrongTarget.body.code).toBe('APPROVAL_MISMATCH');
    // An access token is not an approval.
    const notApproval = await api.post(`/client/payments/${paymentId}/refund`, { refundAmount: 50, approvalToken: tok['manager'] }, tok['cashier']);
    expect(notApproval.body.code).toBe('APPROVAL_INVALID');

    const res = await api.post(`/client/payments/${paymentId}/refund`, { refundAmount: 50, reason: 'cold', approvalToken: token }, tok['cashier']);
    expect(res.status).toBe(201);

    const log = await api.get(`/client/audit?action=payment.refund&targetId=${paymentId}`, tok['admin']);
    expect(log.body.data).toHaveLength(1);
    expect(log.body.data[0].actor.id).toBe(A.users['cashier']);
    expect(log.body.data[0].after).toMatchObject({ amount: 50, reason: 'cold', approvedBy: A.users['manager'] });
  });

  it('discounts above the limit need discount.approve', async () => {
    const spare = await asPlatform('test: spare table', (db) =>
      db.diningTable.create({ data: { orgId: A.org.id, branchId: A.branch.id, tableNumber: 9, capacity: 4 } }),
    );
    const order = (customerName: string, extra = {}) =>
      api.post('/client/orders', { tableId: spare.id, customerName, items: [{ menuItem: A.momo.id, quantity: 4 }], ...extra }, tok['server']);

    // 1000 total: 100 (10%) is within the default limit, 300 is not.
    expect((await order('Small', { discount: 100 })).status).toBe(201);
    const blocked = await order('Big', { discount: 300 });
    expect(blocked.status).toBe(403);
    expect(blocked.body.code).toBe('APPROVAL_REQUIRED');

    const ok = await approve('manager@rbac-a.test', '2468', 'discount.approve', undefined, 'server');
    const res = await order('Big', { discount: 300, approvalToken: ok.body.data.approvalToken });
    expect(res.status).toBe(201);
    expect(res.body.data.finalAmount).toBe(700);
  });
});

describe('audit log', () => {
  it('records permission denials, approvals, money and role changes', async () => {
    await api.get('/client/audit', tok['waiter']); // denied
    const role = await api.post('/client/roles', { name: 'host', permissions: ['table.view'] }, tok['admin']);
    await api.patch(`/client/roles/${role.body.data.id}`, { permissions: ['table.view', 'menu.view'] }, tok['admin']);

    // The denial is written outside the request transaction; give it a moment.
    await new Promise((r) => setTimeout(r, 300));
    const actions = (await api.get('/client/audit?limit=200', tok['admin'])).body.data.map((e: { action: string }) => e.action);
    for (const a of [
      'permission.denied', 'approval.granted', 'approval.denied', 'approval.pin_set',
      'payment.create', 'payment.refund', 'order.discount', 'role.create', 'role.update',
    ]) {
      expect(actions).toContain(a);
    }
    const update = (await api.get(`/client/audit?action=role.update&targetId=${role.body.data.id}`, tok['admin'])).body.data[0];
    expect(update.before.permissions).toEqual(['table.view']);
    expect(update.after.permissions).toEqual(['table.view', 'menu.view']);
  });

  it('is append-only for the app', async () => {
    await expect(withTenant({ orgId: A.org.id }, (tx) => tx.auditLog.updateMany({ data: { action: 'tampered' } }))).rejects.toThrow();
    await expect(withTenant({ orgId: A.org.id }, (tx) => tx.auditLog.deleteMany({}))).rejects.toThrow();
  });
});

describe('shared accounts', () => {
  it('an org cannot edit someone who also works at another org, even bypassing the service', async () => {
    const other = await asPlatform('test: second org', async (db) => {
      const org = await db.organization.create({ data: { name: 'R rbac-b', slug: 'rbac-b', status: 'active' } });
      const role = await db.role.create({ data: { orgId: org.id, name: 'waiter', permissions: ['order.view'] } });
      await db.membership.create({ data: { orgId: org.id, userId: A.users['waiter']!, roleId: role.id } });
      return org;
    });
    const edit = (firstName: string) =>
      withTenant({ orgId: A.org.id }, (tx) => tx.user.updateMany({ where: { id: A.users['waiter']! }, data: { firstName } }));
    expect((await edit('Hijacked')).count).toBe(0);

    // Once they only work here again, the org manages them as before.
    await asPlatform('test: leave org', (db) => db.membership.deleteMany({ where: { orgId: other.id } }));
    expect((await edit('waiter')).count).toBe(1);
  });
});
