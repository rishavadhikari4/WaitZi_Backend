// tests/migration.test.ts
// Imports a MongoDB shaped like the old production data and checks the
// result. Needs the test Mongo:  docker compose --profile migration up -d mongo
// Skipped when it isn't running.
import bcrypt from 'bcryptjs';
import mongoose from 'mongoose';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { importFromMongo, uuidV5 } from '../prisma/migrate-from-mongo.js';
import { asPlatform, disconnectDB } from '../src/config/prisma.js';
import { startServer } from './helpers/http.js';

const MONGO = process.env['MONGO_TEST_URL'] ?? 'mongodb://127.0.0.1:27018/waitzi_legacy_test';
const SLUG = 'legacy-import';
const oid = () => new mongoose.Types.ObjectId();

const mongoUp = await mongoose
  .createConnection(MONGO, { serverSelectionTimeoutMS: 1500 })
  .asPromise()
  .then(async (c) => {
    await c.close();
    return true;
  })
  .catch(() => false);

const ids = {
  adminRole: oid(), waiterRole: oid(), chefRole: oid(), cashierCustom: oid(),
  admin: oid(), waiter: oid(), chef: oid(), gmail: oid(),
  momoCat: oid(), drinkCat: oid(),
  momo: oid(), tea: oid(), gone: oid(), deletedItem: oid(),
  t1: oid(), t2: oid(), deletedTable: oid(),
  paidOrder: oid(), activeOrder: oid(), orphanTableOrder: oid(),
  cash: oid(), refund: oid(), orphanPayment: oid(),
};

async function seedMongo() {
  const conn = await mongoose.createConnection(MONGO).asPromise();
  const db = conn.db!;
  await db.dropDatabase();
  const hash = await bcrypt.hash('OldPassw0rd!', 12);
  const at = new Date('2026-09-01T06:00:00Z');

  await db.collection('roles').insertMany([
    { _id: ids.adminRole, name: 'admin', description: 'Admin' },
    { _id: ids.waiterRole, name: 'waiter', description: 'Waiter' },
    { _id: ids.chefRole, name: 'chef', description: 'Chef' },
    { _id: ids.cashierCustom, name: 'host', description: 'Front desk' },
  ]);
  const user = (_id: mongoose.Types.ObjectId, email: string, number: string, role: mongoose.Types.ObjectId, extra = {}) => ({
    _id, firstName: email.split('@')[0], lastName: 'Legacy', address: 'Thamel, Kathmandu', number, email, password: hash, role,
    status: 'Active', createdAt: at, ...extra,
  });
  await db.collection('users').insertMany([
    user(ids.admin, 'boss@legacy.test', '9851000001', ids.adminRole),
    user(ids.waiter, 'sita@legacy.test', '9851000002', ids.waiterRole),
    user(ids.chef, 'ram@legacy.test', '9851000003', ids.chefRole, { status: 'Inactive' }),
    // Stored dot-stripped by the old normalizeEmail().
    user(ids.gmail, 'harishrestha@gmail.com', '9851000004', ids.cashierCustom),
  ]);
  await db.collection('categories').insertMany([
    { _id: ids.momoCat, name: 'Momo', description: 'Dumplings', image: 'https://img/momo.webp', isActive: true, createdAt: at },
    { _id: ids.drinkCat, name: 'Drinks', description: 'Hot and cold', isActive: false, createdAt: at },
  ]);
  await db.collection('menus').insertMany([
    { _id: ids.momo, name: 'Chicken Momo', category: ids.momoCat, price: 250.5, availabilityStatus: 'Available', createdAt: at },
    { _id: ids.tea, name: 'Masala Tea', category: ids.drinkCat, price: 60, availabilityStatus: 'Available', createdAt: at },
    { _id: ids.gone, name: 'Sekuwa', category: ids.momoCat, price: 380, availabilityStatus: 'Out of Stock', createdAt: at },
  ]);
  await db.collection('tables').insertMany([
    { _id: ids.t1, tableNumber: 1, capacity: 4, status: 'Available', assignedWaiter: ids.waiter, createdAt: at },
    { _id: ids.t2, tableNumber: 2, capacity: 2, status: 'Occupied', currentOrder: ids.activeOrder, createdAt: at },
  ]);
  const line = (menuItem: mongoose.Types.ObjectId, name: string, price: number, quantity: number, status = 'Served') => ({
    _id: oid(), menuItem, name, price, quantity, subtotal: price * quantity, status, notes: '',
  });
  await db.collection('orders').insertMany([
    {
      _id: ids.paidOrder, table: ids.t1, customerName: 'Gita', status: 'Completed', discount: 0,
      items: [line(ids.momo, 'Chicken Momo', 250.5, 2), line(ids.deletedItem, 'Buff Choila', 300, 1)],
      totalAmount: 801, finalAmount: 801, assignedWaiter: ids.waiter, cookedBy: ids.chef, servedBy: ids.waiter, createdAt: at,
    },
    {
      _id: ids.activeOrder, table: ids.t2, customerName: 'Hari', status: 'InKitchen', discount: 10,
      items: [line(ids.tea, 'Masala Tea', 60, 3, 'Cooking')], totalAmount: 180, finalAmount: 170, createdAt: at,
    },
    {
      _id: ids.orphanTableOrder, table: ids.deletedTable, customerName: 'Old', status: 'Cancelled', discount: 0,
      items: [line(ids.tea, 'Masala Tea', 60, 1, 'Pending')], totalAmount: 60, finalAmount: 60, createdAt: at,
    },
  ]);
  await db.collection('payments').insertMany([
    { _id: ids.cash, order: ids.paidOrder, table: ids.t1, amount: 801, paymentMethod: 'Cash', paymentStatus: 'Paid', handledBy: ids.admin, paymentTime: at },
    { _id: ids.refund, order: ids.paidOrder, table: ids.t1, amount: -100, paymentMethod: 'Cash', paymentStatus: 'Refunded', transactionId: `REFUND-${ids.cash}`, paymentTime: at },
    { _id: ids.orphanPayment, order: oid(), amount: 99, paymentMethod: 'Cash', paymentStatus: 'Paid', paymentTime: at },
  ]);
  await conn.close();
}

