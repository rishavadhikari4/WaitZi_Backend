import 'dotenv/config';
import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient, Prisma } from '../generated/prisma/index.js';

// Two pools, two Postgres roles:
//   app      -> waitzi_app, row-level security enforced (every tenant request)
//   platform -> waitzi_platform, BYPASSRLS (super-admin tools, background jobs,
//               pre-tenant lookups such as login and host -> org resolution)
// Tenant data must only be touched through withTenant(); see PLATFORM_PLAN.md.

function makeClient(url, name) {
  if (!url) throw new Error(`${name} database URL is not set`);
  return new PrismaClient({ adapter: new PrismaPg({ connectionString: url }) });
}

let app;
let platform;

const appClient = () => (app ??= makeClient(process.env.DATABASE_URL, 'DATABASE_URL'));
const platformClient = () => (platform ??= makeClient(process.env.DATABASE_PLATFORM_URL, 'DATABASE_PLATFORM_URL'));

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Run `fn(tx)` in one transaction scoped to a tenant. Row-level security only
 * returns and accepts rows whose org_id matches `orgId`.
 *
 * @param {{ orgId: string, userId?: string, branchId?: string }} ctx
 * @param {(tx: Prisma.TransactionClient) => Promise<T>} fn
 * @template T
 */
export async function withTenant(ctx, fn, { timeout = 10_000 } = {}) {
  if (!ctx?.orgId || !UUID.test(ctx.orgId)) throw new Error('withTenant: a valid orgId is required');
  return appClient().$transaction(async (tx) => {
    await tx.$executeRaw`SELECT
      set_config('app.org_id', ${ctx.orgId}, true),
      set_config('app.user_id', ${ctx.userId ?? ''}, true),
      set_config('app.branch_id', ${ctx.branchId ?? ''}, true)`;
    return fn(tx);
  }, { timeout });
}

/**
 * Run `fn(db)` with row-level security bypassed. Only for platform staff,
 * background jobs and lookups that happen before a tenant is known.
 * `reason` is required so every bypass is greppable and logged.
 */
export async function asPlatform(reason, fn) {
  if (!reason) throw new Error('asPlatform: a reason is required');
  // ponytail: console log; route to AuditLog once Stage 2 adds support-access sessions
  if (process.env.NODE_ENV !== 'test') console.info(`[platform-db] ${reason}`);
  return fn(platformClient());
}

export async function disconnectDb() {
  await Promise.all([app?.$disconnect(), platform?.$disconnect()]);
  app = platform = undefined;
}

export { Prisma };
