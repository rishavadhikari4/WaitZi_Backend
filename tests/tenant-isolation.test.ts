import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import pg from 'pg';
import { asPlatform, withTenant, disconnectDB, type TenantTx } from '../src/config/prisma.js';

// Two organizations with one of everything. Every test asks: can org A see,
// change or create anything belonging to org B? The answer must always be no,
// and it must be the database (RLS) saying no, not application code.

async function makeOrg(slug: string) {
  return asPlatform('test: create org', async (db) => {
    const org = await db.organization.create({ data: { name: slug, slug } });
    const branch = await db.branch.create({ data: { orgId: org.id, name: 'Main' } });
    const role = await db.role.create({ data: { orgId: org.id, name: 'owner', permissions: ['*'] } });
    const user = await db.user.create({
      data: { firstName: slug, lastName: 'Owner', phone: `98${slug.length}${Date.now() % 1e7}${slug.charCodeAt(0)}`, email: `${slug}@test.local`, passwordHash: 'x' },
    });
    await db.membership.create({ data: { orgId: org.id, userId: user.id, roleId: role.id } });
    const category = await db.category.create({ data: { orgId: org.id, name: 'Momo' } });
    const menuItem = await db.menuItem.create({ data: { orgId: org.id, categoryId: category.id, name: 'Chicken Momo', pricePaisa: 25000 } });
    const table = await db.diningTable.create({ data: { orgId: org.id, branchId: branch.id, tableNumber: 1, capacity: 4 } });
    const order = await db.order.create({
      data: {
        orgId: org.id, branchId: branch.id, tableId: table.id, customerName: 'Guest', totalPaisa: 25000, finalPaisa: 25000,
        items: { create: [{ orgId: org.id, menuItemId: menuItem.id, name: 'Chicken Momo', quantity: 1, pricePaisa: 25000, subtotalPaisa: 25000 }] },
      },
      include: { items: true },
    });
    const payment = await db.payment.create({
      data: { orgId: org.id, branchId: branch.id, orderId: order.id, tableId: table.id, amountPaisa: 25000, method: 'Cash', status: 'Paid' },
    });
    return { org, branch, role, user, category, menuItem, table, order, orderItem: order.items[0], payment };
  });
}

// The same_org_refs trigger raises foreign_key_violation, which Prisma reports as P2003.
const FK_VIOLATION = /Foreign key constraint violated/;

type Fixture = Awaited<ReturnType<typeof makeOrg>>;
let A: Fixture;
let B: Fixture;
const asA = <T>(fn: (tx: TenantTx) => Promise<T>) => withTenant({ orgId: A.org.id, userId: A.user.id }, fn);

beforeAll(async () => {
  A = await makeOrg('alpha');
  B = await makeOrg('bravo');
});

afterAll(disconnectDB);

// [model delegate, key in the fixture]
type ModelName = 'branch' | 'role' | 'category' | 'menuItem' | 'diningTable' | 'order' | 'orderItem' | 'payment';
// Prisma delegates don't share a callable union type; the tests only use the
// common findMany/findUnique/updateMany/deleteMany surface.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const model = (db: unknown, name: ModelName) => (db as Record<ModelName, any>)[name];
const idOf = (f: Fixture, key: keyof Fixture) => (f[key] as { id: string }).id;
const TENANT_MODELS: [ModelName, keyof Fixture][] = [
  ['branch', 'branch'], ['role', 'role'], ['category', 'category'], ['menuItem', 'menuItem'],
  ['diningTable', 'table'], ['order', 'order'], ['orderItem', 'orderItem'], ['payment', 'payment'],
];

