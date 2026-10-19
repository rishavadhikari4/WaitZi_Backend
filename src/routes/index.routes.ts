// src/routes/index.routes.ts
import { Router } from 'express';

import { authMiddleware } from '../middleware/auth/auth.middleware.js';

import clientRoutes from './client.routes.js';
import authRoutes from './component/authRoute/auth.routes.js';

const router = Router();

// ── Public / shared ───────────────────────────────────────────────────────────
router.use('/auth', authRoutes);

// ── Restaurant staff portal ───────────────────────────────────────────────────
router.use('/client', authMiddleware, clientRoutes);

// Still to come: /public (guest QR ordering, payment callbacks) and /admin
// (platform super-admin console, Stage 8).

export default router;
