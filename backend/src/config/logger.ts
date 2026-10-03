// One structured (JSON) logger for the whole app. Pretty colours in development only;
// JSON lines in production (easy to search in a log service); silent in tests.
import { pino } from 'pino';
import { env } from './env.js';

export const logger = pino({
  level: env.logLevel,
  // Defense in depth: even if a header object is ever logged, these values are masked.
  redact: {
    paths: ['req.headers.authorization', 'req.headers.cookie', 'res.headers["set-cookie"]', 'password', 'token'],
    censor: '[REDACTED]',
  },
  ...(env.nodeEnv === 'development' ? { transport: { target: 'pino-pretty', options: { colorize: true } } } : {}),
});
