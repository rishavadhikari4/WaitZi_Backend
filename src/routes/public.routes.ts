// src/routes/public.routes.ts
// Guest-facing routes: no login. The table identifier in the URL is what
// resolves the organization, so every lookup here is tenant-scoped by it.
import { Router } from 'express';

import orderController from '../controllers/orderController/public/public.order.controller.js';
import khaltiController from '../controllers/paymentController/public/public.khalti.controller.js';
import orderingController from '../controllers/orderingController/public/public.ordering.controller.js';
import { generalLimiter, orderCreationLimiter, paymentLimiter } from '../middleware/ratelimit/index.js';
import { validateBody, validateParams, validateQuery } from '../middleware/validate.middleware.js';
import { publicCreateOrderSchema } from '../validators/order.schema.js';
import { khaltiCallbackQuerySchema, khaltiInitiateSchema } from '../validators/payment.schema.js';
import {
  orgSlugQuerySchema,
  publicTableIdParamsSchema,
  qrTokenParamsSchema,
  tableNumberParamsSchema,
} from '../validators/table.schema.js';

const publicRouter = Router();

publicRouter.use(generalLimiter);

// ── Ordering page (menu + table) ─────────────────────────────────────────────
publicRouter.get('/qr/:qrToken', validateParams(qrTokenParamsSchema), orderingController.byQrToken);
publicRouter.get('/tables/:tableId/ordering', validateParams(publicTableIdParamsSchema), orderingController.byTableId);
publicRouter.get(
  '/tables/number/:tableNumber/ordering',
  validateParams(tableNumberParamsSchema),
  validateQuery(orgSlugQuerySchema),
  orderingController.byTableNumber,
);

// ── Guest orders and tracking (keyed by the table's QR token) ───────────────
publicRouter.post('/orders', orderCreationLimiter, validateBody(publicCreateOrderSchema), orderController.createOrder);
publicRouter.get('/qr/:qrToken/orders', validateParams(qrTokenParamsSchema), orderController.getTableOrders);

// ── Khalti checkout ───────────────────────────────────────────────────────────
publicRouter.post('/payments/khalti/initiate', paymentLimiter, validateBody(khaltiInitiateSchema), khaltiController.initiate);
publicRouter.get('/payments/khalti/callback', validateQuery(khaltiCallbackQuerySchema), khaltiController.callback);

export default publicRouter;
