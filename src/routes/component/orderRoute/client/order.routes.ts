// src/routes/component/orderRoute/client/order.routes.ts
// Staff order management. Routes gate on the broad permission; the service
// adds per-status checks (e.g. marking Paid needs payment.create).
import { Router } from 'express';

import orderController from '../../../../controllers/orderController/client/client.order.controller.js';
import { requirePermission } from '../../../../middleware/permission.middleware.js';
import { generalLimiter, orderCreationLimiter } from '../../../../middleware/ratelimit/index.js';
import { validateBody, validateParams, validateQuery } from '../../../../middleware/validate.middleware.js';
import { idParamsSchema } from '../../../../validators/common.schema.js';
import {
  addItemsSchema,
  cancelOrderSchema,
  itemStatusSchema,
  kitchenQuerySchema,
  orderItemParamsSchema,
  orderQuerySchema,
  orderStatusSchema,
  staffCreateOrderSchema,
  tableIdParamsSchema,
  tableOrdersQuerySchema,
} from '../../../../validators/order.schema.js';

const router = Router();

router.use(generalLimiter);

router.get('/kitchen/queue', requirePermission('kot.view'), validateQuery(kitchenQuerySchema), orderController.getKitchenQueue);
router.get(
  '/table/:tableId',
  requirePermission('order.view'),
  validateParams(tableIdParamsSchema),
  validateQuery(tableOrdersQuerySchema),
  orderController.getTableOrders,
);
router.get('/', requirePermission('order.view'), validateQuery(orderQuerySchema), orderController.getOrders);
router.get('/:id', requirePermission('order.view'), validateParams(idParamsSchema), orderController.getOrder);

router.post('/', orderCreationLimiter, requirePermission('order.create'), validateBody(staffCreateOrderSchema), orderController.createOrder);
router.patch('/:id/status', requirePermission('order.view'), validateParams(idParamsSchema), validateBody(orderStatusSchema), orderController.updateStatus);
router.patch(
  '/:orderId/items/:itemId/status',
  requirePermission('order.view'),
  validateParams(orderItemParamsSchema),
  validateBody(itemStatusSchema),
  orderController.updateItemStatus,
);
router.post('/:id/items', requirePermission('order.edit'), validateParams(idParamsSchema), validateBody(addItemsSchema), orderController.addItems);
router.patch('/:id/cancel', requirePermission('order.cancel'), validateParams(idParamsSchema), validateBody(cancelOrderSchema), orderController.cancelOrder);
router.patch('/:id/complete', requirePermission('payment.create'), validateParams(idParamsSchema), orderController.completeOrder);

export default router;
