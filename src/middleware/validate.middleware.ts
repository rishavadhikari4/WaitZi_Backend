// src/middleware/validate.middleware.ts
// Zod validation middleware. Schemas live in src/validators/*.schema.ts;
// routes apply them with validateBody / validateQuery / validateParams;
// controllers read parsed query/params back with getValidatedQuery / getValidatedParams.
import type { NextFunction, Request, RequestHandler, Response } from 'express';
import type { z, ZodType } from 'zod';

import ApiResponse from '../utils/ApiResponse.js';

function sendValidationError(res: Response, issues: z.core.$ZodIssue[]): void {
  const fieldErrors: Record<string, string[]> = {};
  for (const issue of issues) {
    const key = issue.path.length ? issue.path.join('.') : '_';
    (fieldErrors[key] ??= []).push(issue.message);
  }
  const first = Object.entries(fieldErrors)[0];
  ApiResponse.error(res, 'Validation failed', 'VALIDATION_FAILED', 400, first ? `${first[0]}: ${first[1][0]}` : undefined, {
    errors: fieldErrors,
  });
}

export function validateBody(schema: ZodType): RequestHandler {
  return (req: Request, res: Response, next: NextFunction): void => {
    const result = schema.safeParse(req.body ?? {});
    if (!result.success) return sendValidationError(res, result.error.issues);
    req.body = result.data;
    next();
  };
}

// Express 5 exposes req.query through a getter, so parsed results are stashed
// in res.locals and read back through the typed getters below.
const VALIDATED_QUERY = 'validatedQuery';
const VALIDATED_PARAMS = 'validatedParams';

export function validateQuery(schema: ZodType): RequestHandler {
  return (req, res, next) => {
    const result = schema.safeParse(req.query);
    if (!result.success) return sendValidationError(res, result.error.issues);
    res.locals[VALIDATED_QUERY] = result.data;
    next();
  };
}

export function validateParams(schema: ZodType): RequestHandler {
  return (req, res, next) => {
    const result = schema.safeParse(req.params);
    if (!result.success) return sendValidationError(res, result.error.issues);
    res.locals[VALIDATED_PARAMS] = result.data;
    next();
  };
}

export function getValidatedQuery<T>(res: Response): T {
  return res.locals[VALIDATED_QUERY] as T;
}

export function getValidatedParams<T>(res: Response): T {
  return res.locals[VALIDATED_PARAMS] as T;
}
