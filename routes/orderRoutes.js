import express from 'express';
import {
  createOrder,
  getAllOrders,
  getOrderById,
  getOrdersByTable,
  updateOrderStatus,
  updateOrderItemStatus,
  addItemsToOrder,
  cancelOrder,
  getKitchenOrders,
  completeOrder
} from '../controller/orderController.js';
import {
  validateOrderCreation,
  validateOrderStatusUpdate,
  validateOrderItemStatusUpdate,
  validateAddItemsToOrder,
  validateCancelOrder,
  validateOrderQuery,
  validateKitchenOrdersQuery,
  validateMongoId,
  validateTableId
} from '../validators/orderValidators.js';
import { authMiddleware } from '../middleware/authMiddleware.js';
import { authorizeRole } from '../middleware/roleMiddleware.js';
import { generalLimiter, orderCreationLimiter } from '../middleware/rateLimiter.js';

const router = express.Router();

// Public routes (for QR code customers)
router.post('/public', orderCreationLimiter, validateOrderCreation, createOrder);
router.get('/public/table/:tableId', generalLimiter, validateTableId, getOrdersByTable);

// Protected routes (for staff)
router.use(authMiddleware); // All routes below require authentication

// Get all orders
router.get('/', generalLimiter, validateOrderQuery, getAllOrders);

// Get single order
router.get('/:id', generalLimiter, validateMongoId, getOrderById);

// Get orders by table (staff view)
router.get('/table/:tableId', generalLimiter, validateTableId, getOrdersByTable);

// Get kitchen orders (for kitchen staff)
router.get('/kitchen/queue', generalLimiter, validateKitchenOrdersQuery, getKitchenOrders);

// Update order status (staff/manager)
router.patch('/:id/status', generalLimiter, validateOrderStatusUpdate, updateOrderStatus);

// Update individual order item status (kitchen staff)
router.patch('/:orderId/items/:itemId/status', generalLimiter, validateOrderItemStatusUpdate, updateOrderItemStatus);

// Add items to existing order (staff can help customers add more items)
router.post('/:id/items', generalLimiter, validateAddItemsToOrder, addItemsToOrder);

// Cancel order (staff/manager)
router.patch('/:id/cancel', generalLimiter, validateCancelOrder, cancelOrder);

// Complete order (after payment)
router.patch('/:id/complete', generalLimiter, validateMongoId, completeOrder);

export default router;