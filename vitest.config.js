import 'dotenv/config';
import { defineConfig } from 'vitest/config';

// Tests run against a throwaway "waitzi_test" database on the same server,
// recreated and migrated by test/globalSetup.js on every run.
const toTestDb = (url) => url && url.replace(/\/waitzi(\?|$)/, '/waitzi_test$1');

export default defineConfig({
  test: {
    globalSetup: './test/globalSetup.js',
    env: {
      NODE_ENV: 'test',
      DATABASE_URL: toTestDb(process.env.DATABASE_URL),
      DATABASE_PLATFORM_URL: toTestDb(process.env.DATABASE_PLATFORM_URL),
      DATABASE_ADMIN_URL: toTestDb(process.env.DATABASE_ADMIN_URL),
    },
    fileParallelism: false,
  },
});
