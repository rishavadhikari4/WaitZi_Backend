// src/routes/index.routes.ts
import { Router } from 'express';

import { authMiddleware } from '../middleware/auth/auth.middleware.js';

import clientRoutes from './client.routes.js';
import authRoutes from './component/authRoute/auth.routes.js';
import publicRoutes from './public.routes.js';

const router = Router();

// ── Public / shared ───────────────────────────────────────────────────────────
router.use('/auth', authRoutes);

// ── Guests (QR ordering) ──────────────────────────────────────────────────────
router.use('/public', publicRoutes);

// ── Restaurant staff portal ───────────────────────────────────────────────────
router.use('/client', authMiddleware, clientRoutes);

// Still to come: /admin (platform super-admin console, Stage 8).

export default router;
