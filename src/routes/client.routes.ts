// src/routes/client.routes.ts
// Restaurant staff portal. Every route here runs behind authMiddleware, so
// req.tenant is set and services scope all data through withTenant().
import { Router } from 'express';

import approvalRoutes from './component/approvalRoute/client/approval.routes.js';
import auditRoutes from './component/auditRoute/client/audit.routes.js';
import dashboardRoutes from './component/dashboardRoute/client/dashboard.routes.js';
import { categoryRoutes, menuRoutes } from './component/menuRoute/client/menu.routes.js';
import orderRoutes from './component/orderRoute/client/order.routes.js';
import paymentRoutes from './component/paymentRoute/client/payment.routes.js';
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

// ── Orders and the kitchen queue ─────────────────────────────────────────────
clientRouter.use('/orders', orderRoutes);

// ── Payments, refunds and the daily report ──────────────────────────────────
clientRouter.use('/payments', paymentRoutes);

// ── Dashboard and analytics ──────────────────────────────────────────────────
clientRouter.use('/dashboard', dashboardRoutes);

// ── Manager approvals and the audit log ─────────────────────────────────────
clientRouter.use('/approvals', approvalRoutes);
clientRouter.use('/audit', auditRoutes);

export default clientRouter;