describe('tenant isolation (row-level security)', () => {
  it.each(TENANT_MODELS)('%s: lists only the current org', async (name, key) => {
    const rows: { id: string }[] = await asA((tx) => model(tx, name).findMany());
    expect(rows.map((r: { id: string }) => r.id)).toEqual([idOf(A, key)]);
  });

  it.each(TENANT_MODELS)('%s: cannot read another org by id', async (name, key) => {
    expect(await asA((tx) => model(tx, name).findUnique({ where: { id: idOf(B, key) } }))).toBeNull();
  });

  it.each(TENANT_MODELS)('%s: cannot update or delete another org', async (name, key) => {
    expect(await asA((tx) => model(tx, name).updateMany({ where: { id: idOf(B, key) }, data: {} }))).toEqual({ count: 0 });
    expect(await asA((tx) => model(tx, name).deleteMany({ where: { id: idOf(B, key) } }))).toEqual({ count: 0 });
    const stillThere = await asPlatform('test: verify', (db) => model(db, name).findUnique({ where: { id: idOf(B, key) } }));
    expect(stillThere).not.toBeNull();
  });

  it('cannot insert a row into another org', async () => {
    await expect(asA((tx) => tx.category.create({ data: { orgId: B.org.id, name: 'Sneaky' } }))).rejects.toThrow(/row-level security/i);
  });

  it('cannot move a row into another org', async () => {
    await expect(asA((tx) => tx.category.update({ where: { id: A.category.id }, data: { orgId: B.org.id } }))).rejects.toThrow(/row-level security/i);
  });

  // Foreign keys skip RLS; the same_org_refs triggers close that gap.
  it('cannot attach its order to another org\'s table', async () => {
    await expect(asA((tx) => tx.order.create({
      data: { orgId: A.org.id, branchId: A.branch.id, tableId: B.table.id, customerName: 'x' },
    }))).rejects.toThrow(FK_VIOLATION);
  });

  it('cannot order another org\'s menu item', async () => {
    await expect(asA((tx) => tx.orderItem.create({
      data: { orgId: A.org.id, orderId: A.order.id, menuItemId: B.menuItem.id, name: 'x', quantity: 1, pricePaisa: 1, subtotalPaisa: 1 },
    }))).rejects.toThrow(FK_VIOLATION);
  });

  it('cannot assign another org\'s staff as waiter', async () => {
    await expect(asA((tx) => tx.order.update({ where: { id: A.order.id }, data: { assignedWaiterId: B.user.id } })))
      .rejects.toThrow(FK_VIOLATION);
    // ...but its own staff is fine
    await asA((tx) => tx.order.update({ where: { id: A.order.id }, data: { assignedWaiterId: A.user.id } }));
  });

  it('cannot give a member another org\'s role', async () => {
    await expect(asA((tx) => tx.membership.updateMany({ where: { userId: A.user.id }, data: { roleId: B.role.id } })))
      .rejects.toThrow(FK_VIOLATION);
  });

  it('platform jobs are held to the same rule', async () => {
    await expect(asPlatform('test: cross-ref', (db) => db.payment.create({
      data: { orgId: A.org.id, branchId: A.branch.id, orderId: B.order.id, amountPaisa: 1, method: 'Cash' },
    }))).rejects.toThrow(FK_VIOLATION);
  });

  it('a connection with no tenant set sees nothing', async () => {
    const client = new pg.Client({ connectionString: process.env['DATABASE_URL'] });
    await client.connect();
    try {
      for (const t of ['organizations', 'users', 'orders', 'payments', 'menu_items', 'memberships']) {
        const { rows } = await client.query(`SELECT count(*)::int AS n FROM ${t}`);
        expect(rows[0].n, t).toBe(0);
      }
    } finally {
      await client.end();
    }
  });

  it('withTenant refuses a missing or malformed org id', async () => {
    await expect(withTenant({} as { orgId: string }, async () => 1)).rejects.toThrow(/orgId/);
    await expect(withTenant({ orgId: "x' OR 1=1 --" }, async () => 1)).rejects.toThrow(/orgId/);
  });
});

describe('organizations', () => {
  it('sees only itself', async () => {
    const orgs = await asA((tx) => tx.organization.findMany());
    expect(orgs.map((o) => o.id)).toEqual([A.org.id]);
  });

  it('cannot create organizations', async () => {
    await expect(asA((tx) => tx.organization.create({ data: { name: 'x', slug: 'x' } }))).rejects.toThrow(/row-level security/i);
  });
});

describe('users (global identities)', () => {
  it('sees only members of the current org', async () => {
    const users = await asA((tx) => tx.user.findMany());
    expect(users.map((u) => u.id)).toEqual([A.user.id]);
  });

  it('cannot create a platform user', async () => {
    await expect(asA((tx) => tx.user.create({
      data: { firstName: 'Evil', lastName: 'Admin', phone: '9811111111', email: 'evil@test.local', passwordHash: 'x', scope: 'platform', platformRole: 'super_admin' },
    }))).rejects.toThrow(/row-level security/i);
  });

  it('cannot promote anyone to a platform role', async () => {
    await expect(asA((tx) => tx.user.update({ where: { id: A.user.id }, data: { platformRole: 'super_admin' } }))).rejects.toThrow(/row-level security/i);
  });

  it('cannot edit a user from another org', async () => {
    expect(await asA((tx) => tx.user.updateMany({ where: { id: B.user.id }, data: { firstName: 'pwned' } }))).toEqual({ count: 0 });
  });

  it('cannot delete users', async () => {
    expect(await asA((tx) => tx.user.deleteMany({ where: { id: A.user.id } }))).toEqual({ count: 0 });
  });
});

describe('audit log', () => {
  it('is append-only for the app role', async () => {
    await asA((tx) => tx.auditLog.create({ data: { orgId: A.org.id, action: 'test' } }));
    await expect(asA((tx) => tx.auditLog.deleteMany({}))).rejects.toThrow(/permission denied/i);
  });
});

describe('RLS coverage', () => {
  it('every table with org_id (plus organizations and users) has forced RLS and a policy', async () => {
    const { rows } = await asPlatform('test: rls coverage', (db) => db.$queryRaw`
      SELECT c.relname AS table, c.relrowsecurity AS enabled, c.relforcerowsecurity AS forced,
             (SELECT count(*)::int FROM pg_policy p WHERE p.polrelid = c.oid) AS policies
      FROM pg_class c
      WHERE c.relnamespace = 'public'::regnamespace AND c.relkind = 'r'
        AND (c.relname IN ('organizations', 'users')
             OR EXISTS (SELECT 1 FROM pg_attribute a WHERE a.attrelid = c.oid AND a.attname = 'org_id' AND NOT a.attisdropped))
      ORDER BY 1`.then((r) => ({ rows: r as { table: string; enabled: boolean; forced: boolean; policies: number }[] })));
    expect(rows.length).toBeGreaterThanOrEqual(13);
    const unprotected = rows.filter((r) => !r.enabled || !r.forced || r.policies === 0).map((r) => r.table);
    expect(unprotected).toEqual([]);
  });
});
