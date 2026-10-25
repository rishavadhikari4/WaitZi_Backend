// src/routes/component/auditRoute/client/audit.routes.ts
import { Router } from 'express';

import clientAuditController from '../../../../controllers/auditController/client/client.audit.controller.js';
import { requirePermission } from '../../../../middleware/permission.middleware.js';
import { generalLimiter } from '../../../../middleware/ratelimit/index.js';
import { validateQuery } from '../../../../middleware/validate.middleware.js';
import { auditQuerySchema } from '../../../../validators/audit.schema.js';

const router = Router();

router.get('/', generalLimiter, requirePermission('audit.view'), validateQuery(auditQuerySchema), clientAuditController.list);

export default router;
