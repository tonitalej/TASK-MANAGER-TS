import type { AuthResponse, LoginPayload, RegisterPayload, User } from '../types';
import { request } from './client';

// `as` states the response shape the API documents; the server is the source of truth.
export async function register(payload: RegisterPayload): Promise<AuthResponse> {
  return ((await request('POST', '/auth/register', payload)) as { data: AuthResponse }).data;
}

export async function login(payload: LoginPayload): Promise<AuthResponse> {
  return ((await request('POST', '/auth/login', payload)) as { data: AuthResponse }).data;
}

export async function me(): Promise<User> {
  return ((await request('GET', '/auth/me')) as { data: { user: User } }).data.user;
}
