// npm run start:testdb
// Starts the COMPILED server (dist/server.js, run "npm run build" first) against the TEST database,
// e.g. for the frontend click-through tests. DATABASE_URL is replaced in memory only;
// your .env file is not changed.
import { spawn } from 'node:child_process';
import { testDatabaseSsl, testDatabaseUrl } from './test-db.js';

const child = spawn(process.execPath, ['dist/server.js'], {
  stdio: 'inherit',
  env: {
    ...process.env,
    DATABASE_URL: testDatabaseUrl(),
    DATABASE_SSL: testDatabaseSsl(),
    // UI tests register several users; a higher limit keeps them from being rate limited.
    AUTH_RATE_LIMIT_MAX: process.env.TEST_AUTH_RATE_LIMIT_MAX ?? '1000',
  },
});

for (const signal of ['SIGINT', 'SIGTERM'] as const) process.on(signal, () => child.kill(signal));
child.on('exit', (code) => process.exit(code ?? 0));
