import express from 'express';
import {
  getDashboardOverview,
  getSalesAnalytics,
  getOperationalInsights,
  getMenuAnalytics,
  getRealTimeStatus
} from '../controller/dashboardController.js';
import {
  validateSalesQuery,
  validateOverviewQuery,
  validateMenuAnalyticsQuery
} from '../validators/dashboardValidators.js';
import { authMiddleware } from '../middleware/authMiddleware.js';
import { authorizeRole } from '../middleware/roleMiddleware.js';
import { analyticsLimiter } from '../middleware/rateLimiter.js';

const router = express.Router();

// All dashboard routes require authentication
router.use(authMiddleware);

// Real-time status (accessible by all staff)
router.get('/real-time', analyticsLimiter, getRealTimeStatus);

// Admin only analytics routes
router.use(authorizeRole(['admin']));

// Dashboard overview
router.get('/overview', analyticsLimiter, validateOverviewQuery, getDashboardOverview);

// Sales analytics
router.get('/sales', analyticsLimiter, validateSalesQuery, getSalesAnalytics);

// Operational insights
router.get('/operations', analyticsLimiter, getOperationalInsights);

// Menu analytics
router.get('/menu', analyticsLimiter, validateMenuAnalyticsQuery, getMenuAnalytics);

export default router;
