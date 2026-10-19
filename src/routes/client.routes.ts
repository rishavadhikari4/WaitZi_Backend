// src/routes/client.routes.ts
// Restaurant staff portal. Every route here runs behind authMiddleware, so
// req.tenant is set and services scope all data through withTenant().
import { Router } from 'express';

import { categoryRoutes, menuRoutes } from './component/menuRoute/client/menu.routes.js';
import roleRoutes from './component/roleRoute/client/role.routes.js';
import tableRoutes from './component/tableRoute/client/table.routes.js';
import userRoutes from './component/userRoute/client/user.routes.js';

const clientRouter = Router();

// ── Staff & roles ─────────────────────────────────────────────────────────────
clientRouter.use('/users', userRoutes);
clientRouter.use('/roles', roleRoutes);

// ── Menu ──────────────────────────────────────────────────────────────────────
clientRouter.use('/categories', categoryRoutes);
clientRouter.use('/menu', menuRoutes);

// ── Floor: tables and their QR codes ─────────────────────────────────────────
clientRouter.use('/tables', tableRoutes);

// Ported next (Stage 1): orders, payments, dashboard.

export default clientRouter;
