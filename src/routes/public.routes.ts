// src/routes/public.routes.ts
// Guest-facing routes: no login. The table identifier in the URL is what
// resolves the organization, so every lookup here is tenant-scoped by it.
import { Router } from 'express';

import orderingController from '../controllers/orderingController/public/public.ordering.controller.js';
import { generalLimiter } from '../middleware/ratelimit/index.js';
import { validateParams, validateQuery } from '../middleware/validate.middleware.js';
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

// Still to come: guest orders, order tracking and payment callbacks.

export default publicRouter;
