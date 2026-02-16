import express from 'express';
import {
  processPayment,
  getAllPayments,
  getPaymentById,
  getPaymentByOrder,
  updatePaymentStatus,
  processRefund,
  getDailySalesReport
} from '../controller/paymentController.js';
import {
  validatePaymentProcessing,
  validatePaymentStatusUpdate,
  validateRefundProcessing,
  validatePaymentQuery,
  validateDailySalesReport,
  validateMongoId,
  validateOrderId
} from '../validators/paymentValidators.js';
import { authMiddleware } from '../middleware/authMiddleware.js';
import { authorizeRole } from '../middleware/roleMiddleware.js';
import { generalLimiter, paymentLimiter } from '../middleware/rateLimiter.js';

const router = express.Router();

// Protected routes (all payment operations require authentication)
router.use(authMiddleware);

// Process payment
router.post('/', paymentLimiter, validatePaymentProcessing, processPayment);

// Get all payments
router.get('/', generalLimiter, validatePaymentQuery, getAllPayments);

// Get payment by ID
router.get('/:id', generalLimiter, validateMongoId, getPaymentById);

// Get payment by order ID
router.get('/order/:orderId', generalLimiter, validateOrderId, getPaymentByOrder);

// Update payment status (for digital payment confirmations)
router.patch('/:id/status', generalLimiter, validatePaymentStatusUpdate, updatePaymentStatus);

// Manager/Admin only routes
router.use(authorizeRole(['admin', 'manager', 'accountant']));

// Process refund
router.post('/:id/refund', paymentLimiter, validateRefundProcessing, processRefund);

// Get daily sales report
router.get('/reports/daily', generalLimiter, validateDailySalesReport, getDailySalesReport);

export default router;