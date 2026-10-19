// src/routes/component/tableRoute/client/table.routes.ts
import { Router } from 'express';

import tableController from '../../../../controllers/tableController/client/client.table.controller.js';
import { requirePermission } from '../../../../middleware/permission.middleware.js';
import { generalLimiter, qrLimiter } from '../../../../middleware/ratelimit/index.js';
import { validateBody, validateParams, validateQuery } from '../../../../middleware/validate.middleware.js';
import { idParamsSchema } from '../../../../validators/common.schema.js';
import {
  createTableSchema,
  qrFormatQuerySchema,
  tableQuerySchema,
  tableStatusSchema,
  updateTableSchema,
} from '../../../../validators/table.schema.js';

const router = Router();

// ── QR codes (before /:id so "qr" isn't read as an id) ───────────────────────
router.get('/qr/all', qrLimiter, requirePermission('table.manage'), validateQuery(qrFormatQuerySchema), tableController.generateAllQrs);
router.get('/:id/qr', qrLimiter, requirePermission('table.view'), validateParams(idParamsSchema), validateQuery(qrFormatQuerySchema), tableController.generateQr);
router.get('/:id/qr/download', qrLimiter, requirePermission('table.view'), validateParams(idParamsSchema), validateQuery(qrFormatQuerySchema), tableController.downloadQr);
router.get('/:id/qr/analytics', generalLimiter, requirePermission('table.manage'), validateParams(idParamsSchema), tableController.qrAnalytics);

// ── Floor (any staff who can see tables) ─────────────────────────────────────
router.get('/', generalLimiter, requirePermission('table.view'), validateQuery(tableQuerySchema), tableController.getTables);
router.get('/:id', generalLimiter, requirePermission('table.view'), validateParams(idParamsSchema), tableController.getTable);
router.patch(
  '/:id/status',
  generalLimiter,
  requirePermission('table.view'),
  validateParams(idParamsSchema),
  validateBody(tableStatusSchema),
  tableController.updateTableStatus,
);
router.patch('/:id/clear', generalLimiter, requirePermission('table.view'), validateParams(idParamsSchema), tableController.clearTable);

// ── Setup ─────────────────────────────────────────────────────────────────────
router.post('/', generalLimiter, requirePermission('table.manage'), validateBody(createTableSchema), tableController.createTable);
router.put(
  '/:id',
  generalLimiter,
  requirePermission('table.manage'),
  validateParams(idParamsSchema),
  validateBody(updateTableSchema),
  tableController.updateTable,
);
router.delete('/:id', generalLimiter, requirePermission('table.manage'), validateParams(idParamsSchema), tableController.deleteTable);

export default router;
