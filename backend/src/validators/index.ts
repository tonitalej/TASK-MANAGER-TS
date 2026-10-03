// Hand-written validators so you can see exactly what they do.
// (Libraries like zod do the same with less typing.)
// Each takes UNKNOWN input and returns { value, errors }:
// value = cleaned, correctly typed data; errors = list of problems.
import type {
  ListQuery, LoginInput, RegisterInput, SortField, SortOrder, TaskCreate, TaskPriority, TaskStatus, TaskUpdate,
} from '../types/models.js';

export interface FieldError { field: string; message: string }
export interface Validation<T> { value: T; errors: FieldError[] }
export type Validator<T> = (input: unknown) => Validation<T>;

export const STATUSES: readonly TaskStatus[] = ['todo', 'in_progress', 'done'];
export const PRIORITIES: readonly TaskPriority[] = ['low', 'medium', 'high'];
export const SORT_FIELDS: readonly SortField[] = ['created_at', 'updated_at', 'due_date', 'title', 'priority', 'status'];
const SORT_ORDERS: readonly SortOrder[] = ['asc', 'desc'];
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const EMAIL_RE = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;

type Obj = Record<string, unknown>;
const isObject = (v: unknown): v is Obj => v !== null && typeof v === 'object' && !Array.isArray(v);
const bodyMustBeObject = (): FieldError[] => [{ field: 'body', message: 'Must be a JSON object' }];

// Type guards: after `isStatus(x)` TypeScript KNOWS x is a TaskStatus.
const isStatus = (v: unknown): v is TaskStatus => STATUSES.includes(v as TaskStatus);
const isPriority = (v: unknown): v is TaskPriority => PRIORITIES.includes(v as TaskPriority);
const isSortField = (v: unknown): v is SortField => SORT_FIELDS.includes(v as SortField);
const isSortOrder = (v: unknown): v is SortOrder => SORT_ORDERS.includes(v as SortOrder);

function isRealDate(str: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(str)) return false;
  const d = new Date(`${str}T00:00:00Z`);
  return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === str; // rejects 2026-02-31
}

// ---------- auth ----------
export const validateRegister: Validator<RegisterInput> = (input) => {
  const empty: RegisterInput = { name: '', email: '', password: '' };
  if (!isObject(input)) return { value: empty, errors: bodyMustBeObject() };
  const errors: FieldError[] = [];

  const name = typeof input.name === 'string' ? input.name.trim() : '';
  if (name.length < 2 || name.length > 100) errors.push({ field: 'name', message: 'Must be 2-100 characters' });

  const email = typeof input.email === 'string' ? input.email.trim().toLowerCase() : '';
  if (email.length > 255 || !EMAIL_RE.test(email)) errors.push({ field: 'email', message: 'Must be a valid email' });

  const password = typeof input.password === 'string' ? input.password : '';
  // bcrypt only uses the first 72 BYTES, so we cap the length.
  if (password.length < 8 || Buffer.byteLength(password) > 72) {
    errors.push({ field: 'password', message: 'Must be 8-72 characters' });
  } else if (!/[A-Za-z]/.test(password) || !/\d/.test(password)) {
    errors.push({ field: 'password', message: 'Must contain at least one letter and one number' });
  }
  return { value: { name, email, password }, errors };
};

export const validateLogin: Validator<LoginInput> = (input) => {
  if (!isObject(input)) return { value: { email: '', password: '' }, errors: bodyMustBeObject() };
  const errors: FieldError[] = [];
  const email = typeof input.email === 'string' ? input.email.trim().toLowerCase() : '';
  if (!EMAIL_RE.test(email) || email.length > 255) errors.push({ field: 'email', message: 'Must be a valid email' });
  const password = typeof input.password === 'string' ? input.password : '';
  if (password.length === 0 || password.length > 200) errors.push({ field: 'password', message: 'Password is required' });
  return { value: { email, password }, errors };
};

