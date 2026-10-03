// Separate file = separate process (node --test), so its low limit does not affect api.test.ts.
import './setup-env.js';      // MUST be first
import './rate-limit-env.js'; // MUST be second: AUTH_RATE_LIMIT_MAX=3 before the app is imported
import { test, before, after, describe } from 'node:test';
import assert from 'node:assert/strict';
import { call, PASSWORD, startServer, stopServer, uniqueEmail } from './helpers.js';

before(startServer);
after(stopServer);

describe('rate limiting on auth endpoints (limit 3 per window in this file)', () => {
  const email = uniqueEmail(); // never registered: every login attempt fails

  test('the 4th login attempt from the same IP -> 429 RATE_LIMITED with Retry-After', async () => {
    for (let i = 1; i <= 3; i++) {
      const r = await call('POST', '/api/auth/login', { body: { email, password: PASSWORD } });
      assert.equal(r.status, 401, `attempt ${i}`);
    }
    const blocked = await call('POST', '/api/auth/login', { body: { email, password: PASSWORD } });
    assert.equal(blocked.status, 429);
    assert.deepEqual(blocked.json, { error: { code: 'RATE_LIMITED', message: 'Too many attempts. Please try again later.' } });
    const retryAfter = Number(blocked.headers.get('retry-after'));
    assert.ok(retryAfter > 0 && retryAfter <= 60, `Retry-After was ${blocked.headers.get('retry-after')}`);
  });

  test('register has its own budget, and other endpoints are not limited', async () => {
    const r = await call('POST', '/api/auth/register', { body: { name: 'x' } }); // invalid on purpose: no user is created
    assert.equal(r.status, 400);
    for (let i = 0; i < 5; i++) assert.equal((await call('GET', '/api/health')).status, 200);
  });
});
