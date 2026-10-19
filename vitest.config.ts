import 'dotenv/config';
import { defineConfig } from 'vitest/config';

// Tests run against a throwaway "waitzi_test" database on the same server,
// recreated and migrated by tests/globalSetup.ts on every run.
const toTestDb = (url?: string) => url && url.replace(/\/waitzi(\?|$)/, '/waitzi_test$1');

export default defineConfig({
  test: {
    globalSetup: './tests/globalSetup.ts',
    env: {
      NODE_ENV: 'test',
      ACCESS_TOKEN_SECRET: 'test-access-secret',
      REFRESH_TOKEN_SECRET: 'test-refresh-secret',
      DATABASE_URL: toTestDb(process.env['DATABASE_URL']),
      DATABASE_PLATFORM_URL: toTestDb(process.env['DATABASE_PLATFORM_URL']),
      DATABASE_ADMIN_URL: toTestDb(process.env['DATABASE_ADMIN_URL']),
    },
    fileParallelism: false,
  },
});
