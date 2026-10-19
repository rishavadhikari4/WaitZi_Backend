import 'dotenv/config';
import { execSync } from 'node:child_process';
import pg from 'pg';

// Recreate waitzi_test from scratch and apply every migration, so the tests
// always exercise the real schema, roles and RLS policies.
export default async function setup() {
  const admin = process.env.DATABASE_ADMIN_URL;
  if (!admin) throw new Error('DATABASE_ADMIN_URL is not set (see .env.example)');
  const testUrl = admin.replace(/\/waitzi(\?|$)/, '/waitzi_test$1');
  if (testUrl === admin) throw new Error('DATABASE_ADMIN_URL must point at the "waitzi" database');

  const client = new pg.Client({ connectionString: admin });
  await client.connect();
  await client.query('DROP DATABASE IF EXISTS waitzi_test WITH (FORCE)');
  await client.query('CREATE DATABASE waitzi_test');
  await client.end();

  execSync('npx prisma migrate deploy', {
    env: { ...process.env, DATABASE_ADMIN_URL: testUrl },
    stdio: 'pipe',
  });
}
