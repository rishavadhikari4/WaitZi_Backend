// Dev seed: a platform super admin plus one demo organization with a branch,
// role templates, an owner, menu and tables. Idempotent: re-running skips
// what already exists.
//
//   npm run db:seed
//
// Passwords come from SEED_SUPERADMIN_PASSWORD / SEED_OWNER_PASSWORD, falling
// back to dev-only defaults printed at the end.
import bcrypt from 'bcryptjs';
import { asPlatform, withTenant, disconnectDB } from '../src/config/prisma.js';
import { ROLE_TEMPLATES } from '../src/constants/permissions.js';

const SUPERADMIN_EMAIL = process.env['SEED_SUPERADMIN_EMAIL'] || 'superadmin@waitzi.local';
const SUPERADMIN_PASSWORD = process.env['SEED_SUPERADMIN_PASSWORD'] || 'ChangeMe!123';
const OWNER_EMAIL = 'owner@himalayan-kitchen.local';
const OWNER_PASSWORD = process.env['SEED_OWNER_PASSWORD'] || 'ChangeMe!123';

const MENU: Record<string, [string, number][]> = {
  Momo: [['Chicken Momo', 250], ['Jhol Momo', 280], ['Veg Momo', 200]],
  Mains: [['Thakali Set', 450], ['Sekuwa', 380], ['Chowmein', 180]],
  Drinks: [['Masala Tea', 60], ['Lassi', 120], ['Lemon Soda', 90]],
};

export async function seed() {
  const superAdmin = await asPlatform('seed: super admin', async (db) =>
    db.user.upsert({
      where: { email: SUPERADMIN_EMAIL },
      update: {},
      create: {
        firstName: 'Super', lastName: 'Admin', phone: '9800000000', email: SUPERADMIN_EMAIL,
        passwordHash: await bcrypt.hash(SUPERADMIN_PASSWORD, 12),
        scope: 'platform', platformRole: 'super_admin',
      },
    }));

  // Creating an organization and its owner is a platform action.
  const { org, branch, owner } = await asPlatform('seed: demo organization', async (db) => {
    const org = await db.organization.upsert({
      where: { slug: 'himalayan-kitchen' },
      update: {},
      create: { name: 'Himalayan Kitchen', slug: 'himalayan-kitchen', status: 'active' },
    });
    const branch = await db.branch.upsert({
      where: { orgId_name: { orgId: org.id, name: 'Thamel' } },
      update: {},
      create: { orgId: org.id, name: 'Thamel', address: 'Thamel, Kathmandu' },
    });
    await db.domain.upsert({
      where: { hostname: 'himalayan-kitchen.waitzi.localhost' },
      update: {},
      create: { orgId: org.id, hostname: 'himalayan-kitchen.waitzi.localhost', type: 'subdomain', verifyToken: 'seed', verifiedAt: new Date() },
    });
    for (const t of ROLE_TEMPLATES) {
      await db.role.upsert({
        where: { orgId_name: { orgId: org.id, name: t.name } },
        update: { permissions: t.permissions, description: t.description },
        create: { orgId: org.id, ...t, isSystem: true },
      });
    }
    const owner = await db.user.upsert({
      where: { email: OWNER_EMAIL },
      update: {},
      create: {
        firstName: 'Demo', lastName: 'Owner', phone: '9800000001', email: OWNER_EMAIL,
        passwordHash: await bcrypt.hash(OWNER_PASSWORD, 12),
      },
    });
    const ownerRole = await db.role.findUniqueOrThrow({ where: { orgId_name: { orgId: org.id, name: 'admin' } } });
    await db.membership.upsert({
      where: { orgId_userId: { orgId: org.id, userId: owner.id } },
      update: { roleId: ownerRole.id },
      create: { orgId: org.id, userId: owner.id, roleId: ownerRole.id },
    });
    // Pre-rename seeds created an 'owner' role; drop it once nobody uses it.
    await db.role.deleteMany({ where: { orgId: org.id, name: 'owner', memberships: { none: {} } } });
    return { org, branch, owner };
  });

  // Day-to-day data goes through the tenant path, exactly like the API will.
  await withTenant({ orgId: org.id, userId: owner.id }, async (tx) => {
    for (const [catName, items] of Object.entries(MENU)) {
      const category = await tx.category.upsert({
        where: { orgId_name: { orgId: org.id, name: catName } },
        update: {},
        create: { orgId: org.id, name: catName },
      });
      for (const [name, rupees] of items) {
        const exists = await tx.menuItem.findFirst({ where: { name, categoryId: category.id } });
        if (!exists) await tx.menuItem.create({ data: { orgId: org.id, categoryId: category.id, name, pricePaisa: rupees * 100 } });
      }
    }
    for (let n = 1; n <= 8; n++) {
      await tx.diningTable.upsert({
        where: { branchId_tableNumber: { branchId: branch.id, tableNumber: n } },
        update: {},
        create: { orgId: org.id, branchId: branch.id, tableNumber: n, capacity: n % 3 === 0 ? 6 : 4 },
      });
    }
  });

  return { superAdmin, org, branch, owner };
}

if (import.meta.url === `file://${process.argv[1]}`) {
  seed()
    .then(({ org }) => {
      console.log(`Seeded org "${org.name}" (${org.slug}).`);
      console.log(`Super admin: ${SUPERADMIN_EMAIL}   Owner: ${OWNER_EMAIL}   (dev passwords from SEED_* env or the defaults in prisma/seed.ts)`);
    })
    .catch((e: unknown) => {
      console.error(e);
      process.exitCode = 1;
    })
    .finally(disconnectDB);
}
