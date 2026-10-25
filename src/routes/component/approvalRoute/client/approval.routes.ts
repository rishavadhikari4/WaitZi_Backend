// src/routes/component/approvalRoute/client/approval.routes.ts
import { Router } from 'express';

import clientApprovalController from '../../../../controllers/approvalController/client/client.approval.controller.js';
import { authLimiter } from '../../../../middleware/ratelimit/index.js';
import { validateBody } from '../../../../middleware/validate.middleware.js';
import { requestApprovalSchema, setPinSchema } from '../../../../validators/approval.schema.js';

const router = Router();

// PINs are short, so both routes share the login rate limit.
router.use(authLimiter);

// Any staff member may ask; the approver's own permissions decide.
router.post('/', validateBody(requestApprovalSchema), clientApprovalController.requestApproval);
router.put('/pin', validateBody(setPinSchema), clientApprovalController.setPin);

export default router;
