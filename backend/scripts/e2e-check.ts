// npm run e2e:check   (run "npm run build" and "npm run db:test:setup" first)
// End-to-end checks with REAL HTTP requests against the COMPILED server (dist/server.js):
//   - server 1 uses the TEST database (never DATABASE_URL);
//   - server 2 uses an unreachable database and AUTH_RATE_LIMIT_MAX=3, to check that a database
//     failure gives a safe generic error and that the auth rate limit answers 429.
// Prints PASS/FAIL per check, deletes the users it created, and exits 1 if anything failed.
import { spawn, type ChildProcess } from 'node:child_process';
import jwt from 'jsonwebtoken';
import pg from 'pg';
import { testDatabaseSsl, testDatabaseUrl } from './test-db.js';

const MAIN_PORT = 3901;
const BROKEN_DB_PORT = 3902;
// 10.255.255.1 is a private address nothing answers on, so connecting times out like a dead database.
const UNREACHABLE_DB = 'postgres://e2e:e2e@10.255.255.1:5432/unreachable';
const PASSWORD = 'Secret1234';

interface Reply { status: number; body: unknown; text: string; headers: Headers }
interface UserReply { id: string; email: string; password_hash?: unknown }
interface TaskReply { id: string; title: string; user_id: string }

let failures = 0;
function check(name: string, pass: boolean, note = ''): void {
  if (!pass) failures++;
  console.log(`${pass ? 'PASS' : 'FAIL'}  ${name}${note ? `  (${note})` : ''}`);
}

const errorCode = (r: Reply): string | undefined => (r.body as { error?: { code?: string } } | null)?.error?.code;
interface AuthReply { user: UserReply; token: string }
const dataOf = (r: Reply): unknown => (r.body as { data: unknown }).data;
const totalOf = (r: Reply): number => (r.body as { meta: { total: number } }).meta.total;

async function call(port: number, method: string, path: string, opts: { token?: string; body?: unknown } = {}): Promise<Reply> {
  const res = await fetch(`http://localhost:${port}${path}`, {
    method,
    headers: {
      ...(opts.body !== undefined ? { 'Content-Type': 'application/json' } : {}),
      ...(opts.token ? { Authorization: `Bearer ${opts.token}` } : {}),
    },
    body: opts.body !== undefined ? JSON.stringify(opts.body) : undefined,
  });
  const text = await res.text();
  let body: unknown = null;
  try { body = JSON.parse(text); } catch { /* 204 or non-JSON: keep null */ }
  return { status: res.status, body, text, headers: res.headers };
}

function startServer(port: number, env: Record<string, string>): ChildProcess {
  // stdout (request logs) is ignored; stderr is shown so a crash on startup is visible.
  return spawn(process.execPath, ['dist/server.js'], {
    stdio: ['ignore', 'ignore', 'inherit'],
    env: { ...process.env, PORT: String(port), LOG_LEVEL: 'warn', ...env },
  });
}

async function waitUntilListening(port: number): Promise<void> {
  for (let i = 0; i < 60; i++) {
    try {
      await fetch(`http://localhost:${port}/api/health`);
      return;
    } catch {
      await new Promise((resolve) => setTimeout(resolve, 250));
    }
  }
  throw new Error(`Server on port ${String(port)} did not start`);
}

const base64url = (value: object): string => Buffer.from(JSON.stringify(value)).toString('base64url');

