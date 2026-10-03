// An in-memory stand-in for the Express API, used by the UI tests instead of the network.
// It answers with the same envelopes, status codes and error codes as backend/src
// ({ data, meta? } / { error: { code, message, details? } }, 204 on delete, 404 for other users' tasks),
// so the UI is tested against the real contract without needing a database.
import type { Task, TaskPriority, TaskStatus, User } from '../src/types';

interface StoredUser extends User { password: string }
interface Recorded { method: string; path: string; query: URLSearchParams }
type Body = Partial<Record<string, string | null>>;

const json = (status: number, body: unknown): Response =>
  new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });
const fail = (status: number, code: string, message: string, details?: { field: string; message: string }[]): Response =>
  json(status, { error: { code, message, ...(details ? { details } : {}) } });

export class FakeApi {
  private users: StoredUser[] = [];
  private tasks: Task[] = [];
  private nextId = 1;
  private clock = Date.UTC(2026, 0, 1);
  /** Every request the app made, in order (used to check query parameters). */
  readonly requests: Recorded[] = [];
  /** When true, every request with a token gets 401 (simulates an expired JWT). */
  expired = false;
  /** When true, fetch rejects like a browser that cannot reach the server. */
  offline = false;

  addUser(name: string, email: string, password: string): User {
    const user: StoredUser = { id: this.id(), name, email, password, role: 'user', created_at: this.now() };
    this.users.push(user);
    return this.publicUser(user);
  }

  addTask(owner: User, fields: { title: string; status?: TaskStatus; priority?: TaskPriority; description?: string }): Task {
    const now = this.now();
    const task: Task = {
      id: this.id(), user_id: owner.id, title: fields.title, description: fields.description ?? null,
      status: fields.status ?? 'todo', priority: fields.priority ?? 'medium', due_date: null,
      completed_at: null, created_at: now, updated_at: now,
    };
    this.tasks.push(task);
    return task;
  }

  /** Puts a valid token for this user in localStorage, as if they had logged in earlier. */
  logInAs(user: User): void {
    localStorage.setItem('tm_token', this.tokenFor(user.id));
  }

  taskTitles(owner: User): string[] {
    return this.tasks.filter((t) => t.user_id === owner.id).map((t) => t.title);
  }

  /** Pass this as the global fetch: vi.stubGlobal('fetch', api.fetch). */
  readonly fetch = (input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
    if (this.offline) return Promise.reject(new TypeError('Failed to fetch'));
    const url = new URL(input instanceof Request ? input.url : String(input), 'http://localhost');
    const method = init?.method ?? 'GET';
    this.requests.push({ method, path: url.pathname, query: url.searchParams });
    const body = typeof init?.body === 'string' ? (JSON.parse(init.body) as Body) : {};
    const token = new Headers(init?.headers).get('Authorization')?.replace(/^Bearer /, '') ?? null;
    return Promise.resolve(this.handle(method, url.pathname, url.searchParams, body, token));
  };

  private handle(method: string, path: string, query: URLSearchParams, body: Body, token: string | null): Response {
    if (method === 'POST' && path === '/api/auth/register') return this.register(body);
    if (method === 'POST' && path === '/api/auth/login') {
      const user = this.users.find((u) => u.email === body.email && u.password === body.password);
      if (!user) return fail(401, 'INVALID_CREDENTIALS', 'Invalid email or password');
      return json(200, { data: { user: this.publicUser(user), token: this.tokenFor(user.id) } });
    }

    if (!token) return fail(401, 'UNAUTHORIZED', 'Missing or malformed Authorization header');
    const user = this.users.find((u) => this.tokenFor(u.id) === token);
    if (!user || this.expired) return fail(401, 'INVALID_TOKEN', this.expired ? 'Token expired' : 'Invalid token');

    if (method === 'GET' && path === '/api/auth/me') return json(200, { data: { user: this.publicUser(user) } });
    if (method === 'GET' && path === '/api/tasks') return this.list(user, query);
    if (method === 'POST' && path === '/api/tasks') return this.create(user, body);

    const match = /^\/api\/tasks\/([^/]+)$/.exec(path);
    if (match) {
      // Someone else's task gets the same 404 as a missing one, exactly like the backend.
      const task = this.tasks.find((t) => t.id === decodeURIComponent(match[1] ?? '') && t.user_id === user.id);
      if (!task) return fail(404, 'TASK_NOT_FOUND', 'Task not found');
      if (method === 'GET') return json(200, { data: task });
      if (method === 'PATCH') return this.update(task, body);
      if (method === 'DELETE') {
        this.tasks = this.tasks.filter((t) => t !== task);
        return new Response(null, { status: 204 });
      }
    }
    return fail(404, 'ROUTE_NOT_FOUND', `Route ${method} ${path} not found`);
  }

  private register(body: Body): Response {
    const { name = '', email = '', password = '' } = body;
    if (this.users.some((u) => u.email === email)) return fail(409, 'EMAIL_TAKEN', 'Email is already registered');
    const user = this.addUser(name ?? '', email ?? '', password ?? '');
    return json(201, { data: { user, token: this.tokenFor(user.id) } });
  }

  private list(user: User, query: URLSearchParams): Response {
    const search = query.get('search')?.toLowerCase();
    const matching = this.tasks
      .filter((t) => t.user_id === user.id)
      .filter((t) => !query.get('status') || t.status === query.get('status'))
      .filter((t) => !query.get('priority') || t.priority === query.get('priority'))
      .filter((t) => !search || t.title.toLowerCase().includes(search) || (t.description ?? '').toLowerCase().includes(search))
      .reverse(); // newest first, like the default sort=created_at&order=desc
    const limit = Number(query.get('limit') ?? 20);
    const offset = Number(query.get('offset') ?? 0);
    return json(200, { data: matching.slice(offset, offset + limit), meta: { total: matching.length, limit, offset } });
  }

  private create(user: User, body: Body): Response {
    const task = this.addTask(user, { title: body.title ?? '' });
    return this.update(task, body, 201);
  }

  private update(task: Task, body: Body, status = 200): Response {
    if (body.title !== undefined) task.title = body.title ?? '';
    if (body.description !== undefined) task.description = body.description;
    if (body.status !== undefined) task.status = body.status as TaskStatus;
    if (body.priority !== undefined) task.priority = body.priority as TaskPriority;
    if (body.due_date !== undefined) task.due_date = body.due_date;
    task.completed_at = task.status === 'done' ? (task.completed_at ?? this.now()) : null;
    task.updated_at = this.now();
    return json(status, { data: task });
  }

  private tokenFor(userId: string): string {
    return `fake-token-${userId}`;
  }

  private publicUser({ password: _password, ...user }: StoredUser): User {
    return user;
  }

  private id(): string {
    return `00000000-0000-4000-8000-${String(this.nextId++).padStart(12, '0')}`;
  }

  private now(): string {
    this.clock += 60_000;
    return new Date(this.clock).toISOString();
  }
}




