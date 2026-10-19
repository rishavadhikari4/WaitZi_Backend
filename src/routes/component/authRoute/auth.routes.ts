// src/routes/component/authRoute/auth.routes.ts
import { Router } from 'express';

import authController from '../../../controllers/authController/auth.controller.js';
import passwordController from '../../../controllers/authController/password.controller.js';
import { authMiddleware } from '../../../middleware/auth/auth.middleware.js';
import { authLimiter, generalLimiter } from '../../../middleware/ratelimit/index.js';
import { validateBody, validateParams } from '../../../middleware/validate.middleware.js';
import {
  changePasswordSchema,
  forgotPasswordSchema,
  loginSchema,
  refreshSchema,
  resetPasswordSchema,
  resetTokenParamsSchema,
} from '../../../validators/auth.schema.js';

const router = Router();

// ── Session ───────────────────────────────────────────────────────────────────
router.post('/login', authLimiter, validateBody(loginSchema), authController.login);
router.post('/refresh-token', authLimiter, validateBody(refreshSchema), authController.refreshToken);
router.post('/logout', generalLimiter, authController.logout);
router.get('/verify', generalLimiter, authMiddleware, authController.verify);

// ── Passwords ─────────────────────────────────────────────────────────────────
router.post('/forgot-password', authLimiter, validateBody(forgotPasswordSchema), passwordController.forgotPassword);
router.post('/reset-password', authLimiter, validateBody(resetPasswordSchema), passwordController.resetPassword);
router.get(
  '/reset-password/:token',
  generalLimiter,
  validateParams(resetTokenParamsSchema),
  passwordController.validateResetToken,
);
router.post(
  '/change-password',
  generalLimiter,
  authMiddleware,
  validateBody(changePasswordSchema),
  passwordController.changePassword,
);

export default router;