// ---------- tasks ----------
// partial = true for PATCH (every field optional, but at least one required)
function taskInputValidator<T extends TaskUpdate>(partial: boolean): Validator<T> {
  return (input) => {
    if (!isObject(input)) return { value: {} as T, errors: bodyMustBeObject() };
    const errors: FieldError[] = [];
    const value: TaskUpdate = {};

    if ('title' in input || !partial) {
      const title = typeof input.title === 'string' ? input.title.trim() : '';
      if (title.length < 1 || title.length > 200) errors.push({ field: 'title', message: 'Must be 1-200 characters' });
      else value.title = title;
    }
    if ('description' in input) {
      const d = input.description;
      if (d === null) value.description = null;
      else if (typeof d === 'string' && d.length <= 5000) value.description = d;
      else errors.push({ field: 'description', message: 'Must be text up to 5000 characters, or null' });
    }
    if ('status' in input) {
      if (isStatus(input.status)) value.status = input.status;
      else errors.push({ field: 'status', message: `Must be one of: ${STATUSES.join(', ')}` });
    }
    if ('priority' in input) {
      if (isPriority(input.priority)) value.priority = input.priority;
      else errors.push({ field: 'priority', message: `Must be one of: ${PRIORITIES.join(', ')}` });
    }
    if ('due_date' in input) {
      const d = input.due_date;
      if (d === null) value.due_date = null;
      else if (typeof d === 'string' && isRealDate(d)) value.due_date = d;
      else errors.push({ field: 'due_date', message: 'Must be a real date as YYYY-MM-DD, or null' });
    }
    if (partial && errors.length === 0 && Object.keys(value).length === 0) {
      errors.push({ field: 'body', message: 'Provide at least one field to update' });
    }
    return { value: value as T, errors };
  };
}

export const validateCreateTask: Validator<TaskCreate> = taskInputValidator<TaskCreate>(false);
export const validateUpdateTask: Validator<TaskUpdate> = taskInputValidator<TaskUpdate>(true);

export const validateIdParam: Validator<{ id: string }> = (params) => {
  const id = isObject(params) ? params.id : undefined;
  if (typeof id !== 'string' || !UUID_RE.test(id)) {
    return { value: { id: '' }, errors: [{ field: 'id', message: 'Must be a valid UUID' }] };
  }
  return { value: { id: id.toLowerCase() }, errors: [] };
};

// GET /api/tasks?status=&priority=&search=&sort=&order=&limit=&offset=
// A repeated parameter (?status=a&status=b) arrives as an array and is rejected by these checks.
export const validateListQuery: Validator<ListQuery> = (query) => {
  const q: Obj = isObject(query) ? query : {};
  const errors: FieldError[] = [];
  const value: ListQuery = { sort: 'created_at', order: 'desc', limit: 50, offset: 0 };

  if (q.status !== undefined) {
    if (isStatus(q.status)) value.status = q.status;
    else errors.push({ field: 'status', message: `Must be one of: ${STATUSES.join(', ')}` });
  }
  if (q.priority !== undefined) {
    if (isPriority(q.priority)) value.priority = q.priority;
    else errors.push({ field: 'priority', message: `Must be one of: ${PRIORITIES.join(', ')}` });
  }
  if (q.search !== undefined) {
    const search = typeof q.search === 'string' ? q.search.trim() : '';
    if (search.length >= 1 && search.length <= 100) value.search = search;
    else errors.push({ field: 'search', message: 'Must be 1-100 characters' });
  }
  // sort and order end up in the SQL text, so ONLY values from the allowlists are accepted.
  if (q.sort !== undefined) {
    if (isSortField(q.sort)) value.sort = q.sort;
    else errors.push({ field: 'sort', message: `Must be one of: ${SORT_FIELDS.join(', ')}` });
  }
  if (q.order !== undefined) {
    if (isSortOrder(q.order)) value.order = q.order;
    else errors.push({ field: 'order', message: 'Must be asc or desc' });
  }
  if (q.limit !== undefined) {
    const n = Number(q.limit);
    if (Number.isInteger(n) && n >= 1 && n <= 100) value.limit = n;
    else errors.push({ field: 'limit', message: 'Must be an integer 1-100' });
  }
  if (q.offset !== undefined) {
    const n = Number(q.offset);
    // isSafeInteger, not isInteger: 1e20 is an "integer" but overflows PostgreSQL's bigint (-> 500).
    if (Number.isSafeInteger(n) && n >= 0) value.offset = n;
    else errors.push({ field: 'offset', message: 'Must be an integer >= 0' });
  }
  return { value, errors };
};
