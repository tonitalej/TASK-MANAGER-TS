// The ONE place that talks HTTP to the Express API.
// Adds the base URL, JSON handling and the Bearer token; turns error responses into ApiError;
// and handles 401 centrally (clear the token, tell the app to go to /login).
import type { FieldError } from '../types';

// Empty in development: requests go to /api on the Vite dev server, which proxies to :3000.
// In production set VITE_API_URL=https://api.example.com (no trailing slash).
const BASE_URL = (import.meta.env.VITE_API_URL ?? '').replace(/\/+$/, '');
const TOKEN_KEY = 'tm_token';

// The JWT lives in localStorage so it survives a page reload. Trade-off: any script running on
// the page (an XSS bug) could read it. That is why it expires quickly (JWT_EXPIRES_IN) and why
// React's escaping of rendered text matters. An httpOnly cookie would hide it from scripts.
export const tokenStorage = {
  get: (): string | null => localStorage.getItem(TOKEN_KEY),
  set: (token: string): void => { localStorage.setItem(TOKEN_KEY, token); },
  clear: (): void => { localStorage.removeItem(TOKEN_KEY); },
};

/** Error with the API's { code, message, details } plus the HTTP status (0 = network error). */
export class ApiError extends Error {
  constructor(
    public readonly status: number,
    public readonly code: string,
    message: string,
    public readonly details: FieldError[] = [],
  ) {
    super(message);
    this.name = 'ApiError';
  }
}

let onUnauthorized: (() => void) | null = null;

/** The AuthProvider registers what to do when the session is no longer valid. */
export function setUnauthorizedHandler(handler: () => void): () => void {
  onUnauthorized = handler;
  return () => { if (onUnauthorized === handler) onUnauthorized = null; };
}

interface ErrorBody { error?: { code?: string; message?: string; details?: FieldError[] } }

/**
 * Sends a request and returns the parsed JSON body (or undefined for 204).
 * The result is `unknown`: each function in auth.ts / tasks.ts states the shape it expects.
 */
export async function request(method: string, path: string, body?: unknown): Promise<unknown> {
  const token = tokenStorage.get();
  let res: Response;
  try {
    res = await fetch(`${BASE_URL}/api${path}`, {
      method,
      headers: {
        ...(body !== undefined ? { 'Content-Type': 'application/json' } : {}),
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
      body: body !== undefined ? JSON.stringify(body) : undefined,
    });
  } catch {
    throw new ApiError(0, 'NETWORK_ERROR', 'Cannot reach the server. Check your connection and try again.');
  }

  if (res.status === 204) return undefined;
  const json: unknown = await res.json().catch(() => null);
  if (res.ok) return json;

  // A 401 on a request that carried a token means the session expired or the token is invalid.
  // (A 401 from /auth/login without a token is just "wrong password" and is handled by the form.)
  if (res.status === 401 && token) {
    tokenStorage.clear();
    onUnauthorized?.();
  }
  const error = (json as ErrorBody | null)?.error;
  throw new ApiError(res.status, error?.code ?? 'HTTP_ERROR', error?.message ?? `Request failed (${res.status})`, error?.details ?? []);
}

/** Turns anything thrown into a message that is safe to show. */
export const messageOf = (err: unknown): string => (err instanceof Error ? err.message : 'Something went wrong');
