// src/controllers/orderController/client/client.order.controller.ts
import type { Request, Response } from 'express';

import { getValidatedParams, getValidatedQuery } from '../../../middleware/validate.middleware.js';
import ClientOrderService from '../../../services/order/client/order.service.js';
import ApiResponse from '../../../utils/ApiResponse.js';
import type { OrderLineInput, OrderQuery, OrderStatusInput, StaffCreateOrderInput } from '../../../validators/order.schema.js';
import BaseController from '../../base.controller.js';

type IdParams = { id: string };

class ClientOrderController extends BaseController {
  createOrder = async (req: Request, res: Response) => {
    try {
      const data = await ClientOrderService.create(this.tenant(req), this.actor(req), req.body as StaffCreateOrderInput);
      return ApiResponse.created(res, data, 'Order created successfully');
    } catch (error) {
      return this.sendError(res, error, 'ClientOrderController.createOrder', 'Failed to create order');
    }
  };

  getOrders = async (req: Request, res: Response) => {
    try {
      const q = getValidatedQuery<OrderQuery>(res);
      const { orders, pagination, stats } = await ClientOrderService.list(this.tenant(req), this.actor(req), q);
      return ApiResponse.success(res, orders, 'Orders retrieved successfully', 200, {
        pagination,
        stats,
        meta: {
          filter: {
            status: q.status ?? 'all',
            table: q.table ?? null,
            dateRange: q.startDate || q.endDate ? { start: q.startDate ?? null, end: q.endDate ?? null } : null,
          },
          sort: { field: q.sortBy, order: q.sortOrder },
        },
      });
    } catch (error) {
      return this.sendError(res, error, 'ClientOrderController.getOrders', 'Failed to fetch orders');
    }
  };

  getOrder = async (req: Request, res: Response) => {
    try {
      const { id } = getValidatedParams<IdParams>(res);
      return ApiResponse.success(res, await ClientOrderService.get(this.tenant(req), this.actor(req), id), 'Order retrieved successfully');
    } catch (error) {
      return this.sendError(res, error, 'ClientOrderController.getOrder', 'Failed to fetch order');
    }
  };

  getTableOrders = async (req: Request, res: Response) => {
    try {
      const { tableId } = getValidatedParams<{ tableId: string }>(res);
      const { status } = getValidatedQuery<{ status?: OrderStatusInput['status'] }>(res);
      const data = await ClientOrderService.byTable(this.tenant(req), this.actor(req), tableId, status);
      return ApiResponse.success(res, data, 'Table orders retrieved successfully');
    } catch (error) {
      return this.sendError(res, error, 'ClientOrderController.getTableOrders', 'Failed to fetch table orders');
    }
  };

  getKitchenQueue = async (req: Request, res: Response) => {
    try {
      const { status } = getValidatedQuery<{ status: 'Pending' | 'InKitchen' | 'all' }>(res);
      const data = await ClientOrderService.kitchenQueue(this.tenant(req), this.actor(req), status);
      return ApiResponse.success(res, data, 'Kitchen orders retrieved successfully');
    } catch (error) {
      return this.sendError(res, error, 'ClientOrderController.getKitchenQueue', 'Failed to fetch kitchen orders');
    }
  };

  updateStatus = async (req: Request, res: Response) => {
    try {
      const { id } = getValidatedParams<IdParams>(res);
      const data = await ClientOrderService.updateStatus(this.tenant(req), this.actor(req), id, req.body as OrderStatusInput);
      return ApiResponse.success(res, data, 'Order status updated successfully');
    } catch (error) {
      return this.sendError(res, error, 'ClientOrderController.updateStatus', 'Failed to update order status');
    }
  };

  updateItemStatus = async (req: Request, res: Response) => {
    try {
      const { orderId, itemId } = getValidatedParams<{ orderId: string; itemId: string }>(res);
      const { status, notes } = req.body as { status: 'Pending' | 'Cooking' | 'Ready' | 'Served'; notes?: string };
      const data = await ClientOrderService.updateItemStatus(this.tenant(req), this.actor(req), orderId, itemId, status, notes);
      return ApiResponse.success(res, data, 'Order item status updated successfully');
    } catch (error) {
      return this.sendError(res, error, 'ClientOrderController.updateItemStatus', 'Failed to update order item');
    }
  };

  addItems = async (req: Request, res: Response) => {
    try {
      const { id } = getValidatedParams<IdParams>(res);
      const { items } = req.body as { items: OrderLineInput[] };
      const data = await ClientOrderService.addItems(this.tenant(req), this.actor(req), id, items);
      return ApiResponse.success(res, data, 'Items added to order successfully');
    } catch (error) {
      return this.sendError(res, error, 'ClientOrderController.addItems', 'Failed to add items');
    }
  };

  cancelOrder = async (req: Request, res: Response) => {
    try {
      const { id } = getValidatedParams<IdParams>(res);
      const { reason } = req.body as { reason?: string };
      const data = await ClientOrderService.cancel(this.tenant(req), this.actor(req), id, reason);
      return ApiResponse.success(res, data, 'Order cancelled successfully');
    } catch (error) {
      return this.sendError(res, error, 'ClientOrderController.cancelOrder', 'Failed to cancel order');
    }
  };

  completeOrder = async (req: Request, res: Response) => {
    try {
      const { id } = getValidatedParams<IdParams>(res);
      const data = await ClientOrderService.complete(this.tenant(req), this.actor(req), id);
      return ApiResponse.success(res, data, 'Order completed successfully');
    } catch (error) {
      return this.sendError(res, error, 'ClientOrderController.completeOrder', 'Failed to complete order');
    }
  };
}

export default new ClientOrderController();
