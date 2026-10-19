// src/routes/component/dashboardRoute/client/dashboard.routes.ts
import { Router } from 'express';
import { z } from 'zod';

import dashboardController from '../../../../controllers/dashboardController/client/client.dashboard.controller.js';
import { requirePermission } from '../../../../middleware/permission.middleware.js';
import { analyticsLimiter } from '../../../../middleware/ratelimit/index.js';
import { validateQuery } from '../../../../middleware/validate.middleware.js';

const periodQuery = (fallback: 'today' | 'week') =>
  z.object({
    period: z.enum(['today', 'yesterday', 'week', 'month', 'year']).default(fallback),
    categoryId: z.uuid().optional(),
  });

const router = Router();

router.use(analyticsLimiter);

// Live status strip: every staff screen polls this.
router.get('/real-time', validateQuery(periodQuery('today')), dashboardController.realTime);

// Analytics: owners and managers.
router.get('/overview', requirePermission('report.view'), validateQuery(periodQuery('today')), dashboardController.overview);
router.get('/sales', requirePermission('report.view'), validateQuery(periodQuery('week')), dashboardController.sales);
router.get('/operations', requirePermission('report.view'), validateQuery(periodQuery('today')), dashboardController.operations);
router.get('/menu', requirePermission('report.view'), validateQuery(periodQuery('week')), dashboardController.menu);

export default router;
