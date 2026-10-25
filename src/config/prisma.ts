// src/config/prisma.ts
// Two pools, two Postgres roles:
//   app      -> waitzi_app, row-level security enforced (every tenant request)
//   platform -> waitzi_platform, BYPASSRLS (platform staff, background jobs,
//               pre-tenant lookups such as login and QR-token resolution)
// Tenant data is only ever touched through withTenant(); repositories take the
// transaction client it hands out. See PLATFORM_PLAN.md.
import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient, Prisma } from '@prisma/client';

import config from './config.js';

export type DBClient = PrismaClient | Prisma.TransactionClient;
/** A client scoped to one organization by withTenant(). */
export type TenantTx = Prisma.TransactionClient;

export interface TenantContext {
  orgId: string;
  userId?: string | undefined;
  branchId?: string | undefined;
  /** Request IP, recorded in the audit log. */
  ip?: string | undefined;
}

function makeClient(url: string | undefined, name: string): PrismaClient {
  if (!url) throw new Error(`${name} is not set (see .env.example)`);
  return new PrismaClient({ adapter: new PrismaPg({ connectionString: url }) });
}

let app: PrismaClient | undefined;
let platform: PrismaClient | undefined;

const appClient = () => (app ??= makeClient(config.database.appUrl, 'DATABASE_URL'));
const platformClient = () =>
  (platform ??= makeClient(config.database.platformUrl, 'DATABASE_PLATFORM_URL'));

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Run `fn(tx)` in one transaction scoped to a tenant. Row-level security only
 * returns and accepts rows whose org_id matches `ctx.orgId`.
 */
export async function withTenant<T>(
  ctx: TenantContext,
  fn: (tx: TenantTx) => Promise<T>,
  { timeout = 10_000 }: { timeout?: number } = {},
): Promise<T> {
  if (!ctx?.orgId || !UUID.test(ctx.orgId)) throw new Error('withTenant: a valid orgId is required');
  return appClient().$transaction(
    async (tx) => {
      await tx.$executeRaw`SELECT
        set_config('app.org_id', ${ctx.orgId}, true),
        set_config('app.user_id', ${ctx.userId ?? ''}, true),
        set_config('app.branch_id', ${ctx.branchId ?? ''}, true)`;
      return fn(tx);
    },
    { timeout },
  );
}

/**
 * Run `fn(db)` with row-level security bypassed. Only for platform staff,
 * background jobs and lookups that happen before a tenant is known.
 * `reason` is required so every bypass is greppable and logged.
 */
export async function asPlatform<T>(reason: string, fn: (db: PrismaClient) => Promise<T>): Promise<T> {
  if (!reason) throw new Error('asPlatform: a reason is required');
  // ponytail: console log; route to AuditLog once Stage 2 adds support-access sessions
  if (config.app.env !== 'test') console.info(`[platform-db] ${reason}`);
  return fn(platformClient());
}

export async function connectDB(): Promise<void> {
  try {
    await Promise.all([appClient().$connect(), platformClient().$connect()]);
    console.log('✅ Database connected');
  } catch (error) {
    console.error('❌ Database connection failed:', error);
    process.exit(1);
  }
}

export async function disconnectDB(): Promise<void> {
  await Promise.all([app?.$disconnect(), platform?.$disconnect()]);
  app = platform = undefined;
}

export { Prisma };
