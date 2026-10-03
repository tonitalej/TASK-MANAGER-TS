// Imported by rate-limit.test.ts right AFTER setup-env.ts and BEFORE the app, so the limiter
// is created with a low limit. The production code is unchanged: only the configuration differs.
process.env.AUTH_RATE_LIMIT_MAX = '3';
process.env.AUTH_RATE_LIMIT_WINDOW_MS = '60000';
export {};
