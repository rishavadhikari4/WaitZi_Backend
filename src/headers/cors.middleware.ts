// src/headers/cors.middleware.ts
// ponytail: static allow-list from FRONTEND_URL; Stage 7 adds verified tenant
// custom domains (cached lookup on the domains table) for white-label hosts.
import cors from 'cors';

import config from '../config/config.js';

const allowed = new Set(config.app.corsOrigins);

export const corsMiddleware = cors({
  origin(origin, callback) {
    // Requests without an Origin (curl, server-to-server, same-origin) pass.
    if (!origin || allowed.has(origin)) return callback(null, true);
    callback(new Error('Not allowed by CORS'));
  },
  credentials: true,
});
