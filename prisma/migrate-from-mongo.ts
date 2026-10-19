// prisma/migrate-from-mongo.ts
// One-time import of the old single-restaurant MongoDB into one Postgres
// organization.
//
//   npm run db:import-mongo -- --mongo "<MONGO_URI>" --org-slug himalayan-kitchen --org-name "Himalayan Kitchen" --dry-run
//   npm run db:import-mongo -- --mongo "<MONGO_URI>" --org-slug himalayan-kitchen --org-name "Himalayan Kitchen"
//
// Guarantees:
// - MongoDB is only read.
// - Everything is written in ONE Postgres transaction: it fully lands or
//   nothing changes. --dry-run does the whole import, prints the report, then
//   rolls back.
// - Idempotent: every Mongo _id maps to a deterministic UUID (v5), so running
//   it again updates rows instead of duplicating them.
// - Printed QR stickers keep working: tables keep their Mongo _id in legacy_id.
// - Nothing is silently dropped: orders that point at deleted menu items or
//   tables get archived placeholders, and the report lists every such fix.
import crypto from 'node:crypto';
import { parseArgs } from 'node:util';

import type { Prisma, PrismaClient } from '@prisma/client';
import mongoose from 'mongoose';

import { asPlatform, disconnectDB } from '../src/config/prisma.js';
import { ROLE_TEMPLATES } from '../src/constants/permissions.js';

// ── Deterministic ids ───────────────────────────────────────────────────────

const NAMESPACE = '6f6b1c8e-2f5d-5b9a-9a43-7c1e0e2a5d10';

