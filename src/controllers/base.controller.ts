// src/controllers/base.controller.ts
import type { Request, Response } from 'express';

import type { TenantContext } from '../config/prisma.js';
import type { RequestUser } from '../Interface/GlobalInterface.js';
import { AppError } from '../utils/AppError.js';
import ApiResponse from '../utils/ApiResponse.js';
import { logger } from '../utils/logger.js';
import { mapPrismaError } from '../utils/prismaErrors.js';

abstract class BaseController {
  /** The caller's tenant context; authMiddleware guarantees it on /client routes. */
  protected tenant(req: Request): TenantContext {
    if (!req.tenant) throw AppError.unauthorized('Organization context is required', 'NO_TENANT');
    return req.tenant;
  }

  protected actor(req: Request): RequestUser {
    if (!req.user) throw AppError.unauthorized('Authentication required');
    return req.user;
  }

  protected sendError(
    res: Response,
    error: unknown,
    context: string,
    message = 'Internal server error',
    code = 'INTERNAL_ERROR',
  ): Response {
    const appError = error instanceof AppError ? error : mapPrismaError(error);
    if (appError) {
      logger.warn(`[${context}] ${appError.message}`, { code: appError.code, statusCode: appError.statusCode });
      const extra =
        appError.details && typeof appError.details === 'object'
          ? (appError.details as Record<string, unknown>)
          : {};
      return ApiResponse.error(res, appError.message, appError.code, appError.statusCode, undefined, extra);
    }
    const err = error as Error;
    logger.error(`[${context}] ${err?.message ?? String(error)}`, { stack: err?.stack });
    return ApiResponse.internal(res, message, code);
  }
}

export default BaseController;