async function run(secret: string, createdUserIds: string[]): Promise<void> {
  const stamp = `${String(Date.now())}-${Math.random().toString(36).slice(2, 8)}`;
  const emailA = `e2e-a-${stamp}@example.com`;
  const emailB = `e2e-b-${stamp}@example.com`;
  const M = MAIN_PORT;

  // 1 register
  const regA = await call(M, 'POST', '/api/auth/register', { body: { name: 'E2E A', email: emailA, password: PASSWORD } });
  const regB = await call(M, 'POST', '/api/auth/register', { body: { name: 'E2E B', email: emailB, password: PASSWORD } });
  const userA = regA.status === 201 ? (dataOf(regA) as AuthReply) : undefined;
  const userB = regB.status === 201 ? (dataOf(regB) as AuthReply) : undefined;
  if (userA) createdUserIds.push(userA.user.id);
  if (userB) createdUserIds.push(userB.user.id);
  const duplicate = await call(M, 'POST', '/api/auth/register', { body: { name: 'E2E A', email: emailA, password: PASSWORD } });
  check('1 register works', regA.status === 201 && regB.status === 201 && Boolean(userA?.token)
    && userA?.user.password_hash === undefined && duplicate.status === 409,
  `A -> ${String(regA.status)}, B -> ${String(regB.status)}, duplicate email -> ${String(duplicate.status)}`);
  if (!userA || !userB) throw new Error('Registration failed; the remaining checks need two users.');

  // 2 login
  const login = await call(M, 'POST', '/api/auth/login', { body: { email: emailA, password: PASSWORD } });
  const wrong = await call(M, 'POST', '/api/auth/login', { body: { email: emailA, password: 'Wrong12345' } });
  const tokenA = login.status === 200 ? (dataOf(login) as AuthReply).token : '';
  check('2 login works', login.status === 200 && tokenA !== '' && wrong.status === 401,
    `correct -> ${String(login.status)}, wrong password -> ${String(wrong.status)}`);
  const tokenB = userB.token;

  // 3 protected endpoint with a token
  const me = await call(M, 'GET', '/api/auth/me', { token: tokenA });
  const created = await call(M, 'POST', '/api/tasks', { token: tokenA, body: { title: 'E2E task of A', priority: 'high' } });
  const taskA = created.status === 201 ? (dataOf(created) as TaskReply) : undefined;
  check('3 JWT-protected endpoint works with a token',
    me.status === 200 && (dataOf(me) as { user: UserReply }).user.email === emailA && taskA?.user_id === userA.user.id,
    `GET /me -> ${String(me.status)}, POST /tasks -> ${String(created.status)}`);
  if (!taskA) throw new Error('Task creation failed; the remaining checks need a task.');

  // 4 missing / invalid / expired / tampered tokens
  const now = Math.floor(Date.now() / 1000);
  const expired = jwt.sign({ exp: now - 60 }, secret, { subject: userA.user.id, algorithm: 'HS256' });
  const wrongSecret = jwt.sign({}, 'not-the-server-secret-0123456789abcdef', { subject: userA.user.id, algorithm: 'HS256' });
  const otherAlgorithm = jwt.sign({}, secret, { subject: userA.user.id, algorithm: 'HS512' });
  const algNone = `${base64url({ alg: 'none', typ: 'JWT' })}.${base64url({ sub: userA.user.id, iat: now })}.`;
  const tokenCases: [string, string | undefined][] = [
    ['missing', undefined], ['garbage', 'garbage.token.value'], ['expired', expired],
    ['wrong secret', wrongSecret], ['HS512', otherAlgorithm], ['alg none', algNone],
  ];
  const rejected: string[] = [];
  for (const [label, token] of tokenCases) {
    const r = await call(M, 'GET', '/api/tasks', { token });
    rejected.push(`${label} -> ${String(r.status)}`);
  }
  check('4 protected endpoints reject missing/invalid/expired tokens', rejected.every((s) => s.endsWith('401')), rejected.join(', '));

  // 5-7 user B against user A's task: always 404 (never 403), and A's task is untouched
  const path = `/api/tasks/${taskA.id}`;
  const bRead = await call(M, 'GET', path, { token: tokenB });
  check('5 user A cannot read user B\'s task (B reads A\'s)', bRead.status === 404 && !bRead.text.includes('E2E task of A'),
    `GET -> ${String(bRead.status)}`);
  const bPatch = await call(M, 'PATCH', path, { token: tokenB, body: { title: 'hijacked' } });
  const afterPatch = await call(M, 'GET', path, { token: tokenA });
  check('6 cannot modify it', bPatch.status === 404 && (dataOf(afterPatch) as TaskReply).title === 'E2E task of A',
    `PATCH -> ${String(bPatch.status)}, title unchanged`);
  const bDelete = await call(M, 'DELETE', path, { token: tokenB });
  const afterDelete = await call(M, 'GET', path, { token: tokenA });
  check('7 cannot delete it', bDelete.status === 404 && afterDelete.status === 200,
    `DELETE -> ${String(bDelete.status)}, A still gets ${String(afterDelete.status)}`);

  // 8 invalid input
  const invalid = [
    await call(M, 'POST', '/api/auth/register', { body: { name: 'X', email: 'not-an-email', password: 'short' } }),
    await call(M, 'POST', '/api/tasks', { token: tokenA, body: { title: '   ' } }),
    await call(M, 'POST', '/api/tasks', { token: tokenA, body: { title: 'ok', status: 'bogus' } }),
    await call(M, 'PATCH', path, { token: tokenA, body: { due_date: '2026-02-31' } }),
    await call(M, 'GET', '/api/tasks?limit=1000', { token: tokenA }),
    await call(M, 'GET', '/api/tasks/not-a-uuid', { token: tokenA }),
  ];
  check('8 invalid input is rejected', invalid.every((r) => r.status === 400),
    invalid.map((r) => `${String(r.status)} ${errorCode(r) ?? ''}`).join(', '));

  // 9 SQL injection strings are treated as plain data. A has one task, and none of these strings
  // appear in it, so any result other than 0 rows would mean the string changed the query.
  const injections = [
    await call(M, 'GET', `/api/tasks?search=${encodeURIComponent("' OR 1=1 --")}`, { token: tokenA }),
    await call(M, 'GET', `/api/tasks?search=${encodeURIComponent('%')}`, { token: tokenA }),
    await call(M, 'GET', `/api/tasks?search=${encodeURIComponent("x'); DROP TABLE tasks; --")}`, { token: tokenA }),
  ];
  const badSort = await call(M, 'GET', `/api/tasks?sort=${encodeURIComponent('title; DROP TABLE tasks')}`, { token: tokenA });
  const badLogin = await call(M, 'POST', '/api/auth/login', { body: { email: emailA, password: "' OR '1'='1" } });
  const stillThere = await call(M, 'GET', '/api/tasks', { token: tokenA });
  check('9 SQL injection strings cannot change query behavior',
    injections.every((r) => r.status === 200 && totalOf(r) === 0) && badSort.status === 400 && badLogin.status === 401
      && stillThere.status === 200 && totalOf(stillThere) === 1,
    `searches -> 0 rows each, sort -> ${String(badSort.status)}, login -> ${String(badLogin.status)}, A still has 1 task`);

}

