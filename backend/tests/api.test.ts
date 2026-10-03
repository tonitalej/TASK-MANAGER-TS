// Run:  npm test   (needs TEST_DATABASE_URL with db/schema.sql applied: npm run db:test:setup)
// Self-contained: users are created through the API and only those users are deleted afterwards.
import './setup-env.js'; // MUST stay the first import
import { test, before, after, describe } from 'node:test';
import assert from 'node:assert/strict';
import jwt from 'jsonwebtoken';
import { db } from '../src/config/db.js';
import { call, PASSWORD, registerUser, startServer, stopServer, trackUser, uniqueEmail, type TestUser } from './helpers.js';

const SECRET = process.env.JWT_SECRET ?? '';
const GHOST_ID = '99999999-9999-4999-8999-999999999999';
let A: TestUser; // the main user in these tests
let B: TestUser; // "someone else": A must never see or change B's data
let bTaskId: string;

before(async () => {
  await startServer();
  A = await registerUser('Alice');
  B = await registerUser('Bob');
  const r = await call('POST', '/api/tasks', { token: B.token, body: { title: 'Bob private task', description: 'secret plans' } });
  bTaskId = r.json.data.id;
});
after(stopServer);

/** Creates a task for A and returns its id. */
async function createTask(body: Record<string, unknown>, token = A.token): Promise<string> {
  const r = await call('POST', '/api/tasks', { token, body });
  assert.equal(r.status, 201, JSON.stringify(r.json));
  return r.json.data.id;
}

describe('health', () => {
  test('200 { status: ok } when the database answers', async () => {
    const r = await call('GET', '/api/health');
    assert.equal(r.status, 200);
    assert.deepEqual(r.json, { status: 'ok' });
  });

  test('503 { status: unavailable } with no detail when the database fails', async () => {
    const original = db.query;
    db.query = () => Promise.reject(new Error('connect ECONNREFUSED 10.0.0.5:5432'));
    try {
      const r = await call('GET', '/api/health');
      assert.equal(r.status, 503);
      assert.deepEqual(r.json, { status: 'unavailable' });
    } finally {
      db.query = original;
    }
  });
});

describe('register', () => {
  const email = uniqueEmail();

  test('creates a user, returns a token, never returns the hash', async () => {
    const r = await call('POST', '/api/auth/register', { body: { name: 'Reg User', email, password: PASSWORD } });
    assert.equal(r.status, 201);
    trackUser(r.json.data.user.id);
    assert.ok(r.json.data.token);
    assert.equal(r.json.data.user.email, email);
    assert.equal(r.json.data.user.password_hash, undefined);
    assert.ok(!JSON.stringify(r.json).includes('$2b$'), 'no bcrypt hash anywhere in the response');
  });

  test('stores a bcrypt hash, not the password', async () => {
    const { rows } = await db.query<{ password_hash: string }>('SELECT password_hash FROM users WHERE email = $1', [email]);
    assert.ok(rows[0]);
    assert.match(rows[0].password_hash, /^\$2[aby]\$\d\d\$/);
    assert.notEqual(rows[0].password_hash, PASSWORD);
  });

  test('duplicate email -> 409 EMAIL_TAKEN', async () => {
    const r = await call('POST', '/api/auth/register', { body: { name: 'Again', email, password: PASSWORD } });
    assert.equal(r.status, 409);
    assert.equal(r.json.error.code, 'EMAIL_TAKEN');
  });

  test('duplicate email with different letter case -> 409 (emails are stored lowercase)', async () => {
    const r = await call('POST', '/api/auth/register', { body: { name: 'Again', email: email.toUpperCase(), password: PASSWORD } });
    assert.equal(r.status, 409);
  });

  test('invalid input -> 400 VALIDATION_ERROR with a list of field errors', async () => {
    const r = await call('POST', '/api/auth/register', { body: { name: 'A', email: 'nope', password: 'short' } });
    assert.equal(r.status, 400);
    assert.equal(r.json.error.code, 'VALIDATION_ERROR');
    assert.deepEqual(r.json.error.details.map((d: { field: string }) => d.field).sort(), ['email', 'name', 'password']);
  });

  test('password without a digit, and password over 72 bytes -> 400', async () => {
    for (const password of ['onlyletters', `a1${'x'.repeat(71)}`]) {
      const r = await call('POST', '/api/auth/register', { body: { name: 'Pat', email: uniqueEmail(), password } });
      assert.equal(r.status, 400, password.slice(0, 15));
    }
  });

  test('malformed JSON -> 400 INVALID_JSON', async () => {
    const r = await call('POST', '/api/auth/register', { raw: '{"name": ' });
    assert.equal(r.status, 400);
    assert.equal(r.json.error.code, 'INVALID_JSON');
  });

  test('body over 10kb -> 413', async () => {
    const r = await call('POST', '/api/auth/register', { body: { name: 'x'.repeat(20_000) } });
    assert.equal(r.status, 413);
    assert.equal(r.json.error.code, 'PAYLOAD_TOO_LARGE');
  });
});

