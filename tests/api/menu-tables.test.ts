// tests/api/menu-tables.test.ts
// Categories, menu items, tables, QR codes and the public ordering page.
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';

// Cloudinary isn't reachable from tests; uploads get a fake URL per call.
vi.mock('../../src/services/media/image.service.js', () => ({
  default: {
    upload: vi.fn(async (orgId: string, kind: string) => ({
      url: `https://img.test/${orgId}/${kind}/${Math.random().toString(36).slice(2)}.webp`,
      publicId: `waitzi/${orgId}/${kind}/x`,
    })),
    remove: vi.fn(async () => undefined),
  },
}));

import { asPlatform, disconnectDB } from '../../src/config/prisma.js';
import { ROLE_TEMPLATES } from '../../src/constants/permissions.js';
import { hashPassword } from '../../src/utils/Helpers.js';
import { startServer } from '../helpers/http.js';

const PASSWORD = 'Passw0rd!x';
let api: Awaited<ReturnType<typeof startServer>>;
let base: string;
let phone = 9710000000;

async function makeOrg(slug: string, branchNames: string[]) {
  return asPlatform('test: org', async (db) => {
    const org = await db.organization.create({ data: { name: `Org ${slug}`, slug, status: 'active' } });
    const branches = [];
    for (const name of branchNames) branches.push(await db.branch.create({ data: { orgId: org.id, name } }));
    const roles: Record<string, string> = {};
    for (const t of ROLE_TEMPLATES) roles[t.name] = (await db.role.create({ data: { orgId: org.id, ...t, isSystem: true } })).id;
    const users: Record<string, string> = {};
    for (const role of ['admin', 'waiter', 'kitchen_staff']) {
      const u = await db.user.create({
        data: { firstName: role, lastName: slug, email: `${role}@${slug}.test`, phone: String(++phone), passwordHash: await hashPassword(PASSWORD) },
      });
      await db.membership.create({ data: { orgId: org.id, userId: u.id, roleId: roles[role]! } });
      users[role] = u.id;
    }
    return { org, branches, roles, users };
  });
}

const tokenFor = async (email: string) =>
  (await api.post('/auth/login', { email, password: PASSWORD })).body.data.accessToken as string;

async function multipart(method: 'POST' | 'PUT', path: string, token: string, fields: Record<string, string>, withImage = true) {
  const form = new FormData();
  for (const [k, v] of Object.entries(fields)) form.append(k, v);
  if (withImage) form.append('image', new Blob([new Uint8Array([0x89, 0x50, 0x4e, 0x47])], { type: 'image/png' }), 'pic.png');
  const res = await fetch(`${base}${path}`, { method, headers: { Authorization: `Bearer ${token}` }, body: form });
  return { status: res.status, body: (await res.json()) as any };
}

let A: Awaited<ReturnType<typeof makeOrg>>;
let B: Awaited<ReturnType<typeof makeOrg>>;
const T: Record<string, string> = {};
let momoCat: string;

beforeAll(async () => {
  api = await startServer();
  base = api.baseUrl;
  A = await makeOrg('mt-alpha', ['Thamel']);
  B = await makeOrg('mt-bravo', ['Lakeside', 'Damside']);
  T['adminA'] = await tokenFor('admin@mt-alpha.test');
  T['waiterA'] = await tokenFor('waiter@mt-alpha.test');
  T['chefA'] = await tokenFor('kitchen_staff@mt-alpha.test');
  T['adminB'] = await tokenFor('admin@mt-bravo.test');
});

afterAll(async () => {
  await api.close();
  await disconnectDB();
});

describe('categories', () => {
  it('creates with an image and rejects a case-insensitive duplicate', async () => {
    const created = await multipart('POST', '/client/categories', T['adminA']!, { name: 'Momo', description: 'Dumplings' });
    expect(created.status).toBe(201);
    expect(created.body.data.image).toContain(`/${A.org.id}/categories/`);
    expect(created.body.data._id).toBe(created.body.data.id);
    momoCat = created.body.data.id;

    const dup = await multipart('POST', '/client/categories', T['adminA']!, { name: 'MOMO', description: 'again' });
    expect(dup.status).toBe(409);
  });

  it('requires an image', async () => {
    const res = await multipart('POST', '/client/categories', T['adminA']!, { name: 'Drinks', description: 'Cold and hot' }, false);
    expect(res.body.code).toBe('IMAGE_REQUIRED');
  });

  it('is invisible to other organizations', async () => {
    expect((await api.get(`/client/categories/${momoCat}`, T['adminB'])).status).toBe(404);
    const list = await api.get('/client/categories', T['adminB']);
    expect(list.body.data).toEqual([]);
  });

  it('updates isActive from a form string', async () => {
    const res = await multipart('PUT', `/client/categories/${momoCat}`, T['adminA']!, { isActive: 'false' }, false);
    expect(res.status).toBe(200);
    expect(res.body.data.isActive).toBe(false);
    await multipart('PUT', `/client/categories/${momoCat}`, T['adminA']!, { isActive: 'true' }, false);
  });
});

