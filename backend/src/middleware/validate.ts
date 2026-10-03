import type { Request, RequestHandler } from 'express';
import { AppError } from '../utils/AppError.js';
import type { Validator } from '../validators/index.js';

type Source = 'body' | 'query' | 'params';

// validate(validator, 'body' | 'query' | 'params')
// On errors -> 400. Otherwise the cleaned data is stored in req.valid[source];
// controllers use ONLY that (never the raw req.body), which also strips unknown fields.
export function validate<T>(validator: Validator<T>, source: Source = 'body'): RequestHandler {
  return (req, _res, next) => {
    const { value, errors } = validator(req[source] ?? {});
    if (errors.length > 0) {
      next(new AppError(400, 'VALIDATION_ERROR', 'Invalid input', errors));
      return;
    }
    req.valid = { ...req.valid, [source]: value };
    next();
  };
}

/**
 * Reads what validate() stored. Pass the SAME validator the route used: TypeScript takes the
 * return type from it, so a controller cannot claim the data has a different shape.
 */
export function validated<T>(req: Request, _validator: Validator<T>, source: Source = 'body'): T {
  const value = req.valid?.[source];
  if (value === undefined) throw new Error(`validate(..., '${source}') is missing on this route`);
  return value as T;
}
