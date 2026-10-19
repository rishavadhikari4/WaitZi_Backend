// src/sanitization/errorHandler.middleware.ts
import type { NextFunction, Request, Response } from 'express';

import config from '../config/config.js';
import { AppError } from '../utils/AppError.js';
import ApiResponse from '../utils/ApiResponse.js';
import { logger } from '../utils/logger.js';
import { mapPrismaError } from '../utils/prismaErrors.js';

const isDev = !config.app.isProduction;

export const errorHandler = (
  err: Error & { code?: string; status?: number; statusCode?: number; type?: string },
  _req: Request,
  res: Response,
  _next: NextFunction,
): void => {
  if (res.headersSent) return;

  const appError = err instanceof AppError ? err : mapPrismaError(err);
  if (appError) {
    ApiResponse.error(res, appError.message, appError.code, appError.statusCode, undefined, {
      ...(appError.details !== undefined && { details: appError.details }),
      ...(isDev && { stack: appError.stack }),
    });
    return;
  }

  if (err.name === 'MulterError') {
    const message = err.code === 'LIMIT_FILE_SIZE' ? 'Uploaded file exceeds the allowed size limit' : err.message;
    ApiResponse.error(res, 'File upload error', err.code ?? 'MULTER_ERROR', 400, message);
    return;
  }

  if (err.type === 'entity.parse.failed') {
    ApiResponse.error(res, 'Malformed JSON body', 'INVALID_JSON', 400);
    return;
  }

  if (err.message?.includes('CORS')) {
    ApiResponse.error(res, 'CORS policy violation', 'CORS_ERROR', 403, 'Origin not allowed');
    return;
  }

  logger.error(`Unhandled error: ${err.message}`, { stack: err.stack });
  ApiResponse.error(res, 'Internal server error', 'INTERNAL_ERROR', err.statusCode ?? err.status ?? 500, undefined, {
    ...(isDev && { details: err.message }),
  });
};

export const notFoundHandler = (req: Request, res: Response): void => {
  ApiResponse.notFound(res, `Route ${req.method} ${req.originalUrl} not found`, 'ROUTE_NOT_FOUND');
};