/** RFC 4122 v5 UUID from a name (sha1), so re-runs produce the same ids. */
export function uuidV5(name: string, namespace = NAMESPACE): string {
  const ns = Buffer.from(namespace.replace(/-/g, ''), 'hex');
  const hash = crypto.createHash('sha1').update(Buffer.concat([ns, Buffer.from(name)])).digest();
  hash[6] = (hash[6]! & 0x0f) | 0x50;
  hash[8] = (hash[8]! & 0x3f) | 0x80;
  const h = hash.subarray(0, 16).toString('hex');
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-${h.slice(12, 16)}-${h.slice(16, 20)}-${h.slice(20, 32)}`;
}

const idFor = (orgSlug: string, collection: string, mongoId: unknown) => uuidV5(`${orgSlug}/${collection}/${String(mongoId)}`);
const paisa = (rupees: unknown) => Math.round(Number(rupees ?? 0) * 100);
const str = (v: unknown) => (v == null ? undefined : String(v));
const date = (v: unknown) => (v ? new Date(v as string) : undefined);

// ── Types of the old documents (only the fields we read) ────────────────────

type Doc = Record<string, unknown> & { _id: unknown };

export interface ImportOptions {
  mongoUri: string;
  orgSlug: string;
  orgName: string;
  branchName?: string;
  dryRun?: boolean;
  log?: (line: string) => void;
}

export interface ImportReport {
  dryRun: boolean;
  orgId: string;
  counts: Record<string, { source: number; imported: number }>;
  totals: { ordersFinalRupees: { source: number; target: number }; paymentsRupees: { source: number; target: number } };
  fixes: string[];
}

class DryRunRollback extends Error {
  constructor(readonly report: ImportReport) {
    super('dry run');
  }
}

// ── The import ──────────────────────────────────────────────────────────────

export async function importFromMongo(opts: ImportOptions): Promise<ImportReport> {
  const log = opts.log ?? console.log;
  const conn = await mongoose.createConnection(opts.mongoUri, { readPreference: 'secondaryPreferred' }).asPromise();
  try {
    const read = async (name: string) => (await conn.db!.collection(name).find({}).toArray()) as unknown as Doc[];
    const src = {
      roles: await read('roles'),
      users: await read('users'),
      categories: await read('categories'),
      menus: await read('menus'),
      tables: await read('tables'),
      orders: await read('orders'),
      payments: await read('payments'),
    };
    log(`Read from MongoDB: ${Object.entries(src).map(([k, v]) => `${v.length} ${k}`).join(', ')}`);

    try {
      return await asPlatform('import: mongo -> postgres', (db) =>
        db.$transaction((tx) => run(tx as unknown as PrismaClient, src, opts, log), { timeout: 10 * 60_000, maxWait: 30_000 }),
      );
    } catch (error) {
      if (error instanceof DryRunRollback) return error.report;
      throw error;
    }
  } finally {
    await conn.close();
  }
}

async function run(tx: PrismaClient, src: Record<string, Doc[]>, opts: ImportOptions, log: (l: string) => void): Promise<ImportReport> {
  const slug = opts.orgSlug;
  const id = (collection: string, mongoId: unknown) => idFor(slug, collection, mongoId);
  const fixes: string[] = [];
  const counts: ImportReport['counts'] = {};
  const count = (k: string, source: number, imported: number) => (counts[k] = { source, imported });

  // Organization, branch and role templates.
  const org = await tx.organization.upsert({
    where: { slug },
    update: { name: opts.orgName },
    create: { id: uuidV5(`org/${slug}`), name: opts.orgName, slug, status: 'active' },
  });
  const orgId = org.id;
  const branch = await tx.branch.upsert({
    where: { orgId_name: { orgId, name: opts.branchName ?? 'Main' } },
    update: {},
    create: { orgId, name: opts.branchName ?? 'Main' },
  });
  for (const t of ROLE_TEMPLATES) {
    await tx.role.upsert({
      where: { orgId_name: { orgId, name: t.name } },
      update: {},
      create: { orgId, ...t, isSystem: true },
    });
  }

  // Roles: same name -> template; 'chef' -> kitchen permissions; anything else
  // keeps its name with waiter-level access and is reported for review.
  const template = (name: string) => ROLE_TEMPLATES.find((t) => t.name === name)!;
  const roleIdByMongo = new Map<string, string>();
  for (const r of src['roles']!) {
    const name = String(r['name'] ?? '').toLowerCase().trim() || 'staff';
    const known = ROLE_TEMPLATES.some((t) => t.name === name);
    const permissions = known ? template(name).permissions : name === 'chef' ? template('kitchen_staff').permissions : template('waiter').permissions;
    if (!known && name !== 'chef') fixes.push(`Role "${name}" had no fixed meaning before; given waiter permissions. Review it under Roles.`);
    const role = await tx.role.upsert({
      where: { orgId_name: { orgId, name } },
      update: {},
      create: { orgId, name, description: str(r['description']) ?? `${name} role`, permissions, isSystem: false },
    });
    roleIdByMongo.set(String(r._id), role.id);
  }
  count('roles', src['roles']!.length, roleIdByMongo.size);
  log('Roles done');
  const fallbackRole = (await tx.role.findUniqueOrThrow({ where: { orgId_name: { orgId, name: 'waiter' } } })).id;

  // Users -> global users + a membership in this org. An email already in
  // Postgres (an earlier run, or a person in another org) is reused, not duplicated.
  const userIdByMongo = new Map<string, string>();
  for (const u of src['users']!) {
    const email = String(u['email']).toLowerCase().trim();
    const existing = await tx.user.findUnique({ where: { email } });
    const userId = existing?.id ?? id('users', u._id);
    const fields = {
      firstName: String(u['firstName'] ?? 'Unknown'),
      lastName: String(u['lastName'] ?? ''),
      address: str(u['address']) ?? null,
      image: str(u['image']) ?? null,
      imageId: str(u['imageId']) ?? null,
      passwordHash: String(u['password']),
      resetPasswordToken: str(u['resetPasswordToken']) ?? null,
      resetPasswordExpires: date(u['resetPasswordExpires']) ?? null,
      passwordChangedAt: date(u['passwordChangedAt']) ?? new Date(),
      mustChangePassword: Boolean(u['mustChangePassword']),
    };
    let phone = String(u['number'] ?? '').trim();
    const phoneOwner = phone ? await tx.user.findUnique({ where: { phone } }) : null;
    if (!phone || (phoneOwner && phoneOwner.id !== userId)) {
      phone = `migrated-${String(u._id)}`;
      fixes.push(`User ${email}: phone missing or used by another account; set a placeholder, update it in their profile.`);
    }
    if (existing) {
      if (existing.id !== id('users', u._id)) fixes.push(`User ${email} already existed in Postgres; linked to that account (profile and password left as they are).`);
    } else {
      await tx.user.create({ data: { id: userId, email, phone, ...fields, createdAt: date(u['createdAt']) ?? new Date() } });
    }
    const roleId = roleIdByMongo.get(String(u['role'])) ?? fallbackRole;
    if (!roleIdByMongo.has(String(u['role']))) fixes.push(`User ${email}: role missing in the old data; given the waiter role.`);
    const status = u['status'] === 'Inactive' ? 'Inactive' : 'Active';
    await tx.membership.upsert({
      where: { orgId_userId: { orgId, userId } },
      update: { roleId, status },
      create: { orgId, userId, roleId, status, createdAt: date(u['createdAt']) ?? new Date() },
    });
    userIdByMongo.set(String(u._id), userId);
  }
  count('users', src['users']!.length, userIdByMongo.size);
  log('Users done');
  const member = (mongoId: unknown) => (mongoId ? userIdByMongo.get(String(mongoId)) ?? null : null);

  // Categories and menu.
  for (const c of src['categories']!) {
    const data = {
      orgId,
      name: String(c['name']),
      description: str(c['description']) ?? null,
      image: str(c['image']) ?? null,
      imageId: str(c['imageId']) ?? null,
      isActive: c['isActive'] !== false,
    };
    await tx.category.upsert({ where: { id: id('categories', c._id) }, update: data, create: { id: id('categories', c._id), ...data, createdAt: date(c['createdAt']) ?? new Date() } });
  }
  count('categories', src['categories']!.length, src['categories']!.length);

  let archiveCategoryId: string | undefined;
  const archiveCategory = async () =>
    (archiveCategoryId ??= (
      await tx.category.upsert({
        where: { orgId_name: { orgId, name: 'Archived (imported)' } },
        update: {},
        create: { orgId, name: 'Archived (imported)', description: 'Items referenced by old orders that no longer existed', isActive: false },
      })
    ).id);

  const categoryIds = new Set(src['categories']!.map((c) => String(c._id)));
  const menuIds = new Set<string>();
  for (const m of src['menus']!) {
    let categoryId = id('categories', m['category']);
    if (!categoryIds.has(String(m['category']))) {
      categoryId = await archiveCategory();
      fixes.push(`Menu item "${String(m['name'])}": its category no longer existed; moved to "Archived (imported)".`);
    }
    const data = {
      orgId,
      categoryId,
      name: String(m['name']),
      pricePaisa: paisa(m['price']),
      description: str(m['description']) ?? null,
      image: str(m['image']) ?? null,
      imageId: str(m['imageId']) ?? null,
      availabilityStatus: m['availabilityStatus'] === 'Out of Stock' ? ('OutOfStock' as const) : ('Available' as const),
    };
    await tx.menuItem.upsert({ where: { id: id('menus', m._id) }, update: data, create: { id: id('menus', m._id), ...data, createdAt: date(m['createdAt']) ?? new Date() } });
    menuIds.add(String(m._id));
  }
  count('menu items', src['menus']!.length, menuIds.size);

  /** An order line pointing at a deleted menu item gets an archived stand-in. */
  const menuItemFor = async (mongoId: unknown, name: string, pricePaisa: number) => {
    if (menuIds.has(String(mongoId))) return id('menus', mongoId);
    const placeholderId = id('menus', `deleted:${String(mongoId)}`);
    await tx.menuItem.upsert({
      where: { id: placeholderId },
      update: {},
      create: { id: placeholderId, orgId, categoryId: await archiveCategory(), name: `${name} (deleted)`, pricePaisa, availabilityStatus: 'OutOfStock' },
    });
    fixes.push(`Order line "${name}": the menu item was deleted; linked to an archived copy so history stays intact.`);
    menuIds.add(String(mongoId));
    return placeholderId;
  };

  // Tables (current orders are linked after orders exist).
  const tableIds = new Set<string>();
  for (const t of src['tables']!) {
    const tableId = id('tables', t._id);
    const data = {
      orgId,
      branchId: branch.id,
      tableNumber: Number(t['tableNumber']),
      capacity: Math.max(1, Number(t['capacity'] ?? 1)),
      status: (['Available', 'Occupied', 'Reserved'].includes(String(t['status'])) ? t['status'] : 'Available') as 'Available',
      assignedWaiterId: member(t['assignedWaiter']),
      legacyId: String(t._id).toLowerCase(),
    };
    await tx.diningTable.upsert({ where: { id: tableId }, update: data, create: { id: tableId, ...data, createdAt: date(t['createdAt']) ?? new Date() } });
    tableIds.add(String(t._id));
  }
  count('tables', src['tables']!.length, tableIds.size);

  let nextPlaceholderNumber = 9000;
  const tableFor = async (mongoId: unknown) => {
    if (tableIds.has(String(mongoId))) return id('tables', mongoId);
    const placeholderId = id('tables', `deleted:${String(mongoId)}`);
    const exists = await tx.diningTable.findUnique({ where: { id: placeholderId } });
    if (!exists) {
      while (await tx.diningTable.findUnique({ where: { branchId_tableNumber: { branchId: branch.id, tableNumber: nextPlaceholderNumber } } })) nextPlaceholderNumber++;
      await tx.diningTable.create({ data: { id: placeholderId, orgId, branchId: branch.id, tableNumber: nextPlaceholderNumber, capacity: 1 } });
      fixes.push(`Orders referenced a deleted table; created archived table #${nextPlaceholderNumber} to keep them.`);
    }
    tableIds.add(String(mongoId));
    return placeholderId;
  };

  // Orders with their line items.
  const ORDER_STATUSES = ['Pending', 'InKitchen', 'Served', 'Cancelled', 'Paid', 'Completed'];
  const ITEM_STATUSES = ['Pending', 'Cooking', 'Ready', 'Served'];
  const orderIds = new Set<string>();
  let sourceFinal = 0;
  for (const o of src['orders']!) {
    const orderId = id('orders', o._id);
    const items = (o['items'] as Doc[] | undefined) ?? [];
    const lines: Prisma.OrderItemCreateManyInput[] = [];
    for (const it of items) {
      const pricePaisa = paisa(it['price']);
      const quantity = Math.max(1, Number(it['quantity'] ?? 1));
      lines.push({
        id: id('order_items', it._id),
        orgId,
        orderId,
        menuItemId: await menuItemFor(it['menuItem'], String(it['name'] ?? 'Item'), pricePaisa),
        name: String(it['name'] ?? 'Item'),
        quantity,
        pricePaisa,
        subtotalPaisa: pricePaisa * quantity,
        status: (ITEM_STATUSES.includes(String(it['status'])) ? it['status'] : 'Pending') as 'Pending',
        notes: str(it['notes']) ?? '',
      });
    }
    const totalPaisa = lines.reduce((s, l) => s + l.subtotalPaisa, 0);
    const discountPaisa = paisa(o['discount']);
    const finalPaisa = Math.max(0, totalPaisa - discountPaisa);
    sourceFinal += paisa(o['finalAmount']);
    if (finalPaisa !== paisa(o['finalAmount'])) {
      fixes.push(`Order ${String(o._id)}: stored total ${Number(o['finalAmount'])} differed from its lines (${finalPaisa / 100}); used the lines.`);
    }
    const data = {
      orgId,
      branchId: branch.id,
      tableId: await tableFor(o['table']),
      customerName: String(o['customerName'] ?? 'Guest'),
      totalPaisa,
      discountPaisa,
      finalPaisa,
      status: (ORDER_STATUSES.includes(String(o['status'])) ? o['status'] : 'Pending') as 'Pending',
      assignedWaiterId: member(o['assignedWaiter']),
      cookedById: member(o['cookedBy']),
      servedById: member(o['servedBy']),
      orderTimeout: date(o['orderTimeout']) ?? new Date(),
      isTimedOut: Boolean(o['isTimedOut']),
      isPrepaid: Boolean(o['isPrepaid']),
      note: str(o['note']) ?? '',
      createdAt: date(o['createdAt']) ?? new Date(),
    };
    await tx.order.upsert({ where: { id: orderId }, update: data, create: { id: orderId, ...data } });
    await tx.orderItem.deleteMany({ where: { orderId } });
    if (lines.length) await tx.orderItem.createMany({ data: lines });
    orderIds.add(String(o._id));
  }
  count('orders', src['orders']!.length, orderIds.size);
  log('Orders done');

  // Now that orders exist, point tables at their current order.
  for (const t of src['tables']!) {
    const current = t['currentOrder'] && orderIds.has(String(t['currentOrder'])) ? id('orders', t['currentOrder']) : null;
    await tx.diningTable.update({ where: { id: id('tables', t._id) }, data: { currentOrderId: current } });
  }

  // Payments (refunds are negative rows, as before).
  const METHODS = ['Cash', 'Card', 'Fonepay', 'NepalPay', 'Khalti'];
  const PAY_STATUSES = ['Paid', 'Pending', 'Failed', 'Refunded'];
  let imported = 0;
  let sourcePayments = 0;
  for (const p of src['payments']!) {
    sourcePayments += paisa(p['amount']);
    if (!orderIds.has(String(p['order']))) {
      fixes.push(`Payment ${String(p._id)} (Rs ${Number(p['amount'])}) belonged to an order that no longer existed; skipped.`);
      continue;
    }
    const paymentId = id('payments', p._id);
    const txnId = str(p['transactionId']) ?? null;
    const data = {
      orgId,
      branchId: branch.id,
      orderId: id('orders', p['order']),
      tableId: p['table'] && tableIds.has(String(p['table'])) ? id('tables', p['table']) : null,
      amountPaisa: paisa(p['amount']),
      method: (METHODS.includes(String(p['paymentMethod'])) ? p['paymentMethod'] : 'Cash') as 'Cash',
      status: (PAY_STATUSES.includes(String(p['paymentStatus'])) ? p['paymentStatus'] : 'Pending') as 'Pending',
      handledById: member(p['handledBy']),
      // Old refunds were tagged REFUND-<mongo payment id>; point them at the new id.
      transactionId: txnId?.startsWith('REFUND-') ? `REFUND-${id('payments', txnId.slice(7))}` : txnId,
      khaltiPidx: str(p['khaltiPidx']) ?? null,
      paymentTime: date(p['paymentTime']) ?? new Date(),
      createdAt: date(p['createdAt']) ?? new Date(),
    };
    await tx.payment.upsert({ where: { id: paymentId }, update: data, create: { id: paymentId, ...data } });
    imported++;
  }
  count('payments', src['payments']!.length, imported);

  // Verify money in the target equals the source.
  const targetOrders = await tx.order.aggregate({ where: { orgId }, _sum: { finalPaisa: true } });
  const targetPayments = await tx.payment.aggregate({ where: { orgId }, _sum: { amountPaisa: true } });
  const report: ImportReport = {
    dryRun: Boolean(opts.dryRun),
    orgId,
    counts,
    totals: {
      ordersFinalRupees: { source: sourceFinal / 100, target: (targetOrders._sum.finalPaisa ?? 0) / 100 },
      paymentsRupees: { source: sourcePayments / 100, target: (targetPayments._sum.amountPaisa ?? 0) / 100 },
    },
    fixes,
  };
  if (opts.dryRun) throw new DryRunRollback(report);
  return report;
}

