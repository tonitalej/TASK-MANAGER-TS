import type { RequestHandler } from 'express';
import jwt from 'jsonwebtoken';
import { env } from '../config/env.js';
import { AppError } from '../utils/AppError.js';

export interface AuthUser { id: string }

// Authentication: "who are you?"  Reads "Authorization: Bearer <token>".
export const authenticate: RequestHandler = (req, _res, next) => {
  const [scheme, token] = (req.headers.authorization ?? '').split(' ');
  if (scheme !== 'Bearer' || !token) {
    next(new AppError(401, 'UNAUTHORIZED', 'Missing or malformed Authorization header'));
    return;
  }
  try {
    // Pinning the algorithm blocks the classic "alg: none" and algorithm-confusion tricks.
    // verify() also checks the signature and the "exp" claim.
    const payload = jwt.verify(token, env.jwtSecret, { algorithms: ['HS256'] });
    if (typeof payload === 'string' || typeof payload.sub !== 'string') throw new Error('bad payload');
    req.user = { id: payload.sub }; // the ONLY source of "who is calling" for every handler
    next();
  } catch (err) {
    const message = err instanceof jwt.TokenExpiredError ? 'Token expired' : 'Invalid token';
    next(new AppError(401, 'INVALID_TOKEN', message));
  }
};

/** Controllers call this to get the logged-in user (the route guarantees authenticate() ran). */
export function currentUser(req: { user?: AuthUser }): AuthUser {
  if (!req.user) throw new AppError(401, 'UNAUTHORIZED', 'Not authenticated');
  return req.user;
}
