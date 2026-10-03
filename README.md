# Task Manager

A small multi-user task manager: each user registers, logs in, and manages **their own** tasks
(create, edit, delete, search, filter, sort, paginate).

- **Backend:** Node 20+, Express 5, TypeScript (ES modules), `pg`, JWT, bcrypt.
- **Frontend:** React 19 + Vite + TypeScript, React Router.
- **Database:** PostgreSQL (hosted on Supabase, or local).

## Architecture

```
Browser: React app (frontend/)
   |  fetch  /api/...  with  Authorization: Bearer <JWT>
   v
Express API (backend/src)
   app.ts            request id + logging -> helmet -> CORS allow-list -> JSON body (10 kB max)
   routes/           URL -> middleware chain (auth routes also have a rate limiter)
   middleware/       authenticate (JWT) -> validate (input) -> ... -> errorHandler
   controllers/      HTTP in / HTTP out only
   services/         business rules (hashing, tokens, "not found")
   repositories/     the ONLY place with SQL (parameterized)
   |  pg connection pool
   v
PostgreSQL on Supabase (db/schema.sql: users, tasks)
```

Folder map:

```
db/schema.sql                  the database schema (tables, constraints, triggers)
db/seed.sql                    demo users with KNOWN passwords: local development only (see warning below)
supabase/express_mode_lockdown.sql   run once in the Supabase project (see "Database")
backend/
  src/config/                  env.ts (validates every variable), db.ts (pool), logger.ts (pino)
  src/middleware/              auth, validate, rateLimit, requestLogger, errorHandler
  src/validators/              hand-written input rules
  scripts/                     test-db guard, db:test:setup, start:testdb, e2e-check
  tests/                       API tests (node:test), run against the TEST database
frontend/
  src/api/                     client.ts (the one place that calls fetch), auth.ts, tasks.ts
  src/context/AuthContext.tsx  who is logged in; restores the session on reload
  src/pages/ src/components/   screens and building blocks
  tests/                       vitest + Testing Library
docs/optional-supabase-direct-mode/   an earlier variant that talked to Supabase directly (not used)
```

## Setup

You need Node 20 or newer and a PostgreSQL database (a Supabase project works).

```bash
# Backend
cd backend
cp .env.example .env      # then fill in the values (see "Environment variables")
npm install

# Frontend
cd ../frontend
cp .env.example .env      # optional: only needed in production builds
npm install
```

Create a JWT secret without printing it on screen (run in `backend/`):

```bash
node -e "require('fs').appendFileSync('.env', 'JWT_SECRET=' + require('crypto').randomBytes(48).toString('hex') + '\n')"
```

## Environment variables

Names and meaning only. Real values live in `.env` files, which are git-ignored. **Never commit them.**
The backend checks every variable at startup and refuses to start if one is missing or invalid
(it prints the variable name, never the value).

**backend/.env**

| Name | Meaning |
|---|---|
| `NODE_ENV` | `development`, `test` or `production` |
| `PORT` | port the API listens on |
| `DATABASE_URL` | PostgreSQL connection string of the real database |
| `DATABASE_SSL` | `true` for Supabase, `false` for local PostgreSQL |
| `TEST_DATABASE_URL` | a SEPARATE database for tests (must not be the same database as `DATABASE_URL`) |
| `TEST_DATABASE_SSL` | optional, defaults to `DATABASE_SSL` |
| `JWT_SECRET` | secret for signing tokens; at least 32 characters in production |
| `JWT_EXPIRES_IN` | token lifetime, e.g. `1h` or `15m` (keep it short) |
| `BCRYPT_ROUNDS` | bcrypt cost, 10-14 |
| `CORS_ORIGIN` | comma-separated list of frontend origins allowed to call the API |
| `LOG_LEVEL` | `fatal`, `error`, `warn`, `info`, `debug`, `trace` or `silent` |
| `AUTH_RATE_LIMIT_MAX` | max login/register requests per IP per window (default 10) |
| `AUTH_RATE_LIMIT_WINDOW_MS` | rate-limit window in milliseconds (default 900000 = 15 min) |

**frontend/.env**

| Name | Meaning |
|---|---|
| `VITE_API_URL` | base URL of the API in production, e.g. `https://api.example.com`. Leave empty in development. **Public**: it is compiled into the JavaScript, so never put a secret in any `VITE_` variable. |

## Database

The app uses the existing `db/schema.sql` unchanged:

- `users`: `id` (UUID), `name`, `email` (UNIQUE), `password_hash`, `role`, `created_at`.
- `tasks`: `id`, `user_id` (references `users`, `ON DELETE CASCADE`), `title`, `description`,
  `status` (`todo` / `in_progress` / `done`), `priority` (`low` / `medium` / `high`), `due_date`,
  `completed_at`, `created_at`, `updated_at`. CHECK constraints and triggers back up the API's validation.

