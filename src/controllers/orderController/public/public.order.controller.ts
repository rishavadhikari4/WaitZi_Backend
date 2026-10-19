// src/controllers/orderController/public/public.order.controller.ts
import type { Request, Response } from 'express';

import { getValidatedParams } from '../../../middleware/validate.middleware.js';
import PublicOrderService from '../../../services/order/public/order.service.js';
import ApiResponse from '../../../utils/ApiResponse.js';
import type { PublicCreateOrderInput } from '../../../validators/order.schema.js';
import BaseController from '../../base.controller.js';

class PublicOrderController extends BaseController {
  createOrder = async (req: Request, res: Response) => {
    try {
      const data = await PublicOrderService.create(req.body as PublicCreateOrderInput);
      return ApiResponse.created(res, data, 'Order created successfully');
    } catch (error) {
      return this.sendError(res, error, 'PublicOrderController.createOrder', 'Failed to place order');
    }
  };

  getTableOrders = async (_req: Request, res: Response) => {
    try {
      const { qrToken } = getValidatedParams<{ qrToken: string }>(res);
      const data = await PublicOrderService.tableOrders(qrToken);
      return ApiResponse.success(res, data, 'Table orders retrieved successfully');
    } catch (error) {
      return this.sendError(res, error, 'PublicOrderController.getTableOrders', 'Failed to load orders');
    }
  };
}

export default new PublicOrderController();
