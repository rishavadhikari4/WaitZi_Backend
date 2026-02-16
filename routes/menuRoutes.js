import express from 'express';
import {
  createMenuItem,
  getAllMenuItems,
  getMenuByCategory,
  getMenuItemById,
  updateMenuItem,
  deleteMenuItem,
  updateAvailabilityStatus
} from '../controller/menuController.js';
import {
  validateMenuItemCreation,
  validateMenuItemUpdate,
  validateAvailabilityUpdate,
  validateMenuQuery,
  validateMongoId,
  validateCategoryId
} from '../validators/menuValidators.js';
import { authMiddleware } from '../middleware/authMiddleware.js';
import { authorizeRole } from '../middleware/roleMiddleware.js';
import { upload } from '../middleware/multer.js';
import { generalLimiter, uploadLimiter } from '../middleware/rateLimiter.js';

const router = express.Router();

// Public routes (for QR code customers)
router.get('/public', generalLimiter, validateMenuQuery, getAllMenuItems);
router.get('/public/category/:categoryId', generalLimiter, validateCategoryId, getMenuByCategory);
router.get('/public/:id', generalLimiter, validateMongoId, getMenuItemById);

// Protected routes (for staff)
router.use(authMiddleware); // All routes below require authentication

// Get all menu items (staff)
router.get('/', generalLimiter, validateMenuQuery, getAllMenuItems);

// Get menu by category (staff)
router.get('/category/:categoryId', generalLimiter, validateCategoryId, getMenuByCategory);

// Get single menu item (staff)
router.get('/:id', generalLimiter, validateMongoId, getMenuItemById);

// Admin/Manager only routes
router.use(authorizeRole(['admin', 'manager']));

// Create menu item (with image upload)
router.post('/', uploadLimiter, upload.single('image'), validateMenuItemCreation, createMenuItem);

// Update menu item (with optional image upload)
router.put('/:id', uploadLimiter, upload.single('image'), validateMenuItemUpdate, updateMenuItem);

// Update availability status
router.patch('/:id/availability', generalLimiter, validateAvailabilityUpdate, updateAvailabilityStatus);

// Delete menu item
router.delete('/:id', generalLimiter, validateMongoId, deleteMenuItem);

export default router;