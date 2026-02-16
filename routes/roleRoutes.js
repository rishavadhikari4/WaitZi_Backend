import express from "express";
import {
  getAllRoles,
  getRoleById,
  createRole,
  updateRole,
  deleteRole
} from "../controller/roleController.js";
import {
  validateRoleCreation,
  validateRoleUpdate,
  validateMongoId
} from "../validators/roleValidators.js";
import { authMiddleware } from "../middleware/authMiddleware.js";
import { authorizeRole } from "../middleware/roleMiddleware.js";
import { generalLimiter } from "../middleware/rateLimiter.js";

const router = express.Router();

// Protected routes - all role operations require authentication
router.use(authMiddleware);

// Any authenticated staff can view roles
router.get('/', generalLimiter, getAllRoles);
router.get('/:id', generalLimiter, validateMongoId, getRoleById);

// Admin only routes
router.use(authorizeRole(['admin']));

// Create role
router.post('/', generalLimiter, validateRoleCreation, createRole);

// Update role
router.patch('/:id', generalLimiter, validateRoleUpdate, updateRole);

// Delete role
router.delete('/:id', generalLimiter, validateMongoId, deleteRole);

export default router;
