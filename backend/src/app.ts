import express from 'express';
import helmet from 'helmet';
import cors from 'cors';
import { env } from './config/env.js';
import { db } from './config/db.js';
import { logger } from './config/logger.js';
import { rememberMountPath, requestLogger } from './middleware/requestLogger.js';
import { authRoutes } from './routes/auth.routes.js';
import { taskRoutes } from './routes/task.routes.js';
import { errorHandler, notFound } from './middleware/errorHandler.js';

export const app = express();

// In production the API runs behind exactly ONE reverse proxy (the hosting platform's load balancer).
// trust proxy = 1 makes req.ip the real client IP from the LAST X-Forwarded-For entry, which the
// proxy sets. Without it every client would share the proxy's IP (one shared rate limit). Trusting
// more hops, or any hop when there is no proxy, would let clients fake their IP to dodge the limit.
app.set('trust proxy', env.nodeEnv === 'production' ? 1 : false);

app.use(requestLogger);                     // one log line per request (no headers, no bodies)
app.use(helmet());                          // safe HTTP headers
// Browsers may only call the API from the listed origins. No wildcard, and no credentials:
// the token travels in the Authorization header, not in cookies.
app.use(cors({ origin: env.corsOrigins, credentials: false }));
app.use(express.json({ limit: '10kb' }));   // parse JSON, reject huge bodies (413)

app.get('/api/health', async (_req, res) => {
  try {
    await db.query('SELECT 1');             // proves the DB connection works
    res.json({ status: 'ok' });
  } catch (err) {
    logger.warn({ err }, 'Health check: database unavailable');
    res.status(503).json({ status: 'unavailable' }); // no detail for the client
  }
});
app.use('/api/auth', rememberMountPath, authRoutes);
app.use('/api/tasks', rememberMountPath, taskRoutes);

app.use(notFound);
app.use(errorHandler);                      // must be LAST
