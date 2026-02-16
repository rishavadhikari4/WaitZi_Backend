import express from 'express';
import {
  generateTableQR,
  generateAllTableQRs,
  getOrderingPageData,
  getOrderingPageByTableNumber,
  downloadQRCode,
  generateBrandedQR,
  getQRAnalytics
} from '../controller/qrController.js';
import { validateTableId, validateTableNumber } from '../validators/tableValidators.js';
import { validateBrandedQR } from '../validators/qrValidators.js';
import { authMiddleware } from '../middleware/authMiddleware.js';
import { authorizeRole } from '../middleware/roleMiddleware.js';
import { generalLimiter, qrLimiter } from '../middleware/rateLimiter.js';

const router = express.Router();

// Public routes (for customers accessing QR codes)
router.get('/order/table/:tableId', generalLimiter, validateTableId, getOrderingPageData);
router.get('/order/table-number/:tableNumber', generalLimiter, validateTableNumber, getOrderingPageByTableNumber);

// Protected routes (for staff)
router.use(authMiddleware);

// Generate QR code for a specific table
router.get('/generate/:tableId', qrLimiter, validateTableId, generateTableQR);

// Download QR code as image file
router.get('/download/:tableId', qrLimiter, validateTableId, downloadQRCode);

// Manager/Admin only routes
router.use(authorizeRole(['admin', 'manager']));

// Generate QR codes for all tables
router.get('/generate-all', qrLimiter, generateAllTableQRs);

// Generate branded QR code
router.post('/branded/:tableId', qrLimiter, validateBrandedQR, generateBrandedQR);

// Get QR analytics
router.get('/analytics/:tableId', generalLimiter, validateTableId, getQRAnalytics);

export default router;