describe('menu items', () => {
  let item: string;

  it('stores rupees as paisa and returns rupees with the category populated', async () => {
    const res = await api.post('/client/menu', { name: 'Jhol Momo', category: momoCat, price: '250.50' }, T['adminA']);
    expect(res.status).toBe(201);
    expect(res.body.data.price).toBe(250.5);
    expect(res.body.data.availabilityStatus).toBe('Available');
    expect(res.body.data.category.name).toBe('Momo');
    item = res.body.data.id;
    const stored = await asPlatform('test: read paisa', (db) => db.menuItem.findUnique({ where: { id: item } }));
    expect(stored?.pricePaisa).toBe(25050);
  });

  it('rejects sub-paisa prices and other orgs\' categories', async () => {
    expect((await api.post('/client/menu', { name: 'Xtra Chilli', category: momoCat, price: 1.005 }, T['adminA'])).status).toBe(400);
    const foreign = await api.post('/client/menu', { name: 'Yak Cheese', category: momoCat, price: 10 }, T['adminB']);
    expect(foreign.body.code).toBe('CATEGORY_NOT_FOUND');
  });

  it('lets kitchen staff 86 an item but not edit the menu', async () => {
    const off = await api.patch(`/client/menu/${item}/availability`, { availabilityStatus: 'Out of Stock' }, T['chefA']);
    expect(off.status).toBe(200);
    expect(off.body.data.availabilityStatus).toBe('Out of Stock');
    expect((await api.post('/client/menu', { name: 'Zesty Momo', category: momoCat, price: 5 }, T['chefA'])).status).toBe(403);
  });

  it('filters by availability and price range', async () => {
    await api.post('/client/menu', { name: 'Chicken Momo', category: momoCat, price: 300 }, T['adminA']);
    const out = await api.get('/client/menu?availabilityStatus=Out%20of%20Stock', T['adminA']);
    expect(out.body.data.map((i: { name: string }) => i.name)).toEqual(['Jhol Momo']);
    const cheap = await api.get('/client/menu?maxPrice=260', T['adminA']);
    expect(cheap.body.data.map((i: { name: string }) => i.name)).toEqual(['Jhol Momo']);
    const sorted = await api.get('/client/menu?sortBy=price&sortOrder=desc', T['adminA']);
    expect(sorted.body.data[0].name).toBe('Chicken Momo');
  });

  it('refuses to delete a category that still has items', async () => {
    const res = await api.del(`/client/categories/${momoCat}`, T['adminA']);
    expect(res.body.code).toBe('CATEGORY_IN_USE');
  });
});

describe('tables', () => {
  let t1: string;

  it('picks the only branch automatically and enforces unique numbers', async () => {
    const res = await api.post('/client/tables', { tableNumber: 1, capacity: 4 }, T['adminA']);
    expect(res.status).toBe(201);
    expect(res.body.data.branchId).toBe(A.branches[0]!.id);
    expect(res.body.data.qrToken).toMatch(/^[0-9a-f]{32}$/);
    t1 = res.body.data.id;
    expect((await api.post('/client/tables', { tableNumber: 1, capacity: 2 }, T['adminA'])).body.code).toBe('TABLE_NUMBER_TAKEN');
  });

  it('asks multi-branch orgs which branch, and allows the same number per branch', async () => {
    expect((await api.post('/client/tables', { tableNumber: 1, capacity: 4 }, T['adminB'])).body.code).toBe('BRANCH_REQUIRED');
    const lake = await api.post('/client/tables', { tableNumber: 1, capacity: 4, branchId: B.branches[0]!.id }, T['adminB']);
    const dam = await api.post('/client/tables', { tableNumber: 1, capacity: 4, branchId: B.branches[1]!.id }, T['adminB']);
    expect([lake.status, dam.status]).toEqual([201, 201]);
    // A branch from another org is simply not found.
    expect((await api.post('/client/tables', { tableNumber: 2, capacity: 4, branchId: A.branches[0]!.id }, T['adminB'])).body.code).toBe('BRANCH_NOT_FOUND');
  });

  it('assigns only this org\'s staff as waiter, and clears with an empty string', async () => {
    const own = await api.put(`/client/tables/${t1}`, { assignedWaiter: A.users['waiter'] }, T['adminA']);
    expect(own.body.data.assignedWaiter.firstName).toBe('waiter');
    const foreign = await api.put(`/client/tables/${t1}`, { assignedWaiter: B.users['waiter'] }, T['adminA']);
    expect(foreign.body.code).toBe('INVALID_REFERENCE');
    const cleared = await api.put(`/client/tables/${t1}`, { assignedWaiter: '' }, T['adminA']);
    expect(cleared.body.data.assignedWaiter).toBeNull();
    await api.put(`/client/tables/${t1}`, { assignedWaiter: A.users['waiter'] }, T['adminA']);
  });

  it('lets waiters work the floor but not set up tables', async () => {
    expect((await api.patch(`/client/tables/${t1}/status`, { status: 'Reserved' }, T['waiterA'])).status).toBe(200);
    expect((await api.post('/client/tables', { tableNumber: 9, capacity: 2 }, T['waiterA'])).status).toBe(403);
    const list = await api.get('/client/tables', T['waiterA']);
    expect(list.body.stats.reserved).toBe(1);
    await api.patch(`/client/tables/${t1}/clear`, undefined, T['waiterA']);
  });

  it('keeps tables that have order history', async () => {
    const t = (await api.post('/client/tables', { tableNumber: 5, capacity: 2 }, T['adminA'])).body.data;
    await asPlatform('test: order history', (db) =>
      db.order.create({ data: { orgId: A.org.id, branchId: t.branchId, tableId: t.id, customerName: 'Old guest', status: 'Completed' } }),
    );
    expect((await api.del(`/client/tables/${t.id}`, T['adminA'])).body.code).toBe('TABLE_HAS_HISTORY');
  });

  it('generates QR codes that point at the table token', async () => {
    const url = await api.get(`/client/tables/${t1}/qr?format=url`, T['adminA']);
    const table = (await api.get(`/client/tables/${t1}`, T['adminA'])).body.data;
    expect(url.body.data.qrData).toMatch(new RegExp(`/t/${table.qrToken}$`));

    const png = await api.get(`/client/tables/${t1}/qr`, T['adminA']);
    expect(png.body.data.qrCode).toMatch(/^data:image\/png;base64,/);

    const all = await api.get('/client/tables/qr/all?format=url', T['adminA']);
    expect(all.body.meta.totalTables).toBe(all.body.data.length);

    const file = await fetch(`${api.baseUrl}/client/tables/${t1}/qr/download?format=svg`, { headers: { Authorization: `Bearer ${T['adminA']}` } });
    expect(file.headers.get('content-type')).toContain('image/svg+xml');

    const stats = await api.get(`/client/tables/${t1}/qr/analytics`, T['adminA']);
    expect(stats.body.data.analytics.totalScans).toBeNull();
  });

  it('hides other orgs\' tables', async () => {
    expect((await api.get(`/client/tables/${t1}`, T['adminB'])).status).toBe(404);
    expect((await api.get(`/client/tables/${t1}/qr`, T['adminB'])).status).toBe(404);
  });
});

