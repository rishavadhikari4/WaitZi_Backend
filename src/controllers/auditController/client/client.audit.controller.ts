// src/controllers/auditController/client/client.audit.controller.ts
import type { Request, Response } from 'express';

import { getValidatedQuery } from '../../../middleware/validate.middleware.js';
import ClientAuditService from '../../../services/audit/audit.service.js';
import ApiResponse from '../../../utils/ApiResponse.js';
import type { AuditQuery } from '../../../validators/audit.schema.js';
import BaseController from '../../base.controller.js';

class ClientAuditController extends BaseController {
  list = async (req: Request, res: Response) => {
    try {
      const q = getValidatedQuery<AuditQuery>(res);
      const { entries, pagination } = await ClientAuditService.list(
        this.tenant(req),
        {
          ...(q.action && { action: q.action }),
          ...(q.actor && { actorUserId: q.actor }),
          ...(q.targetType && { targetType: q.targetType }),
          ...(q.targetId && { targetId: q.targetId }),
          ...(q.startDate && { from: q.startDate }),
          ...(q.endDate && { to: q.endDate }),
        },
        q.page,
        q.limit,
      );
      return ApiResponse.success(res, entries, 'Audit log retrieved', 200, { pagination });
    } catch (error) {
      return this.sendError(res, error, 'ClientAuditController.list', 'Failed to fetch audit log');
    }
  };
}

export default new ClientAuditController();
