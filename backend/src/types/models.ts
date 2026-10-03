// The shapes of our data. TypeScript checks every function against these.
export type Role = 'user' | 'admin';
export type TaskStatus = 'todo' | 'in_progress' | 'done';
export type TaskPriority = 'low' | 'medium' | 'high';

export interface User {
  id: string;
  name: string;
  email: string;
  role: Role;
  created_at: Date;
}

// Only the repository/service for login ever sees this; it is never sent to a client.
export interface UserWithHash extends User {
  password_hash: string;
}

export interface Task {
  id: string;
  user_id: string;
  title: string;
  description: string | null;
  status: TaskStatus;
  priority: TaskPriority;
  due_date: string | null; // 'YYYY-MM-DD' (see the DATE type parser in config/db.ts)
  completed_at: Date | null;
  created_at: Date;
  updated_at: Date;
}

// What a client may send. Validated data has exactly these shapes.
export interface RegisterInput { name: string; email: string; password: string }
export interface LoginInput { email: string; password: string }

export interface TaskCreate {
  title: string;
  description?: string | null;
  status?: TaskStatus;
  priority?: TaskPriority;
  due_date?: string | null;
}
export type TaskUpdate = Partial<TaskCreate>;

export type SortField = 'created_at' | 'updated_at' | 'due_date' | 'title' | 'priority' | 'status';
export type SortOrder = 'asc' | 'desc';

export interface ListQuery {
  status?: TaskStatus;
  priority?: TaskPriority;
  search?: string;
  sort: SortField;
  order: SortOrder;
  limit: number;
  offset: number;
}
