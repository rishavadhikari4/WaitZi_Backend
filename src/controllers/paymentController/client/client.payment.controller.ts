// src/controllers/paymentController/client/client.payment.controller.ts
import type { Request, Response } from 'express';

import { getValidatedParams, getValidatedQuery } from '../../../middleware/validate.middleware.js';
import ClientPaymentService from '../../../services/payment/client/payment.service.js';
import ApiResponse from '../../../utils/ApiResponse.js';
import type { PaymentQuery, PaymentStatusInput, ProcessPaymentInput, RefundInput } from '../../../validators/payment.schema.js';
import BaseController from '../../base.controller.js';

type IdParams = { id: string };

class ClientPaymentController extends BaseController {
  processPayment = async (req: Request, res: Response) => {
    try {
      const data = await ClientPaymentService.process(this.tenant(req), req.body as ProcessPaymentInput);
      return ApiResponse.created(res, data, 'Payment processed successfully');
    } catch (error) {
      return this.sendError(res, error, 'ClientPaymentController.processPayment', 'Failed to process payment');
    }
  };

  getPayments = async (req: Request, res: Response) => {
    try {
      const q = getValidatedQuery<PaymentQuery>(res);
      const { payments, pagination, stats } = await ClientPaymentService.list(this.tenant(req), q);
      return ApiResponse.success(res, payments, 'Payments retrieved successfully', 200, {
        pagination,
        stats,
        meta: {
          filter: {
            paymentStatus: q.paymentStatus ?? 'all',
            paymentMethod: q.paymentMethod ?? 'all',
            dateRange: q.startDate || q.endDate ? { start: q.startDate ?? null, end: q.endDate ?? null } : null,
          },
          sort: { field: q.sortBy, order: q.sortOrder },
        },
      });
    } catch (error) {
      return this.sendError(res, error, 'ClientPaymentController.getPayments', 'Failed to fetch payments');
    }
  };

  getPayment = async (req: Request, res: Response) => {
    try {
      const { id } = getValidatedParams<IdParams>(res);
      return ApiResponse.success(res, await ClientPaymentService.get(this.tenant(req), id), 'Payment retrieved successfully');
    } catch (error) {
      return this.sendError(res, error, 'ClientPaymentController.getPayment', 'Failed to fetch payment');
    }
  };

  getPaymentByOrder = async (req: Request, res: Response) => {
    try {
      const { orderId } = getValidatedParams<{ orderId: string }>(res);
      return ApiResponse.success(res, await ClientPaymentService.byOrder(this.tenant(req), orderId), 'Payment retrieved successfully');
    } catch (error) {
      return this.sendError(res, error, 'ClientPaymentController.getPaymentByOrder', 'Failed to fetch payment');
    }
  };

  updatePaymentStatus = async (req: Request, res: Response) => {
    try {
      const { id } = getValidatedParams<IdParams>(res);
      const data = await ClientPaymentService.updateStatus(this.tenant(req), id, req.body as PaymentStatusInput);
      return ApiResponse.success(res, data, 'Payment status updated successfully');
    } catch (error) {
      return this.sendError(res, error, 'ClientPaymentController.updatePaymentStatus', 'Failed to update payment');
    }
  };

  refundPayment = async (req: Request, res: Response) => {
    try {
      const { id } = getValidatedParams<IdParams>(res);
      const data = await ClientPaymentService.refund(this.tenant(req), id, req.body as RefundInput);
      return ApiResponse.created(res, data, 'Refund processed successfully');
    } catch (error) {
      return this.sendError(res, error, 'ClientPaymentController.refundPayment', 'Failed to process refund');
    }
  };

  dailyReport = async (req: Request, res: Response) => {
    try {
      const { date } = getValidatedQuery<{ date?: string }>(res);
      const data = await ClientPaymentService.dailyReport(this.tenant(req), date);
      return ApiResponse.success(res, data, 'Daily sales report generated successfully');
    } catch (error) {
      return this.sendError(res, error, 'ClientPaymentController.dailyReport', 'Failed to generate report');
    }
  };
}

export default new ClientPaymentController();