describe('login', () => {
  test('correct credentials -> token, no hash in the response', async () => {
    const r = await call('POST', '/api/auth/login', { body: { email: A.email, password: PASSWORD } });
    assert.equal(r.status, 200);
    assert.ok(r.json.data.token);
    assert.equal(r.json.data.user.id, A.id);
    assert.equal(r.json.data.user.password_hash, undefined);
  });

  test('email is case-insensitive at login', async () => {
    const r = await call('POST', '/api/auth/login', { body: { email: A.email.toUpperCase(), password: PASSWORD } });
    assert.equal(r.status, 200);
  });

  test('wrong password and unknown email give the SAME 401 response', async () => {
    const wrong = await call('POST', '/api/auth/login', { body: { email: A.email, password: 'Wrong12345' } });
    const unknown = await call('POST', '/api/auth/login', { body: { email: uniqueEmail(), password: PASSWORD } });
    assert.equal(wrong.status, 401);
    assert.equal(unknown.status, 401);
    assert.deepEqual(wrong.json, unknown.json);
  });

  test('GET /me returns the current user without the hash', async () => {
    const r = await call('GET', '/api/auth/me', { token: A.token });
    assert.equal(r.status, 200);
    assert.equal(r.json.data.user.email, A.email);
    assert.equal(r.json.data.user.password_hash, undefined);
  });

  test('the token payload carries only sub, iat and exp', () => {
    const payload = jwt.decode(A.token) as Record<string, unknown>;
    assert.deepEqual(Object.keys(payload).sort(), ['exp', 'iat', 'sub']);
    assert.equal(payload.sub, A.id);
  });
});

describe('authentication failures -> 401', () => {
  const tasks = (token?: string, headers?: Record<string, string>) => call('GET', '/api/tasks', { token, headers });

  test('no token', async () => { assert.equal((await tasks()).status, 401); });
  test('malformed Authorization header', async () => {
    for (const value of ['Token abc', 'Bearer', 'bearer abc', A.token]) {
      assert.equal((await tasks(undefined, { Authorization: value })).status, 401, value.slice(0, 12));
    }
  });
  test('garbage token', async () => { assert.equal((await tasks('abc.def.ghi')).status, 401); });
  test('token signed with another secret', async () => {
    const forged = jwt.sign({}, 'some-other-secret-some-other-secret', { subject: A.id });
    assert.equal((await tasks(forged)).status, 401);
  });
  test('"alg: none" token', async () => {
    const b64 = (o: object) => Buffer.from(JSON.stringify(o)).toString('base64url');
    const none = `${b64({ alg: 'none', typ: 'JWT' })}.${b64({ sub: A.id })}.`;
    assert.equal((await tasks(none)).status, 401);
  });
  test('expired token -> "Token expired"', async () => {
    const expired = jwt.sign({}, SECRET, { subject: A.id, expiresIn: -10, algorithm: 'HS256' });
    const r = await tasks(expired);
    assert.equal(r.status, 401);
    assert.equal(r.json.error.message, 'Token expired');
  });
  test('valid signature but no "sub" claim', async () => {
    const noSub = jwt.sign({ foo: 'bar' }, SECRET, { algorithm: 'HS256' });
    assert.equal((await tasks(noSub)).status, 401);
  });
});

