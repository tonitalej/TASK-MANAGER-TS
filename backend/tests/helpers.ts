// Shared helpers for the API tests. Each test file must import './setup-env.js' FIRST.
import type { Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { randomUUID } from 'node:crypto';
import { app } from '../src/app.js';
import { db } from '../src/config/db.js';

export interface CallOptions { token?: string; body?: unknown; raw?: string; headers?: Record<string, string> }
// `any` is unavoidable here: it is untyped JSON from the API under test, and every value
// a test uses is checked by an assertion. (The unsafe-any lint rules are off for tests/ only.)
// eslint-disable-next-line @typescript-eslint/no-explicit-any -- see the comment above
export interface ApiResult { status: number; headers: Headers; json: any }

let server: Server | undefined;
let base = '';
const createdUserIds: string[] = [];
// Every email created by this run shares this prefix, so parallel runs never collide.
const RUN = `test-${randomUUID().slice(0, 8)}`;
let counter = 0;

export async function startServer(): Promise<void> {
  await new Promise<void>((resolve) => { server = app.listen(0, () => { resolve(); }); });
  base = `http://127.0.0.1:${(server?.address() as AddressInfo).port}`;
}

/** Deletes ONLY the users this run created (their tasks go with them: ON DELETE CASCADE). */
export async function stopServer(): Promise<void> {
  if (createdUserIds.length > 0) await db.query('DELETE FROM users WHERE id = ANY($1::uuid[])', [createdUserIds]);
  await new Promise<void>((resolve) => {
    if (server) server.close(() => { resolve(); });
    else resolve();
  });
  await db.pool.end();
}

export async function call(method: string, path: string, { token, body, raw, headers = {} }: CallOptions = {}): Promise<ApiResult> {
  const res = await fetch(base + path, {
    method,
    headers: {
      ...(body !== undefined || raw !== undefined ? { 'Content-Type': 'application/json' } : {}),
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...headers,
    },
    body: raw ?? (body !== undefined ? JSON.stringify(body) : undefined),
  });
  const text = await res.text();
  return { status: res.status, headers: res.headers, json: text ? JSON.parse(text) : null };
}

export const uniqueEmail = (): string => `${RUN}-${++counter}@example.com`;
export const PASSWORD = 'Secret1234';

export interface TestUser { id: string; email: string; token: string }

/** Registers a brand-new user through the real API and remembers it for cleanup. */
export async function registerUser(name = 'Test User'): Promise<TestUser> {
  const email = uniqueEmail();
  const r = await call('POST', '/api/auth/register', { body: { name, email, password: PASSWORD } });
  if (r.status !== 201) throw new Error(`register failed with ${r.status}`);
  createdUserIds.push(r.json.data.user.id);
  return { id: r.json.data.user.id, email, token: r.json.data.token };
}

/** For users created outside registerUser() (e.g. by a test that registers directly). */
export function trackUser(id: string): void {
  createdUserIds.push(id);
}
