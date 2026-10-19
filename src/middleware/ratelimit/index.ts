// src/middleware/ratelimit/index.ts
// Same windows and limits as the original JS limiters.
import rateLimit, { type Options } from 'express-rate-limit';

const MIN = 60 * 1000;

function limiter(windowMs: number, max: number, message: string, extra: Partial<Options> = {}) {
  return rateLimit({
    windowMs,
    max,
    standardHeaders: true,
    legacyHeaders: false,
    handler: (_req, res) => {
      res.status(429).json({
        success: false,
        error: message,
        code: 'RATE_LIMITED',
        message,
        retryAfter: Math.round(windowMs / 1000),
      });
    },
    ...extra,
  });
}

export const generalLimiter = limiter(15 * MIN, 500, 'Too many requests, please try again later.');
export const authLimiter = limiter(15 * MIN, 20, 'Too many authentication attempts, please try again later.', {
  skipSuccessfulRequests: true,
});
export const staffCreationLimiter = limiter(60 * MIN, 50, 'Too many staff creation attempts, please try again later.');
export const orderCreationLimiter = limiter(10 * MIN, 100, 'Too many order attempts, please try again later.');
export const paymentLimiter = limiter(15 * MIN, 150, 'Too many payment attempts, please try again later.');
export const qrLimiter = limiter(15 * MIN, 200, 'Too many QR requests, please try again later.');
export const uploadLimiter = limiter(15 * MIN, 100, 'Too many uploads, please try again later.');
export const analyticsLimiter = limiter(15 * MIN, 1000, 'Too many analytics requests, please try again later.');
