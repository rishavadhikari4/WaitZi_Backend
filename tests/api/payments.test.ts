// tests/api/payments.test.ts
// Cash/card payments, refunds, the daily report and the Khalti flow (mocked).
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

const khalti = vi.hoisted(() => ({
  initiate: vi.fn(),
  lookup: vi.fn(),
}));
vi.mock('../../src/providers/payment/khalti.provider.js', () => ({
  KhaltiProvider: vi.fn().mockImplementation(() => khalti),
}));

import { asPlatform, disconnectDB } from '../../src/config/prisma.js';
import { ROLE_TEMPLATES } from '../../src/constants/permissions.js';
import { hashPassword } from '../../src/utils/Helpers.js';
import { startServer } from '../helpers/http.js';

const PASSWORD = 'Passw0rd!x';
let api: Awaited<ReturnType<typeof startServer>>;
let phone = 9730000000;
const STAFF = ['admin', 'manager', 'cashier', 'waiter', 'kitchen_staff'] as const;

async function makeRestaurant(slug: string) {
  return asPlatform('test: restaurant', async (db) => {
    const org = await db.organization.create({ data: { name: `P ${slug}`, slug, status: 'active' } });
    const branch = await db.branch.create({ data: { orgId: org.id, name: 'Main' } });
    const roles: Record<string, string> = {};
    for (const t of ROLE_TEMPLATES) roles[t.name] = (await db.role.create({ data: { orgId: org.id, ...t, isSystem: true } })).id;
    for (const r of STAFF) {
      const u = await db.user.create({
        data: { firstName: r, lastName: slug, email: `${r}@${slug}.test`, phone: String(++phone), passwordHash: await hashPassword(PASSWORD) },
      });
      await db.membership.create({ data: { orgId: org.id, userId: u.id, roleId: roles[r]! } });
    }
    const cat = await db.category.create({ data: { orgId: org.id, name: 'Momo' } });
    const momo = await db.menuItem.create({ data: { orgId: org.id, categoryId: cat.id, name: 'Chicken Momo', pricePaisa: 25000 } });
    const tables = [];
    for (let n = 1; n <= 6; n++) tables.push(await db.diningTable.create({ data: { orgId: org.id, branchId: branch.id, tableNumber: n, capacity: 4 } }));
    return { org, momo, tables };
  });
}

const login = async (email: string) => (await api.post('/auth/login', { email, password: PASSWORD })).body.data.accessToken as string;

let A: Awaited<ReturnType<typeof makeRestaurant>>;
let B: Awaited<ReturnType<typeof makeRestaurant>>;
const tok: Record<string, string> = {};
let tableIdx = 0;

/** A guest order of `qty` momos (Rs 250 each), optionally marked served. */
async function order(qty: number, served = false) {
  const table = A.tables[tableIdx++ % A.tables.length]!;
  const o = (await api.post('/public/orders', { qrToken: table.qrToken, customerName: `Guest ${tableIdx}`, items: [{ menuItem: A.momo.id, quantity: qty }] })).body.data;
  if (served) await api.patch(`/client/orders/${o.id}/items/${o.items[0].id}/status`, { status: 'Served' }, tok['waiter']);
  return { ...o, table };
}

beforeAll(async () => {
  api = await startServer();
  A = await makeRestaurant('pay-a');
  B = await makeRestaurant('pay-b');
  for (const r of STAFF) tok[r] = await login(`${r}@pay-a.test`);
  tok['adminB'] = await login('admin@pay-b.test');
});

beforeEach(() => {
  khalti.initiate.mockReset();
  khalti.lookup.mockReset();
});

afterAll(async () => {
  await api.close();
  await disconnectDB();
});