/** Checks 13 and 16 use server 2 only, so they also run when the test database is unavailable. */
async function checkBrokenDatabaseServer(secret: string): Promise<void> {
  const B = BROKEN_DB_PORT;

  // 13 database failure: safe, generic error; nothing internal leaks.
  // A validly signed token gets past authentication, so the request reaches the database.
  const token = jwt.sign({}, secret, { subject: '00000000-0000-4000-8000-000000000000', algorithm: 'HS256', expiresIn: 60 });
  const health = await call(B, 'GET', '/api/health');
  const dbFail = await call(B, 'GET', '/api/tasks', { token });
  const leaks = /10\.255|ECONN|ETIMEDOUT|timeout|postgres|select|stack/i.test(dbFail.text);
  check('13 a simulated database failure returns a safe generic error',
    health.status === 503 && dbFail.status === 500 && errorCode(dbFail) === 'INTERNAL_ERROR' && !leaks,
    `health -> ${String(health.status)}, GET /tasks -> ${String(dbFail.status)} ${dbFail.text}`);

  // 16 rate limiting (server 2, limit 3): requests are counted before validation or the database
  const attempts: number[] = [];
  for (let i = 0; i < 4; i++) attempts.push((await call(B, 'POST', '/api/auth/login', { body: {} })).status);
  const limited = await call(B, 'POST', '/api/auth/login', { body: {} });
  check('16 rate limiting returns 429',
    attempts.slice(0, 3).every((s) => s === 400) && attempts[3] === 429 && limited.headers.has('retry-after')
      && errorCode(limited) === 'RATE_LIMITED',
    `statuses ${attempts.join(', ')}, Retry-After ${limited.headers.get('retry-after') ?? 'missing'}`);
}

const testUrl = testDatabaseUrl(); // throws if missing or the same database as DATABASE_URL
const main = startServer(MAIN_PORT, { DATABASE_URL: testUrl, DATABASE_SSL: testDatabaseSsl(), AUTH_RATE_LIMIT_MAX: '1000' });
const broken = startServer(BROKEN_DB_PORT, { DATABASE_URL: UNREACHABLE_DB, DATABASE_SSL: 'false', AUTH_RATE_LIMIT_MAX: '3' });
const createdUserIds: string[] = [];
// Read in memory only (to sign test tokens); never printed.
const secret = process.env.JWT_SECRET ?? '';
try {
  await Promise.all([waitUntilListening(MAIN_PORT), waitUntilListening(BROKEN_DB_PORT)]);
  await checkBrokenDatabaseServer(secret);
  await run(secret, createdUserIds);
} catch (err) {
  failures++;
  console.log(`FAIL  stopped early: ${err instanceof Error ? err.message : String(err)}`);
} finally {
  main.kill();
  broken.kill();
  if (createdUserIds.length > 0) {
    // Tasks are deleted with their user (ON DELETE CASCADE in db/schema.sql).
    const client = new pg.Client({ connectionString: testUrl, ssl: testDatabaseSsl() === 'true' ? { rejectUnauthorized: false } : false });
    await client.connect();
    await client.query('DELETE FROM users WHERE id = ANY($1::uuid[])', [createdUserIds]);
    await client.end();
  }
}
console.log(failures === 0 ? '\nAll end-to-end checks passed.' : `\n${String(failures)} check(s) failed.`);
process.exit(failures === 0 ? 0 : 1);
