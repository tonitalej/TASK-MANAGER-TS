// Client-side checks that MIRROR backend/src/validators/index.ts.
// They exist only for fast, friendly feedback; the server validates everything again
// (anyone can skip this code and call the API directly).
import type { TaskPriority, TaskStatus } from './types';

export type Errors<K extends string> = Partial<Record<K, string>>;

const EMAIL_RE = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;
export const STATUSES: readonly TaskStatus[] = ['todo', 'in_progress', 'done'];
export const PRIORITIES: readonly TaskPriority[] = ['low', 'medium', 'high'];
export const STATUS_LABEL: Record<TaskStatus, string> = { todo: 'To do', in_progress: 'In progress', done: 'Done' };
export const PRIORITY_LABEL: Record<TaskPriority, string> = { low: 'Low', medium: 'Medium', high: 'High' };

const byteLength = (s: string): number => new TextEncoder().encode(s).length;

export function validateEmail(email: string): string | undefined {
  const e = email.trim();
  return e.length > 255 || !EMAIL_RE.test(e) ? 'Enter a valid email address' : undefined;
}

export function validateRegister(v: { name: string; email: string; password: string }): Errors<'name' | 'email' | 'password'> {
  const errors: Errors<'name' | 'email' | 'password'> = {};
  const name = v.name.trim();
  if (name.length < 2 || name.length > 100) errors.name = 'Name must be 2-100 characters';
  const email = validateEmail(v.email);
  if (email) errors.email = email;
  // bcrypt only uses the first 72 BYTES of a password, so the server caps it there.
  if (v.password.length < 8 || byteLength(v.password) > 72) errors.password = 'Password must be 8-72 characters';
  else if (!/[A-Za-z]/.test(v.password) || !/\d/.test(v.password)) errors.password = 'Password must contain at least one letter and one number';
  return errors;
}

export function validateLogin(v: { email: string; password: string }): Errors<'email' | 'password'> {
  const errors: Errors<'email' | 'password'> = {};
  const email = validateEmail(v.email);
  if (email) errors.email = email;
  if (v.password.length === 0) errors.password = 'Password is required';
  return errors;
}

export interface TaskFormValues {
  title: string;
  description: string;
  status: TaskStatus;
  priority: TaskPriority;
  due_date: string; // '' = no due date
}
export type TaskField = keyof TaskFormValues;

function isRealDate(str: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(str)) return false;
  const d = new Date(`${str}T00:00:00Z`);
  return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === str; // rejects 2026-02-31
}

export function validateTask(v: TaskFormValues): Errors<TaskField> {
  const errors: Errors<TaskField> = {};
  const title = v.title.trim();
  if (title.length < 1) errors.title = 'Title is required';
  else if (title.length > 200) errors.title = 'Title must be at most 200 characters';
  if (v.description.length > 5000) errors.description = 'Description must be at most 5000 characters';
  if (v.due_date && !isRealDate(v.due_date)) errors.due_date = 'Enter a real date';
  return errors;
}
