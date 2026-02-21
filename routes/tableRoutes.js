import express from 'express';
import {
  createTable,
  getAllTables,
  getTableById,
  getTableByNumber,
  updateTable,
  deleteTable,
  updateTableStatus,
  assignOrderToTable,
  clearOrderFromTable,
} from '../controller/tableController.js';
import {
  validateTableCreation,
  validateTableUpdate,
  validateTableStatusUpdate,
  validateOrderAssignment,
  validateTableQuery,
  validateMongoId,
  validateTableNumber
} from '../validators/tableValidators.js';
import { authMiddleware } from '../middleware/authMiddleware.js';
import { authorizeRole } from '../middleware/roleMiddleware.js';
import { generalLimiter } from '../middleware/rateLimiter.js';

const router = express.Router();

// Public routes (for QR code access)
router.get('/public/:id', generalLimiter, validateMongoId, getTableById);
router.get('/public/number/:tableNumber', generalLimiter, validateTableNumber, getTableByNumber);

// Protected routes (for staff)
router.use(authMiddleware); // All routes below require authentication

// Get all tables
router.get('/', generalLimiter, validateTableQuery, getAllTables);

// Get table by ID
router.get('/:id', generalLimiter, validateMongoId, getTableById);

// Get table by number
router.get('/number/:tableNumber', generalLimiter, validateTableNumber, getTableByNumber);

// Staff can update table status and assign orders
router.patch('/:id/status', generalLimiter, validateTableStatusUpdate, updateTableStatus);
router.post('/assign-order', generalLimiter, validateOrderAssignment, assignOrderToTable);
router.patch('/:id/clear', generalLimiter, validateMongoId, clearOrderFromTable);

// Admin only routes
router.use(authorizeRole(['admin']));

// Create table
router.post('/', generalLimiter, validateTableCreation, createTable);

// Update table
router.put('/:id', generalLimiter, validateTableUpdate, updateTable);

// Delete table
router.delete('/:id', generalLimiter, validateMongoId, deleteTable);

export default router;