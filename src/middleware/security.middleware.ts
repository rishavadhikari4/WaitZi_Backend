// src/middleware/security.middleware.ts
import helmet from 'helmet';

// JSON API only: no inline content to protect, so the CSP is locked down and
// cross-origin resource policy relaxed for the Vercel-hosted frontend.
export const helmetMiddleware = helmet({
  contentSecurityPolicy: { directives: { defaultSrc: ["'none'"], frameAncestors: ["'none'"] } },
  crossOriginResourcePolicy: { policy: 'cross-origin' },
});
