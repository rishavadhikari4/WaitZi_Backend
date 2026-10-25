// src/middleware/permission.middleware.ts
import type { RequestHandler } from 'express';

import { hasPermission, type Permission } from '../constants/permissions.js';
import { recordAuditDetached } from '../services/audit/audit.service.js';
import ApiResponse from '../utils/ApiResponse.js';

/**
 * Require every listed permission. Roles are per-org permission sets, so
 * this never checks role names. A role holding '*' (the org admin) passes.
 */
export function requirePermission(...perms: Permission[]): RequestHandler {
  return (req, res, next) => {
    if (!req.user) {
      ApiResponse.unauthorized(res, 'Authentication required');
      return;
    }
    const missing = perms.filter((p) => !hasPermission(req.user!.role.permissions, p));
    if (missing.length) {
      if (req.tenant) {
        recordAuditDetached(req.tenant, {
          action: 'permission.denied',
          targetType: 'route',
          after: { method: req.method, path: req.originalUrl.split('?')[0], missing },
        });
      }
      ApiResponse.error(res, 'Permission denied', 'FORBIDDEN', 403, `Missing permission: ${missing.join(', ')}`, {
        required: perms,
        yourRole: req.user.role.name,
      });
      return;
    }
    next();
  };
}

