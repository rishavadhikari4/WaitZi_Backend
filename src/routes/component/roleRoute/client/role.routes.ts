// src/routes/component/roleRoute/client/role.routes.ts
import { Router } from 'express';

import clientRoleController from '../../../../controllers/roleController/client/client.role.controller.js';
import { requirePermission } from '../../../../middleware/permission.middleware.js';
import { generalLimiter } from '../../../../middleware/ratelimit/index.js';
import { validateBody, validateParams } from '../../../../middleware/validate.middleware.js';
import { createRoleSchema, roleIdParamsSchema, updateRoleSchema } from '../../../../validators/role.schema.js';

const router = Router();

router.use(generalLimiter);

// Any member may read roles (e.g. to show "Waiter" next to a name).
router.get('/', clientRoleController.getRoles);
router.get('/permissions', requirePermission('role.manage'), clientRoleController.getPermissions);
router.get('/:id', validateParams(roleIdParamsSchema), clientRoleController.getRole);

router.post('/', requirePermission('role.manage'), validateBody(createRoleSchema), clientRoleController.createRole);
router.patch(
  '/:id',
  requirePermission('role.manage'),
  validateParams(roleIdParamsSchema),
  validateBody(updateRoleSchema),
  clientRoleController.updateRole,
);
router.delete('/:id', requirePermission('role.manage'), validateParams(roleIdParamsSchema), clientRoleController.deleteRole);

export default router;
