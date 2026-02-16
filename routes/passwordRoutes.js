import express from 'express';
import {
  forgotPassword,
  resetPassword,
  changePassword,
  validateResetToken,
  generateTemporaryPassword
} from '../controller/passwordController.js';
import { authMiddleware } from '../middleware/authMiddleware.js';
import { authorizeRole } from '../middleware/roleMiddleware.js';
import { authLimiter, generalLimiter } from '../middleware/rateLimiter.js';
import {
  validateForgotPassword,
  validateResetPassword,
  validateChangePassword
} from '../validators/passwordValidators.js';
import { validateUserId } from '../validators/qrValidators.js';

const router = express.Router();

// Public routes (no authentication required)
// Forgot password request
router.post('/forgot-password', authLimiter, validateForgotPassword, forgotPassword);

// Reset password using token
router.post('/reset-password', authLimiter, validateResetPassword, resetPassword);

// Validate reset token
router.get('/validate-token/:token', generalLimiter, validateResetToken);

// Protected routes (authentication required)
router.use(authMiddleware);

// Change password for authenticated user
router.post('/change-password', generalLimiter, validateChangePassword, changePassword);

// Admin only routes
router.use(authorizeRole(['admin']));

// Generate temporary password for staff member
router.post('/generate-temp-password/:userId', generalLimiter, validateUserId, generateTemporaryPassword);

export default router;