describe('cash and card', () => {
  it('cash settles a served order, frees the table and records who took it', async () => {
    const o = await order(2, true);
    expect((await api.post('/client/payments', { orderId: o.id, paymentMethod: 'Cash', amount: 500 }, tok['waiter'])).status).toBe(403);
    expect((await api.post('/client/payments', { orderId: o.id, paymentMethod: 'Cash', amount: 499 }, tok['cashier'])).body.code).toBe('AMOUNT_MISMATCH');

    const paid = await api.post('/client/payments', { orderId: o.id, paymentMethod: 'Cash', amount: 500 }, tok['cashier']);
    expect(paid.status).toBe(201);
    expect(paid.body.data.paymentStatus).toBe('Paid');
    expect(paid.body.data.handledBy.firstName).toBe('cashier');
    expect((await api.get(`/client/orders/${o.id}`, tok['cashier'])).body.data.status).toBe('Paid');
    expect((await api.post('/client/payments', { orderId: o.id, paymentMethod: 'Cash', amount: 500 }, tok['cashier'])).body.code).toBe('ORDER_NOT_PAYABLE');
  });

  it('card waits for confirmation; paying before serving marks the order prepaid', async () => {
    const o = await order(1);
    const pending = (await api.post('/client/payments', { orderId: o.id, paymentMethod: 'Card', amount: 250 }, tok['cashier'])).body.data;
    expect(pending.paymentStatus).toBe('Pending');
    expect((await api.post('/client/payments', { orderId: o.id, paymentMethod: 'Cash', amount: 250 }, tok['cashier'])).body.code).toBe('PAYMENT_EXISTS');

    const confirmed = await api.patch(`/client/payments/${pending.id}/status`, { paymentStatus: 'Paid', transactionId: 'POS-1' }, tok['cashier']);
    expect(confirmed.body.data.paymentStatus).toBe('Paid');
    const prepaid = (await api.get(`/client/orders/${o.id}`, tok['cashier'])).body.data;
    expect(prepaid.isPrepaid).toBe(true);
    expect(prepaid.status).toBe('Pending');

    const served = await api.patch(`/client/orders/${o.id}/items/${prepaid.items[0].id}/status`, { status: 'Served' }, tok['waiter']);
    expect(served.body.data.status).toBe('Paid');
  });

  it('is invisible to other restaurants', async () => {
    const list = await api.get('/client/payments', tok['adminB']);
    expect(list.body.data).toEqual([]);
  });
});

describe('refunds and reports', () => {
  let paymentId: string;

  beforeAll(async () => {
    const o = await order(4, true); // Rs 1000
    paymentId = (await api.post('/client/payments', { orderId: o.id, paymentMethod: 'Cash', amount: 1000 }, tok['cashier'])).body.data.id;
  });

  it('needs refund.approve', async () => {
    expect((await api.post(`/client/payments/${paymentId}/refund`, { refundAmount: 100 }, tok['cashier'])).status).toBe(403);
  });

  it('refunds partially, then the rest, and never more than was paid', async () => {
    const part = await api.post(`/client/payments/${paymentId}/refund`, { refundAmount: 300, reason: 'Cold food' }, tok['manager']);
    expect(part.status).toBe(201);
    expect(part.body.data.refund.amount).toBe(-300);
    expect(part.body.data.remainingRefundable).toBe(700);
    expect(part.body.data.originalPayment.paymentStatus).toBe('Paid');

    expect((await api.post(`/client/payments/${paymentId}/refund`, { refundAmount: 701 }, tok['manager'])).body.code).toBe('INVALID_REFUND');

    const rest = await api.post(`/client/payments/${paymentId}/refund`, {}, tok['manager']);
    expect(rest.body.data.refundAmount).toBe(700);
    expect(rest.body.data.originalPayment.paymentStatus).toBe('Refunded');
    expect((await api.post(`/client/payments/${paymentId}/refund`, {}, tok['manager'])).body.code).toBe('NOT_REFUNDABLE');
  });

  it('reports the day net of refunds', async () => {
    const report = (await api.get('/client/payments/reports/daily', tok['manager'])).body.data;
    // Paid so far today: 500 + 250 + 1000 gross, 1000 refunded.
    expect(report.summary.grossSales).toBe(1750);
    expect(report.summary.refunds).toBe(1000);
    expect(report.summary.totalSales).toBe(750);
    expect(report.timeZone).toBe('Asia/Kathmandu');
    expect(report.hourlyBreakdown.reduce((s: number, h: { total: number }) => s + h.total, 0)).toBe(1750);

    const stats = (await api.get('/client/payments', tok['manager'])).body.stats;
    expect(stats.revenue.total).toBe(750);
  });

  it('needs report.view for the report', async () => {
    expect((await api.get('/client/payments/reports/daily', tok['cashier'])).status).toBe(403);
  });
});

