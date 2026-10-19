// src/config/config.ts
// Every environment variable is read here and nowhere else.
import 'dotenv/config';

function env(key: string, fallback: string): string;
function env(key: string): string | undefined;
function env(key: string, fallback?: string): string | undefined {
  return process.env[key] ?? fallback;
}

const envNumber = (key: string, fallback: number) => Number(process.env[key] ?? fallback);
const list = (value: string) =>
  value
    .split(',')
    .map((v) => v.trim())
    .filter(Boolean);

const nodeEnv = env('NODE_ENV', 'development');

export default {
  app: {
    name: env('APP_NAME', 'WaitZi'),
    env: nodeEnv,
    isProduction: nodeEnv === 'production',
    port: envNumber('PORT', 8080),
    /** Public URL of this API (payment gateways redirect back to it). */
    apiUrl: env('API_URL', 'http://localhost:8080').replace(/\/+$/, ''),
    frontendUrl: env('FRONTEND_URL', 'http://localhost:3000').split(',')[0]!.trim(),
    corsOrigins: list(env('FRONTEND_URL', 'http://localhost:3000')),
    trustProxy: envNumber('TRUST_PROXY', 1),
    /** Org used for guest requests that arrive without a tenant host (local dev). */
    defaultOrgSlug: env('DEFAULT_ORG_SLUG'),
  },
  database: {
    /** waitzi_app — row-level security enforced. */
    appUrl: env('DATABASE_URL'),
    /** waitzi_platform — BYPASSRLS, platform tools and jobs only. */
    platformUrl: env('DATABASE_PLATFORM_URL'),
  },
  jwt: {
    accessSecret: env('ACCESS_TOKEN_SECRET'),
    refreshSecret: env('REFRESH_TOKEN_SECRET'),
    accessExpiry: env('ACCESS_TOKEN_EXPIRY', '15m'),
    refreshExpiry: env('REFRESH_TOKEN_EXPIRY', '7d'),
  },
  orders: {
    // ponytail: per-server settings; move into organization settings when a
    // restaurant needs its own values.
    /** Max Pending + InKitchen orders per branch before new ones are refused. */
    kitchenCapacity: envNumber('KITCHEN_CAPACITY', 10),
    /** Pending orders not accepted by the kitchen within this are auto-cancelled. */
    timeoutMinutes: envNumber('ORDER_TIMEOUT_MINUTES', 30),
    duplicateWindowMinutes: 5,
  },
  smtp: {
    host: env('SMTP_HOST'),
    port: envNumber('SMTP_PORT', 587),
    user: env('SMTP_USER'),
    password: env('SMTP_PASSWORD'),
    from: env('EMAIL_FROM', 'WaitZi <noreply@waitzi.app>'),
  },
  cloudinary: {
    cloudName: env('CLOUDINARY_CLOUD_NAME'),
    apiKey: env('CLOUDINARY_API_KEY'),
    apiSecret: env('CLOUDINARY_API_SECRET'),
  },
  khalti: {
    // Moves to per-organization gateway settings in Stage 4.
    gatewayUrl: env('KHALTI_GATEWAY_URL', 'https://dev.khalti.com'),
    secretKey: env('KHALTI_SECRET_KEY'),
    returnUrl: env('KHALTI_RETURN_URL'),
    websiteUrl: env('KHALTI_WEBSITE_URL'),
  },
};
