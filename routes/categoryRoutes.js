import express from "express";
import {
  createCategory,
  getAllCategories,
  getCategoryById,
  updateCategory,
  deleteCategory
} from "../controller/categoryController.js";
import {
  validateCategoryCreation,
  validateCategoryUpdate,
  validateCategoryQuery,
  validateMongoId
} from "../validators/categoryValidators.js";
import { authMiddleware } from "../middleware/authMiddleware.js";
import { authorizeRole } from "../middleware/roleMiddleware.js";
import { uploadSingle } from "../middleware/multer.js";
import { generalLimiter, uploadLimiter } from "../middleware/rateLimiter.js";

const router = express.Router();

// Public routes (for QR code customers to see categories)
router.get('/', generalLimiter, validateCategoryQuery, getAllCategories);
router.get('/:id', generalLimiter, validateMongoId, getCategoryById);

// Protected routes (Admin only)
router.use(authMiddleware);
router.use(authorizeRole(['admin']));

// Create category (with image upload)
router.post('/', uploadLimiter, uploadSingle('image'), validateCategoryCreation, createCategory);

// Update category (with optional image upload)
router.put('/:id', uploadLimiter, uploadSingle('image'), validateCategoryUpdate, updateCategory);

// Delete category
router.delete('/:id', generalLimiter, validateMongoId, deleteCategory);

export default router;
