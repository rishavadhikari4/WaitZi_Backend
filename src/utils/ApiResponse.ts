// src/utils/ApiResponse.ts
import type { Response } from 'express';

import { withMongoIds } from './legacyIds.js';

export interface SuccessPayload {
  success: true;
  message?: string;
  data?: unknown;
  [key: string]: unknown;
}

export interface ErrorPayload {
  success: false;
  error: string;
  code: string;
  message: string;
  [key: string]: unknown;
}

class ApiResponse {
  /**
   * Successful JSON response. `data` and `extra` get an `_id` alias next to
   * every `id` (see legacyIds.ts) so the current frontend keeps working.
   */
  static success(
    res: Response,
    data?: unknown,
    message?: string,
    status = 200,
    extra: Record<string, unknown> = {},
  ): Response {
    const body: SuccessPayload = {
      success: true,
      ...(message !== undefined && { message }),
      ...(data !== undefined && { data: withMongoIds(data) }),
      ...(withMongoIds(extra) as Record<string, unknown>),
    };
    return res.status(status).json(body);
  }

  /**
   * Error JSON response. `message` mirrors `error` (unless given) because the
   * frontend reads `response.data.message`.
   */
  static error(
    res: Response,
    error: string,
    code: string,
    status = 400,
    message?: string,
    extra: Record<string, unknown> = {},
  ): Response {
    const body: ErrorPayload = { success: false, error, code, message: message ?? error, ...extra };
    return res.status(status).json(body);
  }

  static created(res: Response, data?: unknown, message?: string, extra: Record<string, unknown> = {}) {
    return ApiResponse.success(res, data, message, 201, extra);
  }

  static noContent(res: Response): Response {
    return res.status(204).send();
  }

  static unauthorized(res: Response, message = 'Unauthorized', code = 'UNAUTHORIZED') {
    return ApiResponse.error(res, message, code, 401);
  }

  static forbidden(res: Response, message = 'Forbidden', code = 'FORBIDDEN') {
    return ApiResponse.error(res, message, code, 403);
  }

  static notFound(res: Response, message = 'Not found', code = 'NOT_FOUND') {
    return ApiResponse.error(res, message, code, 404);
  }

  static conflict(res: Response, message: string, code = 'CONFLICT') {
    return ApiResponse.error(res, message, code, 409);
  }

  static internal(res: Response, message = 'Internal server error', code = 'INTERNAL_ERROR') {
    return ApiResponse.error(res, message, code, 500);
  }
}

export default ApiResponse;
