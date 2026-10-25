// src/routes/component/paymentRoute/client/payment.routes.ts
// Before: any signed-in staff could mark a payment Paid. Now each action
// needs the matching permission.
import { Router } from 'express';

import paymentController from '../../../../controllers/paymentController/client/client.payment.controller.js';
import { requirePermission } from '../../../../middleware/permission.middleware.js';
import { generalLimiter, paymentLimiter } from '../../../../middleware/ratelimit/index.js';
import { validateBody, validateParams, validateQuery } from '../../../../middleware/validate.middleware.js';
import { idParamsSchema } from '../../../../validators/common.schema.js';
import {
  dailyReportQuerySchema,
  orderIdParamsSchema,
  paymentQuerySchema,
  paymentStatusSchema,
  processPaymentSchema,
  refundSchema,
} from '../../../../validators/payment.schema.js';

const router = Router();

router.get('/reports/daily', generalLimiter, requirePermission('report.view'), validateQuery(dailyReportQuerySchema), paymentController.dailyReport);
router.get('/order/:orderId', generalLimiter, requirePermission('payment.view'), validateParams(orderIdParamsSchema), paymentController.getPaymentByOrder);
router.get('/', generalLimiter, requirePermission('payment.view'), validateQuery(paymentQuerySchema), paymentController.getPayments);
router.get('/:id', generalLimiter, requirePermission('payment.view'), validateParams(idParamsSchema), paymentController.getPayment);

router.post('/', paymentLimiter, requirePermission('payment.create'), validateBody(processPaymentSchema), paymentController.processPayment);
router.patch(
  '/:id/status',
  generalLimiter,
  requirePermission('payment.create'),
  validateParams(idParamsSchema),
  validateBody(paymentStatusSchema),
  paymentController.updatePaymentStatus,
);
router.post(
  '/:id/refund',
  paymentLimiter,
  // Requesting needs payment.refund; doing it also needs refund.approve or a manager's approval token.
  requirePermission('payment.refund'),
  validateParams(idParamsSchema),
  validateBody(refundSchema),
  paymentController.refundPayment,
);

export default router;
