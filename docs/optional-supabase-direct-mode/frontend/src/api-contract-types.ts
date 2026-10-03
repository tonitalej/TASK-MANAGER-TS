// Shared shapes for the UI. Both backends (Express and Supabase) must produce these.
export type TaskStatus = 'todo' | 'in_progress' | 'done';
export type TaskPriority = 'low' | 'medium' | 'high';

export interface User {
  id: string;
  email: string;
  name?: string;
  role?: string;
}

export interface Task {
  id: string;
  user_id: string;
  title: string;
  description: string | null;
  status: TaskStatus;
  priority: TaskPriority;
  due_date: string | null; // 'YYYY-MM-DD'
  completed_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface NewTask {
  title: string;
  description?: string | null;
  status?: TaskStatus;
  priority?: TaskPriority;
  due_date?: string | null;
}
export type TaskChanges = Partial<NewTask>;

export interface TaskFilters { status?: TaskStatus | ''; priority?: TaskPriority | '' }

export interface Attachment { path: string; name: string; size: number | null }

// ---- The contract. The UI only knows this interface, never which backend is behind it. ----
export interface AuthApi {
  register(name: string, email: string, password: string): Promise<User>;
  login(email: string, password: string): Promise<User>;
  logout(): Promise<void>;
  currentUser(): Promise<User | null>;
  /** Calls cb when the session ends elsewhere (expired token, other tab). Returns an unsubscribe function. */
  onSignedOut(cb: () => void): () => void;
}
export interface TasksApi {
  list(filters?: TaskFilters): Promise<Task[]>;
  create(task: NewTask): Promise<Task>;
  update(id: string, changes: TaskChanges): Promise<Task>;
  remove(id: string): Promise<void>;
}
export interface AttachmentsApi {
  list(taskId: string): Promise<Attachment[]>;
  upload(taskId: string, file: File): Promise<void>;
  openUrl(path: string): Promise<string>;
  remove(path: string): Promise<void>;
}
export interface Api {
  label: string;
  auth: AuthApi;
  tasks: TasksApi;
  /** null when the backend has no file feature (Express). */
  attachments: AttachmentsApi | null;
  subscribe(onChange: () => void): () => void;
}
