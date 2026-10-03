// One log line per request: id, method, url, route, status, duration.
// Headers and bodies are NOT logged (they can contain tokens and passwords).
import { randomUUID } from 'node:crypto';
import type { Request, RequestHandler, Response } from 'express';
import { pinoHttp } from 'pino-http';
import { logger } from '../config/logger.js';

interface RouteLocals { mountPath?: string }

// Express resets req.baseUrl when a router is done, so remember it while we are inside.
// Use as: app.use('/api/tasks', rememberMountPath, taskRoutes)
export const rememberMountPath: RequestHandler = (req, res, next) => {
  (res.locals as RouteLocals).mountPath = req.baseUrl;
  next();
};

// "/api/tasks/:id" instead of "/api/tasks/3f2c...": groups requests by endpoint.
function routeOf(req: Request, res: Response): string | undefined {
  const path = (req.route as { path?: unknown } | undefined)?.path;
  return typeof path === 'string' ? `${(res.locals as RouteLocals).mountPath ?? ''}${path}` : undefined;
}

export const requestLogger = pinoHttp({
  logger,
  // We always generate the id ourselves; a client-supplied id could be used to forge log lines.
  genReqId: (_req, res) => {
    const id = randomUUID();
    res.setHeader('X-Request-Id', id);
    return id;
  },
  serializers: {
    req: (req: { id: unknown; method: string; url: string }) => ({ id: req.id, method: req.method, url: req.url }),
    res: (res: { statusCode: number }) => ({ statusCode: res.statusCode }),
  },
  customLogLevel: (_req, res, err) => (err || res.statusCode >= 500 ? 'error' : res.statusCode >= 400 ? 'warn' : 'info'),
  customSuccessObject: (req, res, base: object) => ({ ...base, route: routeOf(req as Request, res as Response) }),
  customErrorObject: (req, res, _err, base: object) => ({ ...base, route: routeOf(req as Request, res as Response) }),
});