describe('public ordering page', () => {
  let table: { id: string; qrToken: string; tableNumber: number };

  beforeAll(async () => {
    table = (await api.get('/client/tables?limit=1&sortBy=tableNumber', T['adminA'])).body.data[0];
  });

  it('loads table, restaurant and only orderable items by QR token', async () => {
    const res = await api.get(`/public/qr/${table.qrToken}`);
    expect(res.status).toBe(200);
    expect(res.body.data.restaurant.name).toBe('Org mt-alpha');
    expect(res.body.data.table.isAvailableForOrder).toBe(true);
    const names = res.body.data.menu.flatMap((c: { items: { name: string }[] }) => c.items.map((i) => i.name));
    expect(names).toEqual(['Chicken Momo']); // Jhol Momo is out of stock
    expect(res.body.data.table.assignedWaiter).toEqual({ firstName: 'waiter', lastName: 'mt-alpha' });
  });

  it('hides inactive categories', async () => {
    await multipart('PUT', `/client/categories/${momoCat}`, T['adminA']!, { isActive: 'false' }, false);
    const res = await api.get(`/public/qr/${table.qrToken}`);
    expect(res.body.data.menu).toEqual([]);
    await multipart('PUT', `/client/categories/${momoCat}`, T['adminA']!, { isActive: 'true' }, false);
  });

  it('still opens tables from QR stickers printed before the Postgres move', async () => {
    await asPlatform('test: legacy id', (db) => db.diningTable.update({ where: { id: table.id }, data: { legacyId: '64b7f0c2e4b0a1a2b3c4d5e6' } }));
    const res = await api.get('/public/tables/64B7F0C2E4B0A1A2B3C4D5E6/ordering');
    expect(res.status).toBe(200);
    expect(res.body.data.table.id).toBe(table.id);
  });

  it('opens number-only links for a named organization', async () => {
    const ok = await api.get(`/public/tables/number/${table.tableNumber}/ordering?org=mt-alpha`);
    expect(ok.body.data.table.id).toBe(table.id);
    expect((await api.get(`/public/tables/number/${table.tableNumber}/ordering?org=no-such-place`)).status).toBe(404);
    // Without ?org the server's DEFAULT_ORG_SLUG decides; it must never fall back to this org's table.
    const noOrg = await api.get(`/public/tables/number/${table.tableNumber}/ordering`);
    if (noOrg.status === 200) expect(noOrg.body.data.table.id).not.toBe(table.id);
  });

  it('404s unknown or malformed identifiers', async () => {
    expect((await api.get(`/public/qr/${'0'.repeat(32)}`)).status).toBe(404);
    expect((await api.get('/public/qr/not-a-token')).status).toBe(400);
  });
});
