// Brute-force protection for login and register: at most AUTH_RATE_LIMIT_MAX requests
// per client IP per AUTH_RATE_LIMIT_WINDOW_MS. Counters live in memory, so they reset on
// restart and are per server instance (several instances would need a shared store like Redis).
import { rateLimit } from 'express-rate-limit';
import { env } from '../config/env.js';
import { AppError } from '../utils/AppError.js';

export function createAuthRateLimiter() {
  return rateLimit({
    windowMs: env.authRateLimitWindowMs,
    limit: env.authRateLimitMax,
    standardHeaders: 'draft-8', // RateLimit headers + Retry-After (seconds until the client may retry)
    legacyHeaders: false,
    // Use our normal error envelope instead of the library's plain-text response.
    handler: (_req, _res, next) => {
      next(new AppError(429, 'RATE_LIMITED', 'Too many attempts. Please try again later.'));
    },
  });
}
