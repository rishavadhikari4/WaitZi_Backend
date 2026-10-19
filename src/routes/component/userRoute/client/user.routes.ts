// src/routes/component/userRoute/client/user.routes.ts
import { Router } from 'express';

import { upload } from '../../../../config/multer.js';
import clientUserController from '../../../../controllers/userController/client/client.user.controller.js';
import { requirePermission } from '../../../../middleware/permission.middleware.js';
import { generalLimiter, staffCreationLimiter, uploadLimiter } from '../../../../middleware/ratelimit/index.js';
import { validateBody, validateParams, validateQuery } from '../../../../middleware/validate.middleware.js';
import {
  createMemberSchema,
  memberIdParamsSchema,
  memberQuerySchema,
  memberStatusSchema,
  membersByRoleQuerySchema,
  roleIdParamsSchema,
  selfPasswordSchema,
  updateMemberSchema,
  updateProfileSchema,
} from '../../../../validators/user.schema.js';

const router = Router();

// ── Self-service (any signed-in member) ───────────────────────────────────────
router.get('/profile', generalLimiter, clientUserController.getProfile);
router.put(
  '/profile',
  uploadLimiter,
  upload.single('image'),
  validateBody(updateProfileSchema),
  clientUserController.updateProfile,
);
router.patch(
  '/:id/password',
  generalLimiter,
  validateParams(memberIdParamsSchema),
  validateBody(selfPasswordSchema),
  clientUserController.changeOwnPassword,
);

// ── Staff management ──────────────────────────────────────────────────────────
router.get(
  '/',
  generalLimiter,
  requirePermission('staff.view'),
  validateQuery(memberQuerySchema),
  clientUserController.getMembers,
);
router.get(
  '/role/:roleId',
  generalLimiter,
  requirePermission('staff.view'),
  validateParams(roleIdParamsSchema),
  validateQuery(membersByRoleQuerySchema),
  clientUserController.getMembersByRole,
);
router.get(
  '/:id',
  generalLimiter,
  requirePermission('staff.view'),
  validateParams(memberIdParamsSchema),
  clientUserController.getMember,
);
router.post(
  '/',
  staffCreationLimiter,
  requirePermission('staff.manage'),
  validateBody(createMemberSchema),
  clientUserController.createMember,
);
router.put(
  '/:id',
  uploadLimiter,
  requirePermission('staff.manage'),
  upload.single('image'),
  validateParams(memberIdParamsSchema),
  validateBody(updateMemberSchema),
  clientUserController.updateMember,
);
router.patch(
  '/:id/status',
  generalLimiter,
  requirePermission('staff.manage'),
  validateParams(memberIdParamsSchema),
  validateBody(memberStatusSchema),
  clientUserController.updateMemberStatus,
);
router.post(
  '/:id/reset-password',
  generalLimiter,
  requirePermission('staff.manage'),
  validateParams(memberIdParamsSchema),
  clientUserController.resetMemberPassword,
);
router.delete(
  '/:id',
  generalLimiter,
  requirePermission('staff.manage'),
  validateParams(memberIdParamsSchema),
  clientUserController.removeMember,
);

export default router;
