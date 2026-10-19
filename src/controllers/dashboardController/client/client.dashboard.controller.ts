// src/controllers/dashboardController/client/client.dashboard.controller.ts
import type { Request, Response } from 'express';

import { getValidatedQuery } from '../../../middleware/validate.middleware.js';
import DashboardService, { type Period } from '../../../services/dashboard/client/dashboard.service.js';
import ApiResponse from '../../../utils/ApiResponse.js';
import BaseController from '../../base.controller.js';

type PeriodQuery = { period: Period; categoryId?: string };

class ClientDashboardController extends BaseController {
  private run =
    (context: string, message: string, fn: (req: Request, q: PeriodQuery) => Promise<unknown>, extra?: (data: unknown) => Record<string, unknown>) =>
    async (req: Request, res: Response) => {
      try {
        const data = await fn(req, getValidatedQuery<PeriodQuery>(res));
        return ApiResponse.success(res, data, message, 200, extra?.(data) ?? {});
      } catch (error) {
        return this.sendError(res, error, `ClientDashboardController.${context}`, 'Failed to load dashboard');
      }
    };

  overview = this.run('overview', 'Dashboard overview retrieved successfully', (req, q) => DashboardService.overview(this.tenant(req), q.period), () => ({
    timestamp: new Date().toISOString(),
  }));

  sales = this.run('sales', 'Sales analytics retrieved successfully', (req, q) => DashboardService.sales(this.tenant(req), q.period));

  operations = this.run('operations', 'Operational insights retrieved successfully', (req, q) =>
    DashboardService.operations(this.tenant(req), q.period),
  );

  menu = this.run('menu', 'Menu analytics retrieved successfully', (req, q) => DashboardService.menu(this.tenant(req), q.period, q.categoryId));

  realTime = this.run('realTime', 'Real-time status retrieved successfully', (req) => DashboardService.realTime(this.tenant(req)));
}

export default new ClientDashboardController();
