import express from 'express';
import {
  getAllUsers,
  getUserById,
  getUsersByRole,
  updateUser,
  updateUserStatus,
  updateUserPassword,
  deleteUser,
  getProfile,
  updateProfile
} from '../controller/userController.js';
import {
  validateUserUpdate,
  validateUserStatusUpdate,
  validatePasswordUpdate,
  validateProfileUpdate,
  validateUserQuery,
  validateUsersByRoleQuery,
  validateMongoId
} from '../validators/userValidators.js';
import { authMiddleware } from '../middleware/authMiddleware.js';
import { authorizeRole } from '../middleware/roleMiddleware.js';
import { upload } from '../middleware/multer.js';
import { generalLimiter, uploadLimiter } from '../middleware/rateLimiter.js';

const router = express.Router();

// All routes require authentication
router.use(authMiddleware);

// Profile routes (any authenticated user)
router.get('/profile', generalLimiter, getProfile);
router.put('/profile', uploadLimiter, upload.single('image'), validateProfileUpdate, updateProfile);

// Password update (any authenticated user can update their own password)
router.patch('/:id/password', generalLimiter, validatePasswordUpdate, updateUserPassword);

// Admin only routes for user management
router.use(authorizeRole(['admin']));

// Get all users
router.get('/', generalLimiter, validateUserQuery, getAllUsers);

// Get users by role
router.get('/role/:roleId', generalLimiter, validateUsersByRoleQuery, getUsersByRole);

// Get single user
router.get('/:id', generalLimiter, validateMongoId, getUserById);

// Update user (with optional image upload)
router.put('/:id', uploadLimiter, upload.single('image'), validateUserUpdate, updateUser);

// Update user status
router.patch('/:id/status', generalLimiter, validateUserStatusUpdate, updateUserStatus);

// Admin only routes
router.use(authorizeRole(['admin']));

// Delete user
router.delete('/:id', generalLimiter, validateMongoId, deleteUser);

export default router;