// ── CLI ─────────────────────────────────────────────────────────────────────

function printReport(r: ImportReport, log = console.log) {
  log(`\n${r.dryRun ? 'DRY RUN (nothing written)' : 'IMPORTED'} into organization ${r.orgId}`);
  for (const [k, v] of Object.entries(r.counts)) log(`  ${k.padEnd(12)} ${String(v.imported).padStart(6)} / ${v.source}`);
  const { ordersFinalRupees: o, paymentsRupees: p } = r.totals;
  log(`  order totals   Rs ${o.target} (source Rs ${o.source})${o.target === o.source ? '' : '  <- differs, see fixes'}`);
  log(`  payments       Rs ${p.target} (source Rs ${p.source})${p.target === p.source ? '' : '  <- differs, see fixes'}`);
  log(r.fixes.length ? `\n${r.fixes.length} adjustment(s):\n${r.fixes.map((f) => `  - ${f}`).join('\n')}` : '\nNo adjustments needed.');
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const { values } = parseArgs({
    options: {
      mongo: { type: 'string' },
      'org-slug': { type: 'string' },
      'org-name': { type: 'string' },
      branch: { type: 'string' },
      'dry-run': { type: 'boolean', default: false },
    },
  });
  const mongoUri = values.mongo ?? process.env['MONGO_URI'];
  if (!mongoUri || !values['org-slug'] || !values['org-name']) {
    console.error('Usage: npm run db:import-mongo -- --mongo <uri> --org-slug <slug> --org-name "<name>" [--branch Main] [--dry-run]');
    process.exit(1);
  }
  importFromMongo({
    mongoUri,
    orgSlug: values['org-slug'],
    orgName: values['org-name'],
    ...(values.branch && { branchName: values.branch }),
    dryRun: values['dry-run'],
  })
    .then((r) => printReport(r))
    .catch((e: unknown) => {
      console.error('Import failed; nothing was written.', e);
      process.exitCode = 1;
    })
    .finally(() => void disconnectDB());
}

export { printReport };