describe('task CRUD (own tasks)', () => {
  let id = '';

  test('POST creates a task with defaults and a trimmed title', async () => {
    const r = await call('POST', '/api/tasks', { token: A.token, body: { title: '  Write tests  ' } });
    assert.equal(r.status, 201);
    id = r.json.data.id;
    assert.equal(r.json.data.title, 'Write tests');
    assert.equal(r.json.data.status, 'todo');
    assert.equal(r.json.data.priority, 'medium');
    assert.equal(r.json.data.user_id, A.id);
  });

  test('POST ignores a user_id sent by the client (mass assignment)', async () => {
    const r = await call('POST', '/api/tasks', { token: A.token, body: { title: 'Sneaky', user_id: B.id } });
    assert.equal(r.status, 201);
    assert.equal(r.json.data.user_id, A.id);
  });

  test('POST with status done sets completed_at', async () => {
    const r = await call('POST', '/api/tasks', { token: A.token, body: { title: 'Already done', status: 'done' } });
    assert.ok(r.json.data.completed_at);
  });

  test('POST invalid body -> 400 VALIDATION_ERROR', async () => {
    const bodies = [{}, { title: '' }, { title: '   ' }, { title: 'x', status: 'finished' }, { title: 'x', priority: 'urgent' },
      { title: 'x', due_date: '2026-02-31' }, { title: 'x', due_date: '15/03/2026' }, { title: 'x'.repeat(201) },
      { title: 'x', description: 42 }, { title: 123 }, []];
    for (const body of bodies) {
      const r = await call('POST', '/api/tasks', { token: A.token, body });
      assert.equal(r.status, 400, JSON.stringify(body).slice(0, 60));
      assert.equal(r.json.error.code, 'VALIDATION_ERROR');
    }
  });

  test('due_date round-trips as the exact YYYY-MM-DD string (no time zone shift)', async () => {
    const r = await call('POST', '/api/tasks', { token: A.token, body: { title: 'Date check', due_date: '2026-03-15' } });
    assert.equal(r.json.data.due_date, '2026-03-15');
  });

  test('GET one', async () => {
    const r = await call('GET', `/api/tasks/${id}`, { token: A.token });
    assert.equal(r.status, 200);
    assert.equal(r.json.data.id, id);
  });

  test('PATCH status=done sets completed_at; moving back clears it', async () => {
    const done = await call('PATCH', `/api/tasks/${id}`, { token: A.token, body: { status: 'done' } });
    assert.equal(done.status, 200);
    assert.ok(done.json.data.completed_at);
    const back = await call('PATCH', `/api/tasks/${id}`, { token: A.token, body: { status: 'in_progress' } });
    assert.equal(back.json.data.completed_at, null);
  });

  test('PATCH only changes the fields sent', async () => {
    const r = await call('PATCH', `/api/tasks/${id}`, { token: A.token, body: { priority: 'high', description: null } });
    assert.equal(r.json.data.priority, 'high');
    assert.equal(r.json.data.title, 'Write tests');
    assert.equal(r.json.data.status, 'in_progress');
  });

  test('PATCH empty or invalid body -> 400', async () => {
    for (const body of [{}, { title: '' }, { status: 'nope' }, { due_date: 'tomorrow' }, { unknown_field: 1 }]) {
      assert.equal((await call('PATCH', `/api/tasks/${id}`, { token: A.token, body })).status, 400, JSON.stringify(body));
    }
  });

  test('DELETE -> 204 with no body, then GET -> 404', async () => {
    const del = await call('DELETE', `/api/tasks/${id}`, { token: A.token });
    assert.equal(del.status, 204);
    assert.equal(del.json, null);
    assert.equal((await call('GET', `/api/tasks/${id}`, { token: A.token })).status, 404);
  });
});

