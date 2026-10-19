import 'dotenv/config';
import { defineConfig, env } from 'prisma/config';

// Migrations run as the database owner; the app itself connects as the
// least-privilege waitzi_app role (DATABASE_URL), see src/config/prisma.ts.
export default defineConfig({
  schema: 'prisma/schema.prisma',
  migrations: {
    path: 'prisma/migrations',
    seed: 'tsx prisma/seed.ts',
  },
  datasource: {
    url: env('DATABASE_ADMIN_URL'),
  },
});