describe('Khalti', () => {
  const start = (qrToken: string, orderId: string) => api.post('/public/payments/khalti/initiate', { qrToken, orderId });
  const callback = async (pidx: string) => {
    const res = await fetch(`${api.baseUrl}/public/payments/khalti/callback?pidx=${pidx}`, { redirect: 'manual' });
    return new URL(res.headers.get('location')!);
  };

  it('settles only when Khalti confirms the exact amount, and only once', async () => {
    const o = await order(2, true); // Rs 500
    khalti.initiate.mockResolvedValue({ pidx: 'pidx-ok', payment_url: 'https://pay.khalti.test/x', expires_at: '', expires_in: 1800 });
    const started = await start(o.table.qrToken, o.id);
    expect(started.status).toBe(200);
    expect(khalti.initiate.mock.calls[0]![0].amountPaisa).toBe(50000);

    khalti.lookup.mockResolvedValue({ pidx: 'pidx-ok', total_amount: 50000, status: 'Completed', transaction_id: 'TXN-1' });
    const back = await callback('pidx-ok');
    expect(back.pathname).toBe(`/t/${o.table.qrToken}/payment-result`);
    expect(back.searchParams.get('status')).toBe('success');
    expect((await api.get(`/client/orders/${o.id}`, tok['cashier'])).body.data.status).toBe('Paid');

    // Reloading the result page must not settle twice or call Khalti again.
    expect((await callback('pidx-ok')).searchParams.get('status')).toBe('success');
    expect(khalti.lookup).toHaveBeenCalledTimes(1);
  });

  it('refuses a short payment', async () => {
    const o = await order(1, true); // Rs 250
    khalti.initiate.mockResolvedValue({ pidx: 'pidx-short', payment_url: 'u', expires_at: '', expires_in: 1800 });
    await start(o.table.qrToken, o.id);
    khalti.lookup.mockResolvedValue({ pidx: 'pidx-short', total_amount: 100, status: 'Completed', transaction_id: 'T' });
    expect((await callback('pidx-short')).searchParams.get('status')).toBe('failed');
    expect((await api.get(`/client/orders/${o.id}`, tok['cashier'])).body.data.status).toBe('Served');
  });

  it('voids an in-flight checkout when items are added', async () => {
    const o = await order(1);
    khalti.initiate.mockResolvedValue({ pidx: 'pidx-stale', payment_url: 'u', expires_at: '', expires_in: 1800 });
    await start(o.table.qrToken, o.id);
    await api.post(`/client/orders/${o.id}/items`, { items: [{ menuItem: A.momo.id, quantity: 3 }] }, tok['waiter']);
    khalti.lookup.mockResolvedValue({ pidx: 'pidx-stale', total_amount: 25000, status: 'Completed', transaction_id: 'T' });
    expect((await callback('pidx-stale')).searchParams.get('status')).toBe('failed');
    const fresh = (await api.get(`/client/orders/${o.id}`, tok['cashier'])).body.data;
    expect(fresh.isPrepaid).toBe(false);
    expect(fresh.finalAmount).toBe(1000);
  });

  it('only lets a guest pay for orders at the table they scanned', async () => {
    const o = await order(1);
    const otherTable = A.tables.find((t) => t.id !== o.table.id)!;
    expect((await start(otherTable.qrToken, o.id)).status).toBe(404);
  });

  it('stays off for restaurants without their own Khalti keys yet', async () => {
    const res = await start(B.tables[0]!.qrToken, '00000000-0000-7000-8000-000000000000');
    expect(res.body.code).toBe('KHALTI_NOT_CONFIGURED');
  });

  it('sends unknown payments to an error page', async () => {
    expect((await callback('nope')).searchParams.get('status')).toBe('error');
  });
});
