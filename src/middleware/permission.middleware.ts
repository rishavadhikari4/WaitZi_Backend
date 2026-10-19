// src/middleware/permission.middleware.ts
import type { RequestHandler } from 'express';

import { ALL, hasPermission, type Permission } from '../constants/permissions.js';
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
      ApiResponse.error(res, 'Permission denied', 'FORBIDDEN', 403, `Missing permission: ${missing.join(', ')}`, {
        required: perms,
        yourRole: req.user.role.name,
      });
      return;
    }
    next();
  };
}

/**
 * Legacy role-name gate kept so routes can be ported 1:1 before Stage 2
 * switches every route to requirePermission(). Full-access roles pass, as the
 * old hard-coded 'admin' override did.
 */
export function requireRole(...allowed: string[]): RequestHandler {
  const set = new Set(allowed.map((r) => r.toLowerCase()));
  return (req, res, next) => {
    if (!req.user) {
      ApiResponse.unauthorized(res, 'Authentication required');
      return;
    }
    const { name, permissions } = req.user.role;
    if (permissions.includes(ALL) || set.has(name.toLowerCase())) {
      next();
      return;
    }
    ApiResponse.error(res, 'Permission denied', 'FORBIDDEN', 403, `Required role(s): ${allowed.join(', ')}. Your role: ${name}`);
  };
}