describe('malformed vs nonexistent ids', () => {
  test('malformed id -> 400 on GET, PATCH and DELETE', async () => {
    for (const bad of ['abc', '123', 'not-a-uuid']) {
      assert.equal((await call('GET', `/api/tasks/${bad}`, { token: A.token })).status, 400, bad);
      assert.equal((await call('PATCH', `/api/tasks/${bad}`, { token: A.token, body: { title: 'x' } })).status, 400, bad);
      assert.equal((await call('DELETE', `/api/tasks/${bad}`, { token: A.token })).status, 400, bad);
    }
  });
  test('valid-format id that does not exist -> 404 TASK_NOT_FOUND on GET, PATCH and DELETE', async () => {
    const get = await call('GET', `/api/tasks/${GHOST_ID}`, { token: A.token });
    assert.equal(get.status, 404);
    assert.equal(get.json.error.code, 'TASK_NOT_FOUND');
    assert.equal((await call('PATCH', `/api/tasks/${GHOST_ID}`, { token: A.token, body: { title: 'x' } })).status, 404);
    assert.equal((await call('DELETE', `/api/tasks/${GHOST_ID}`, { token: A.token })).status, 404);
  });
  test('unknown route -> 404 ROUTE_NOT_FOUND', async () => {
    const r = await call('GET', '/api/nope');
    assert.equal(r.status, 404);
    assert.equal(r.json.error.code, 'ROUTE_NOT_FOUND');
  });
});

describe('authorization: A vs B (404, not 403, so existence is not revealed)', () => {
  const bView = async () => (await call('GET', `/api/tasks/${bTaskId}`, { token: B.token })).json.data;

  test("A cannot read B's task", async () => {
    const r = await call('GET', `/api/tasks/${bTaskId}`, { token: A.token });
    assert.equal(r.status, 404);
    assert.equal(r.json.error.code, 'TASK_NOT_FOUND'); // identical to a task that does not exist
  });

  test("A cannot update B's task, and it is unchanged afterwards", async () => {
    const before = await bView();
    const r = await call('PATCH', `/api/tasks/${bTaskId}`, { token: A.token, body: { title: 'hacked', status: 'done' } });
    assert.equal(r.status, 404);
    assert.deepEqual(await bView(), before); // same title, status AND updated_at
  });

  test("A cannot delete B's task, and it still exists", async () => {
    assert.equal((await call('DELETE', `/api/tasks/${bTaskId}`, { token: A.token })).status, 404);
    assert.equal((await call('GET', `/api/tasks/${bTaskId}`, { token: B.token })).status, 200);
  });

  test("A's list and search never include B's tasks", async () => {
    const list = await call('GET', '/api/tasks?limit=100', { token: A.token });
    assert.ok(list.json.data.every((t: { user_id: string }) => t.user_id === A.id));
    const search = await call('GET', '/api/tasks?search=Bob%20private', { token: A.token });
    assert.equal(search.json.data.length, 0);
  });

  test('B can access their own task', async () => {
    assert.equal((await call('GET', `/api/tasks/${bTaskId}`, { token: B.token })).status, 200);
  });
});

