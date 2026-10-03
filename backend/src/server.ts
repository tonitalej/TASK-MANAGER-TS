import { app } from './app.js';
import { env } from './config/env.js';
import { db } from './config/db.js';
import { logger } from './config/logger.js';

const SHUTDOWN_TIMEOUT_MS = 10_000;

const server = app.listen(env.port, () => { logger.info(`API listening on port ${env.port} (${env.nodeEnv})`); });

// Graceful shutdown (Ctrl+C locally, SIGTERM from the host on redeploy):
// 1. stop accepting new connections, 2. let in-flight requests finish, 3. close the DB pool.
// If that takes too long, exit anyway so the host is not blocked.
let shuttingDown = false;
function shutdown(signal: string): void {
  if (shuttingDown) return;
  shuttingDown = true;
  logger.info(`${signal} received, shutting down`);

  setTimeout(() => {
    logger.error('Shutdown timed out, forcing exit');
    process.exit(1);
  }, SHUTDOWN_TIMEOUT_MS).unref(); // unref: this timer alone does not keep the process alive

  server.close(() => {
    db.pool.end()
      .then(() => process.exit(0))
      .catch((err: unknown) => {
        logger.error({ err }, 'Error while closing the database pool');
        process.exit(1);
      });
  });
  server.closeIdleConnections(); // idle keep-alive connections would otherwise delay close()
}
process.on('SIGINT', () => { shutdown('SIGINT'); });
process.on('SIGTERM', () => { shutdown('SIGTERM'); });
