// ES module imports run in order and BEFORE the importing file's own code, so test env vars
// must be set in a module that is imported FIRST (see the first import in each test file).
import { testDatabaseSsl, testDatabaseUrl } from '../scripts/test-db.js';

// Point the app at the TEST database. testDatabaseUrl() throws if TEST_DATABASE_URL is missing
// or is the same database as DATABASE_URL, so the real database is never touched.
process.env.DATABASE_URL = testDatabaseUrl();
process.env.DATABASE_SSL = testDatabaseSsl();
process.env.NODE_ENV = 'test';
process.env.LOG_LEVEL = 'silent';
// A test-only secret: tokens forged in tests are never valid against the real server.
process.env.JWT_SECRET = 'test-only-jwt-secret-0123456789abcdef';
process.env.BCRYPT_ROUNDS = '10';
process.env.CORS_ORIGIN = 'http://localhost:5173';
// The main suite registers many users; the rate-limit suite lowers this again (rate-limit.test.ts).
process.env.AUTH_RATE_LIMIT_MAX = '10000';
export {};