describe('list: filter, search, sort, pagination', () => {
  // A fresh user so the expected results are exact.
  let C: TestUser;
  const titles = (r: { json: { data: { title: string }[] } }) => r.json.data.map((t) => t.title);
  const list = (qs: string) => call('GET', `/api/tasks?${qs}`, { token: C.token });

  before(async () => {
    C = await registerUser('Carol');
    // created in this order, so default sort (created_at desc) is the reverse
    await createTask({ title: 'Banana', priority: 'low', status: 'todo', due_date: '2026-05-01' }, C.token);
    await createTask({ title: 'apple', priority: 'high', status: 'done' }, C.token);
    await createTask({ title: 'Cherry', priority: 'medium', status: 'in_progress', due_date: '2026-04-01', description: 'Contains 100% juice' }, C.token);
    await createTask({ title: '100 percent', priority: 'low', status: 'todo' }, C.token);
    await createTask({ title: 'snake_case', priority: 'medium', status: 'todo' }, C.token);
    await createTask({ title: 'snakeXcase', priority: 'medium', status: 'todo' }, C.token);
  });

  test('default: newest first, meta { total, limit, offset }', async () => {
    const r = await list('');
    assert.equal(r.status, 200);
    assert.deepEqual(titles(r), ['snakeXcase', 'snake_case', '100 percent', 'Cherry', 'apple', 'Banana']);
    assert.deepEqual(r.json.meta, { total: 6, limit: 50, offset: 0 });
  });

  test('filter by status and priority', async () => {
    assert.deepEqual(titles(await list('status=done')), ['apple']);
    assert.deepEqual(titles(await list('status=todo&priority=low')), ['100 percent', 'Banana']);
  });

  test('pagination: limit and offset, total stays the full count', async () => {
    const r = await list('limit=2&offset=2');
    assert.deepEqual(titles(r), ['100 percent', 'Cherry']);
    assert.deepEqual(r.json.meta, { total: 6, limit: 2, offset: 2 });
    assert.deepEqual(titles(await list('offset=100')), []);
  });

  test('search is case-insensitive and looks in title and description', async () => {
    assert.deepEqual(titles(await list('search=APPLE')), ['apple']);
    assert.deepEqual(titles(await list('search=juice')), ['Cherry']);
  });

  test('% and _ in the search text are literal characters, not wildcards', async () => {
    assert.deepEqual(titles(await list(`search=${encodeURIComponent('100%')}`)), ['Cherry']); // not "100 percent"
    assert.deepEqual(titles(await list('search=snake_case')), ['snake_case']);              // not "snakeXcase"
    assert.deepEqual(titles(await list(`search=${encodeURIComponent('%')}`)), ['Cherry']);   // NOT every task
  });

  test('search combined with a filter and the total', async () => {
    const r = await list('search=snake&status=todo&limit=1');
    assert.equal(r.json.data.length, 1);
    assert.equal(r.json.meta.total, 2);
  });

  test('sort by title (case-insensitive) asc and desc', async () => {
    assert.deepEqual(titles(await list('sort=title&order=asc')), ['100 percent', 'apple', 'Banana', 'Cherry', 'snake_case', 'snakeXcase']);
    assert.deepEqual(titles(await list('sort=title&order=desc')).at(0), 'snakeXcase');
  });

  test('sort by due_date puts tasks without a due date LAST in both directions', async () => {
    const asc = titles(await list('sort=due_date&order=asc'));
    assert.deepEqual(asc.slice(0, 2), ['Cherry', 'Banana']);
    const desc = titles(await list('sort=due_date&order=desc'));
    assert.deepEqual(desc.slice(0, 2), ['Banana', 'Cherry']);
  });

  test('sort by priority and status uses their logical order, not alphabetical', async () => {
    const byPriority = (await list('sort=priority&order=asc')).json.data.map((t: { priority: string }) => t.priority);
    assert.deepEqual(byPriority, ['low', 'low', 'medium', 'medium', 'medium', 'high']);
    const byStatus = (await list('sort=status&order=desc')).json.data.map((t: { status: string }) => t.status);
    assert.deepEqual(byStatus.slice(0, 2), ['done', 'in_progress']);
  });

  test('invalid query values -> 400', async () => {
    for (const qs of ['status=nope', 'priority=urgent', 'sort=password_hash', 'sort=created_at;DROP TABLE tasks', 'order=sideways',
      'limit=0', 'limit=9999', 'offset=-1', 'offset=1e20', 'search=', `search=${'x'.repeat(101)}`, 'status=todo&status=done']) {
      const r = await list(qs);
      assert.equal(r.status, 400, qs);
      assert.equal(r.json.error.code, 'VALIDATION_ERROR');
    }
  });
});

