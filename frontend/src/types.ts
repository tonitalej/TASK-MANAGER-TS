// The shapes the Express API sends and accepts (see backend/src/types/models.ts).
export type TaskStatus = 'todo' | 'in_progress' | 'done';
export type TaskPriority = 'low' | 'medium' | 'high';
export type SortField = 'created_at' | 'updated_at' | 'due_date' | 'title' | 'priority' | 'status';
export type SortOrder = 'asc' | 'desc';

export interface User {
  id: string;
  name: string;
  email: string;
  role: 'user' | 'admin';
  created_at: string;
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

/** POST /api/auth/register and /api/auth/login -> { data: AuthResponse } */
export interface AuthResponse { user: User; token: string }

export interface RegisterPayload { name: string; email: string; password: string }
export interface LoginPayload { email: string; password: string }

/** POST /api/tasks body. PATCH /api/tasks/:id takes any subset (TaskChanges). */
export interface TaskPayload {
  title: string;
  description: string | null;
  status: TaskStatus;
  priority: TaskPriority;
  due_date: string | null;
}
export type TaskChanges = Partial<TaskPayload>;

export interface TaskListQuery {
  status?: TaskStatus;
  priority?: TaskPriority;
  search?: string;
  sort?: SortField;
  order?: SortOrder;
  limit?: number;
  offset?: number;
}

export interface TaskListResult {
  tasks: Task[];
  meta: { total: number; limit: number; offset: number };
}

/** One entry of error.details in a 400 VALIDATION_ERROR response. */
export interface FieldError { field: string; message: string }