const quiet = () => undefined;
const run = (dryRun = false) => importFromMongo({ mongoUri: MONGO, orgSlug: SLUG, orgName: 'Legacy Kitchen', dryRun, log: quiet });

describe.skipIf(!mongoUp)('Mongo -> Postgres import', () => {
  let api: Awaited<ReturnType<typeof startServer>>;

  beforeAll(async () => {
    await seedMongo();
    api = await startServer();
  });

  afterAll(async () => {
    await api?.close();
    await disconnectDB();
  });

  it('dry run reports everything and writes nothing', async () => {
    const report = await run(true);
    expect(report.dryRun).toBe(true);
    expect(report.counts['orders']).toEqual({ source: 3, imported: 3 });
    const org = await asPlatform('t', (db) => db.organization.findUnique({ where: { slug: SLUG } }));
    expect(org).toBeNull();
  });

  it('imports every record and the money matches', async () => {
    const report = await run();
    expect(report.counts).toMatchObject({
      roles: { source: 4, imported: 4 },
      users: { source: 4, imported: 4 },
      'menu items': { source: 3, imported: 3 },
      tables: { source: 2, imported: 2 },
      orders: { source: 3, imported: 3 },
      payments: { source: 3, imported: 2 }, // the orphan is reported, not imported
    });
    expect(report.totals.ordersFinalRupees).toEqual({ source: 1031, target: 1031 });
    expect(report.fixes.join('\n')).toMatch(/Buff Choila.*archived copy/);
    expect(report.fixes.join('\n')).toMatch(/deleted table/);
    expect(report.fixes.join('\n')).toMatch(/Payment .* skipped/);
    expect(report.fixes.join('\n')).toMatch(/Role "host".*waiter permissions/);
  });

  it('is idempotent', async () => {
    const before = await asPlatform('t', (db) =>
      Promise.all([db.order.count(), db.orderItem.count(), db.payment.count(), db.user.count(), db.menuItem.count()]),
    );
    const again = await run();
    const after = await asPlatform('t', (db) =>
      Promise.all([db.order.count(), db.orderItem.count(), db.payment.count(), db.user.count(), db.menuItem.count()]),
    );
    expect(after).toEqual(before);
    expect(again.totals.ordersFinalRupees.target).toBe(1031);
  });

  it('keeps prices, statuses, people and links intact', async () => {
    const orgId = (await asPlatform('t', (db) => db.organization.findUniqueOrThrow({ where: { slug: SLUG } }))).id;
    const [momo, gone, drinks, paid, active, t2, refund, chef] = await asPlatform('t', (db) =>
      Promise.all([
        db.menuItem.findUniqueOrThrow({ where: { id: uuidV5(`${SLUG}/menus/${ids.momo}`) } }),
        db.menuItem.findUniqueOrThrow({ where: { id: uuidV5(`${SLUG}/menus/${ids.gone}`) } }),
        db.category.findUniqueOrThrow({ where: { id: uuidV5(`${SLUG}/categories/${ids.drinkCat}`) } }),
        db.order.findUniqueOrThrow({ where: { id: uuidV5(`${SLUG}/orders/${ids.paidOrder}`) }, include: { items: true } }),
        db.order.findUniqueOrThrow({ where: { id: uuidV5(`${SLUG}/orders/${ids.activeOrder}`) } }),
        db.diningTable.findUniqueOrThrow({ where: { id: uuidV5(`${SLUG}/tables/${ids.t2}`) } }),
        db.payment.findUniqueOrThrow({ where: { id: uuidV5(`${SLUG}/payments/${ids.refund}`) } }),
        db.membership.findFirstOrThrow({ where: { orgId, user: { email: 'ram@legacy.test' } }, include: { role: true } }),
      ]),
    );
    expect(momo.pricePaisa).toBe(25050);
    expect(gone.availabilityStatus).toBe('OutOfStock');
    expect(drinks.isActive).toBe(false);
    expect(paid.status).toBe('Completed');
    expect(paid.cookedById).toBe(chef.userId);
    expect(paid.items).toHaveLength(2);
    expect(active.discountPaisa).toBe(1000);
    expect(active.finalPaisa).toBe(17000);
    expect(t2.currentOrderId).toBe(active.id);
    expect(refund.amountPaisa).toBe(-10000);
    expect(refund.transactionId).toBe(`REFUND-${uuidV5(`${SLUG}/payments/${ids.cash}`)}`);
    expect(chef.role.name).toBe('chef');
    expect(chef.role.permissions).toContain('kot.update');
    expect(chef.status).toBe('Inactive');
  });

  it('lets migrated staff log in with their old passwords', async () => {
    const res = await api.post('/auth/login', { email: 'boss@legacy.test', password: 'OldPassw0rd!' });
    expect(res.status).toBe(200);
    expect(res.body.data.user.role.name).toBe('admin');
    const gmail = await api.post('/auth/login', { email: 'Hari.Shrestha@gmail.com', password: 'OldPassw0rd!' });
    expect(gmail.status).toBe(200);
    // Inactive staff stay locked out.
    expect((await api.post('/auth/login', { email: 'ram@legacy.test', password: 'OldPassw0rd!' })).status).toBe(401);
  });

  it('keeps already-printed QR stickers working', async () => {
    const res = await api.get(`/public/tables/${ids.t1.toHexString()}/ordering`);
    expect(res.status).toBe(200);
    expect(res.body.data.restaurant.name).toBe('Legacy Kitchen');
    // Inactive Drinks category and out-of-stock Sekuwa stay hidden from guests.
    expect(res.body.data.menu.flatMap((c: { items: { name: string }[] }) => c.items.map((i) => i.name))).toEqual(['Chicken Momo']);
  });
});
