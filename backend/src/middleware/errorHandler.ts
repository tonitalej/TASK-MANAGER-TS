import type { ErrorRequestHandler, RequestHandler } from 'express';
import { AppError } from '../utils/AppError.js';

export const notFound: RequestHandler = (req, _res, next) => {
  next(new AppError(404, 'ROUTE_NOT_FOUND', `Route ${req.method} ${req.path} not found`));
};

// Errors from libraries have extra fields we want to look at.
interface LibraryError { type?: string; code?: string }

// The ONLY place where errors become HTTP responses.
// Rule: never leak internals (SQL, stack traces, driver messages) to clients.
export const errorHandler: ErrorRequestHandler = (err: unknown, _req, res, _next) => {
  let status = 500;
  let code = 'INTERNAL_ERROR';
  let message = 'Something went wrong';
  let details: unknown;

  const lib = (typeof err === 'object' && err !== null ? err : {}) as LibraryError;

  if (err instanceof AppError) {
    ({ statusCode: status, code, message, details } = err);
  } else if (lib.type === 'entity.parse.failed') {
    [status, code, message] = [400, 'INVALID_JSON', 'Request body is not valid JSON'];
  } else if (lib.type === 'entity.too.large') {
    [status, code, message] = [413, 'PAYLOAD_TOO_LARGE', 'Request body too large'];
  }
  // PostgreSQL error codes (a safety net: constraints are the last line of defense)
  else if (lib.code === '23505') [status, code, message] = [409, 'CONFLICT', 'Resource already exists'];
  else if (lib.code === '23503') [status, code, message] = [409, 'REFERENCE_ERROR', 'Referenced resource does not exist'];
  else if (lib.code === '22P02') [status, code, message] = [400, 'INVALID_INPUT', 'Invalid value format'];
  else if (lib.code === '23502' || lib.code === '23514') {
    [status, code, message] = [400, 'CONSTRAINT_VIOLATION', 'Data violates a database rule'];
  }

  // The full error (with stack) goes to OUR logs only: pino-http logs it with this request's line.
  if (status === 500) res.err = err instanceof Error ? err : new Error(String(err));

  res.status(status).json({ error: { code, message, ...(details ? { details } : {}) } });
};
