// src/routes/component/menuRoute/client/menu.routes.ts
// Categories and menu items for restaurant staff (/api/client/categories, /api/client/menu).
import { Router } from 'express';

import { upload } from '../../../../config/multer.js';
import categoryController from '../../../../controllers/menuController/client/client.category.controller.js';
import menuController from '../../../../controllers/menuController/client/client.menu.controller.js';
import { requirePermission } from '../../../../middleware/permission.middleware.js';
import { generalLimiter, uploadLimiter } from '../../../../middleware/ratelimit/index.js';
import { validateBody, validateParams, validateQuery } from '../../../../middleware/validate.middleware.js';
import { idParamsSchema } from '../../../../validators/common.schema.js';
import {
  availabilitySchema,
  categoryQuerySchema,
  createCategorySchema,
  createMenuItemSchema,
  menuQuerySchema,
  updateCategorySchema,
  updateMenuItemSchema,
} from '../../../../validators/menu.schema.js';

// ── Categories ────────────────────────────────────────────────────────────────
export const categoryRoutes = Router();

categoryRoutes.get('/', generalLimiter, requirePermission('menu.view'), validateQuery(categoryQuerySchema), categoryController.getCategories);
categoryRoutes.get('/:id', generalLimiter, requirePermission('menu.view'), validateParams(idParamsSchema), categoryController.getCategory);
categoryRoutes.post(
  '/',
  uploadLimiter,
  requirePermission('menu.manage'),
  upload.single('image'),
  validateBody(createCategorySchema),
  categoryController.createCategory,
);
categoryRoutes.put(
  '/:id',
  uploadLimiter,
  requirePermission('menu.manage'),
  upload.single('image'),
  validateParams(idParamsSchema),
  validateBody(updateCategorySchema),
  categoryController.updateCategory,
);
categoryRoutes.delete('/:id', generalLimiter, requirePermission('menu.manage'), validateParams(idParamsSchema), categoryController.deleteCategory);

// ── Menu items ────────────────────────────────────────────────────────────────
export const menuRoutes = Router();

menuRoutes.get('/', generalLimiter, requirePermission('menu.view'), validateQuery(menuQuerySchema), menuController.getMenuItems);
menuRoutes.get('/:id', generalLimiter, requirePermission('menu.view'), validateParams(idParamsSchema), menuController.getMenuItem);
menuRoutes.post(
  '/',
  uploadLimiter,
  requirePermission('menu.manage'),
  upload.single('image'),
  validateBody(createMenuItemSchema),
  menuController.createMenuItem,
);
menuRoutes.put(
  '/:id',
  uploadLimiter,
  requirePermission('menu.manage'),
  upload.single('image'),
  validateParams(idParamsSchema),
  validateBody(updateMenuItemSchema),
  menuController.updateMenuItem,
);
// Kitchen staff can 86 an item without full menu rights.
menuRoutes.patch(
  '/:id/availability',
  generalLimiter,
  requirePermission('menu.86'),
  validateParams(idParamsSchema),
  validateBody(availabilitySchema),
  menuController.updateAvailability,
);
menuRoutes.delete('/:id', generalLimiter, requirePermission('menu.manage'), validateParams(idParamsSchema), menuController.deleteMenuItem);