Apply it once to an empty database (Supabase: SQL Editor, paste and run `db/schema.sql`).

> **Never run `db/seed.sql` against a production database.** It creates demo users whose passwords are
> written in the file (and in this repository's history), so anyone could log in as them.
> If it was run in production, delete those users (`tony@example.com`, `sarah@example.com`, `admin@example.com`).

**On Supabase, also run `supabase/express_mode_lockdown.sql`** (SQL Editor). Supabase automatically
exposes every table in the `public` schema through its own REST API, reachable with the project's public
key. Without row-level security (RLS), anyone could read the `users` table, password hashes included,
directly, without going through Express. The script turns RLS on with no policies (deny everything)
and revokes access for Supabase's `anon` and `authenticated` roles.

The Express server must connect with the **database owner role** (`postgres`, the connection string from
Supabase's "Connect" dialog). That role bypasses RLS, which is what we want: the API enforces "only
your own tasks" itself, in every SQL query (see "Security"). Keep that connection string secret: it has full access.

### Test database

Tests create and delete rows, so they **never** use `DATABASE_URL`. They use `TEST_DATABASE_URL` and refuse
to start if it is missing or points at the same database (`backend/scripts/test-db.ts`).
Use a second free Supabase project or a local database, then:

```bash
cd backend
npm run db:test:setup     # applies db/schema.sql to the TEST database (resets it; never runs seed.sql)
npm test
```

## Commands

**Development** (two terminals):

```bash
cd backend  && npm run dev     # http://localhost:3000, restarts on save
cd frontend && npm run dev     # http://localhost:5173, proxies /api to :3000 (no CORS setup needed)
```

**Checks:**

| | backend | frontend |
|---|---|---|
| type-check | `npm run typecheck` | `npm run typecheck` |
| lint | `npm run lint` | `npm run lint` |
| tests | `npm test` (needs `TEST_DATABASE_URL`) | `npm test` |
| build | `npm run build` (-> `dist/`) | `npm run build` (-> `dist/`) |

Backend extras:
- `npm run start:testdb`: runs the compiled server against the TEST database (for the frontend's real-backend click-through test, `frontend/tests/express-ui.test.tsx`, which is skipped when no backend answers on :3000).
- `npm run e2e:check`: builds nothing; run `npm run build` first. Starts the compiled server against the TEST database and checks register, login, token handling, cross-user access, validation, SQL injection, database failure and rate limiting with real HTTP requests. Prints PASS/FAIL per check.

**Production:**

```bash
cd backend
npm ci && npm run build
NODE_ENV=production npm start          # node dist/server.js (the compiled JavaScript)

cd frontend
npm ci
VITE_API_URL=https://api.example.com npm run build    # static files in frontend/dist/
```

When the frontend is served from a different origin than the API, add the frontend's origin
(e.g. `https://app.example.com`) to `CORS_ORIGIN` in the backend, or the browser will block the requests.

## API reference

Base path `/api`. Bodies are JSON. Successful responses are `{ "data": ... }` (lists add `"meta"`);
errors are `{ "error": { "code", "message", "details"? } }`. Task endpoints and `/auth/me` need
`Authorization: Bearer <token>`.

Status codes used: `200`, `201`, `204` (delete), `400 VALIDATION_ERROR` (and `INVALID_JSON`),
`401` (not logged in / bad token), `404` (no such task **or someone else's task**), `409` (email taken),
`413` (body over 10 kB), `429` (rate limited), `500` (generic, no internals), `503` (health: database down).

Errors you can get from any task endpoint:

```json
401 { "error": { "code": "UNAUTHORIZED", "message": "Missing or malformed Authorization header" } }
401 { "error": { "code": "INVALID_TOKEN", "message": "Token expired" } }        // or "Invalid token"
500 { "error": { "code": "INTERNAL_ERROR", "message": "Something went wrong" } }
```

### `GET /api/health`

```json
200 { "status": "ok" }
503 { "status": "unavailable" }      // the database did not answer
```

### `POST /api/auth/register`

Rate limited. `name` 2-100 characters; `email` valid, at most 255; `password` 8-72 characters (bytes) with at least one letter and one number.

```json
// request
{ "name": "Ada Lovelace", "email": "ada@example.com", "password": "Secret1234" }

// 201
{ "data": {
    "user": { "id": "7c1e...", "name": "Ada Lovelace", "email": "ada@example.com", "role": "user", "created_at": "2026-10-02T10:00:00.000Z" },
    "token": "eyJhbGciOiJIUzI1NiIs..." } }

// 400
{ "error": { "code": "VALIDATION_ERROR", "message": "Invalid input",
    "details": [ { "field": "password", "message": "Must contain at least one letter and one number" } ] } }

// 409
{ "error": { "code": "EMAIL_TAKEN", "message": "Email is already registered" } }

// 429 (also sends a Retry-After header, in seconds)
{ "error": { "code": "RATE_LIMITED", "message": "Too many attempts. Please try again later." } }
```

### `POST /api/auth/login`

Rate limited.

```json
// request
{ "email": "ada@example.com", "password": "Secret1234" }

// 200: same shape as register
// 401: same message whether the email exists or not
{ "error": { "code": "INVALID_CREDENTIALS", "message": "Invalid email or password" } }
// 400 VALIDATION_ERROR (missing/invalid fields), 429 RATE_LIMITED
```

### `GET /api/auth/me`

```json
200 { "data": { "user": { "id": "7c1e...", "name": "Ada Lovelace", "email": "ada@example.com", "role": "user", "created_at": "..." } } }
401 (see above; also "User no longer exists" if the account was deleted)
```

### `GET /api/tasks`

Only the caller's tasks. Query parameters (all optional):

| Parameter | Values | Default |
|---|---|---|
| `status` | `todo`, `in_progress`, `done` | all |
| `priority` | `low`, `medium`, `high` | all |
| `search` | 1-100 characters; case-insensitive match in title OR description (`%` and `_` are matched literally) | none |
| `sort` | `created_at`, `updated_at`, `due_date`, `title`, `priority`, `status` | `created_at` |
| `order` | `asc`, `desc` | `desc` |
| `limit` | 1-100 | 50 |
| `offset` | integer >= 0 | 0 |

Tasks without a due date are always listed last. `priority` sorts low < medium < high and `status`
todo < in_progress < done. Ties are broken by `id`, so pages never overlap.

```json
// GET /api/tasks?status=todo&search=report&sort=due_date&order=asc&limit=10&offset=0
200 { "data": [
        { "id": "3f2a...", "user_id": "7c1e...", "title": "Write report", "description": null,
          "status": "todo", "priority": "high", "due_date": "2026-10-15", "completed_at": null,
          "created_at": "2026-10-02T10:05:00.000Z", "updated_at": "2026-10-02T10:05:00.000Z" } ],
      "meta": { "total": 1, "limit": 10, "offset": 0 } }

// GET /api/tasks?sort=password_hash
400 { "error": { "code": "VALIDATION_ERROR", "message": "Invalid input",
      "details": [ { "field": "sort", "message": "Must be one of: created_at, updated_at, due_date, title, priority, status" } ] } }
```

### `POST /api/tasks`

`title` required (1-200 characters after trimming). Optional: `description` (text up to 5000 or `null`),
`status`, `priority`, `due_date` (`YYYY-MM-DD`, a real date, or `null`). Unknown fields such as
`user_id` are ignored: the owner always comes from the token.

```json
// request
{ "title": "Write report", "priority": "high", "due_date": "2026-10-15" }

201 { "data": { "id": "3f2a...", "title": "Write report", "status": "todo", "priority": "high", ... } }
400 { "error": { "code": "VALIDATION_ERROR", "message": "Invalid input",
      "details": [ { "field": "title", "message": "Must be 1-200 characters" } ] } }
```

### `GET /api/tasks/:id`

```json
200 { "data": { ...task } }
400 { "error": { "code": "VALIDATION_ERROR", "message": "Invalid input", "details": [ { "field": "id", "message": "Must be a valid UUID" } ] } }
404 { "error": { "code": "TASK_NOT_FOUND", "message": "Task not found" } }    // missing OR another user's
```

### `PATCH /api/tasks/:id`

Any subset of the create fields, at least one. Setting `status` to `done` fills `completed_at`; moving away clears it.

```json
// request
{ "status": "done" }

200 { "data": { ...task, "status": "done", "completed_at": "2026-10-02T11:00:00.000Z" } }
400 { "error": { "code": "VALIDATION_ERROR", "message": "Invalid input",
      "details": [ { "field": "body", "message": "Provide at least one field to update" } ] } }
404 TASK_NOT_FOUND (missing or another user's)
```

### `DELETE /api/tasks/:id`

```
204 No Content
404 TASK_NOT_FOUND (missing or another user's)
```

## Security

- **Passwords:** hashed with bcrypt (salted, cost `BCRYPT_ROUNDS`); the hash never leaves the server.
  bcrypt only uses the first **72 bytes** of a password, so longer passwords are rejected instead of
  being silently truncated. Login takes the same time and gives the same message for an unknown email
  and a wrong password, so it does not reveal which emails are registered.
- **JWT:** signed and verified with **HS256 only** (pinned on both sides, which blocks `alg: none` and
  algorithm-confusion tokens). The payload carries only `sub` (the user id) plus `iat`/`exp`: a JWT is
  readable by anyone who holds it. Tokens expire after `JWT_EXPIRES_IN`. There is no server-side
  revocation: logging out means the browser forgets the token.
- **Authorization in SQL:** every task query includes `AND user_id = $n`, with the id taken from the
  verified token, never from the request. Another user's task therefore looks exactly like a missing
  one, so the API answers **404, not 403**, and does not confirm that the id exists.
- **SQL injection:** all values are passed as parameters (`$1, $2`). The only dynamic SQL is the sort
  column and direction, which come from a hard-coded allowlist (`SORT_SQL` in `task.repository.ts`), never
  from user text. Search text is escaped for `LIKE` so `%` and `_` cannot act as wildcards.
- **Validation:** every body, query and URL parameter is checked by `validators/index.ts` before it
  reaches a controller (unknown fields dropped, types and lengths checked). Database constraints are the backup.
- **CORS:** only the origins listed in `CORS_ORIGIN` may call the API from a browser (no `*`, no cookies).
- **Rate limiting:** `POST /api/auth/login` and `/api/auth/register` allow `AUTH_RATE_LIMIT_MAX` requests
  per IP per window, then answer 429 with `Retry-After`. Behind a proxy in production, `trust proxy` is
  set to 1 so the real client IP is used.
- **Helmet:** sets security headers (no `X-Powered-By`, `nosniff`, frame protection, etc.).
- **Errors:** clients get a generic message for anything unexpected; details go to the server log only.
- **Logging:** pino writes one line per request with a request id (also returned as `X-Request-Id`).
  Request/response headers and bodies are not logged at all; as a second safety net, the
  `authorization`, `cookie` and `set-cookie` headers and any `password` or `token` field are redacted.
- **Other limits:** JSON bodies over 10 kB are rejected (413); database statements time out after 10 s;
  the server shuts down gracefully on SIGTERM/SIGINT.
- **Token storage trade-off:** the frontend keeps the JWT in `localStorage` so a page reload keeps you
  logged in. Any script running on the page (an XSS bug, or a compromised dependency) could read it.
  We reduce the risk with short token lifetimes and by never rendering user content as HTML (React
  escapes it). The safer alternative is an `httpOnly`, `Secure`, `SameSite` cookie set by the server
  (invisible to JavaScript), which then also needs CSRF protection; it was not done here to keep the app simple.
- **Route guards are UX only:** hiding a page in React protects nothing; the API checks the token on every request.

## Deployment notes

Documentation only; there are no vendor-specific config files.

**API (any Node host):** Node 20+. Build command `npm ci && npm run build` in `backend/`, start command
`npm start`. Set all backend variables in the host's settings (not in a committed file), with
`NODE_ENV=production`, `DATABASE_SSL=true` for Supabase, a fresh `JWT_SECRET` of 32+ characters, and
`CORS_ORIGIN` = the frontend's origin. The host must provide HTTPS. Point its health check at
`GET /api/health`. The app assumes exactly one proxy in front of it (`trust proxy` = 1); adjust
`app.ts` if your host differs, or rate limiting will see the wrong IP.

**Frontend (any static host):** build command `npm ci && npm run build` in `frontend/` with
`VITE_API_URL` set to the API's public URL; publish `frontend/dist/`. Because the app uses
client-side routes (`/tasks/123`), configure the host to serve `index.html` for unknown paths
("SPA fallback"), otherwise reloading such a page gives the host's 404.

## Known limitations

- No refresh tokens, password reset, email verification or account deletion.
- Tokens cannot be revoked before they expire (logout only forgets the token in the browser).
- The JWT is in `localStorage` (see the trade-off above).
- The rate limiter keeps its counters in memory: they reset when the server restarts and are not
  shared between several server instances.
- `role` is stored and returned, but no endpoint uses it (there are no admin features).
- No real-time updates: changes made in another tab appear after a reload or filter change.
- The database connection uses TLS without certificate verification (`rejectUnauthorized: false`,
  see `config/db.ts`); supplying Supabase's CA certificate would close that gap.
- Search uses `ILIKE`, which does not use an index for `%term%`; fine for personal task lists, not for millions of rows.

The alternative design that used Supabase Auth and RLS directly from the browser is kept for reference
in `docs/optional-supabase-direct-mode/` and is not part of the running app.
