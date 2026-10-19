// src/routes/client.routes.ts
// Restaurant staff portal. Every route here runs behind authMiddleware, so
// req.tenant is set and services scope all data through withTenant().
import { Router } from 'express';

import roleRoutes from './component/roleRoute/client/role.routes.js';
import userRoutes from './component/userRoute/client/user.routes.js';

const clientRouter = Router();

// ── Staff & roles ─────────────────────────────────────────────────────────────
clientRouter.use('/users', userRoutes);
clientRouter.use('/roles', roleRoutes);

// Ported next (Stage 1): categories, menu, tables, QR, orders, payments, dashboard.

export default clientRouter;