describe('SQL injection attempts change nothing', () => {
  test("login: ' OR '1'='1 as email is rejected by validation", async () => {
    const r = await call('POST', '/api/auth/login', { body: { email: "' OR '1'='1", password: 'x' } });
    assert.equal(r.status, 400);
  });
  test('login: injection in the password with a real email still fails (401)', async () => {
    const r = await call('POST', '/api/auth/login', { body: { email: A.email, password: "' OR 1=1 --" } });
    assert.equal(r.status, 401);
  });
  test('login: injection hidden inside a syntactically valid email is just a string (401)', async () => {
    const r = await call('POST', '/api/auth/login', { body: { email: "x'--@example.com", password: PASSWORD } });
    assert.equal(r.status, 401);
  });
  test('path param: "1; DROP TABLE tasks;--" -> 400', async () => {
    const r = await call('GET', `/api/tasks/${encodeURIComponent('1; DROP TABLE tasks;--')}`, { token: A.token });
    assert.equal(r.status, 400);
  });
  test("query: status=todo' OR '1'='1 -> 400", async () => {
    const r = await call('GET', `/api/tasks?status=${encodeURIComponent("todo' OR '1'='1")}`, { token: A.token });
    assert.equal(r.status, 400);
  });
  test("query: search=' OR '1'='1 matches nothing instead of everything", async () => {
    const r = await call('GET', `/api/tasks?search=${encodeURIComponent("' OR '1'='1")}`, { token: A.token });
    assert.equal(r.status, 200);
    assert.equal(r.json.data.length, 0);
  });
  test('body: a malicious title is stored as harmless text and the tables survive', async () => {
    const evil = "'); DROP TABLE tasks; --";
    const r = await call('POST', '/api/tasks', { token: A.token, body: { title: evil } });
    assert.equal(r.status, 201);
    assert.equal(r.json.data.title, evil);
    const { rows } = await db.query<{ t: string | null }>("SELECT to_regclass('public.tasks') AS t");
    assert.ok(rows[0]?.t);
  });
});

describe('database errors never leak details', () => {
  test('a failing database gives a generic 500', async () => {
    const original = db.query;
    db.query = () => Promise.reject(new Error('connection to server at "10.0.0.5" failed: password=SECRET'));
    try {
      const r = await call('GET', '/api/tasks', { token: A.token });
      assert.equal(r.status, 500);
      assert.deepEqual(r.json, { error: { code: 'INTERNAL_ERROR', message: 'Something went wrong' } });
      assert.ok(!JSON.stringify(r.json).includes('SECRET'));
    } finally {
      db.query = original;
    }
  });

  test('token for a deleted user: the FK violation is mapped to a clean 409, /me gives 401', async () => {
    const temp = await registerUser('Temp');
    await db.query('DELETE FROM users WHERE id = $1', [temp.id]);
    const r = await call('POST', '/api/tasks', { token: temp.token, body: { title: 'orphan?' } });
    assert.equal(r.status, 409);
    assert.equal(r.json.error.code, 'REFERENCE_ERROR');
    assert.equal((await call('GET', '/api/auth/me', { token: temp.token })).status, 401);
  });
});

describe('CORS', () => {
  test('a listed origin is allowed, an unknown origin gets no CORS header', async () => {
    const ok = await call('GET', '/api/health', { headers: { Origin: 'http://localhost:5173' } });
    assert.equal(ok.headers.get('access-control-allow-origin'), 'http://localhost:5173');
    const evil = await call('GET', '/api/health', { headers: { Origin: 'https://evil.example' } });
    assert.equal(evil.headers.get('access-control-allow-origin'), null);
  });
});
