import * as tasks from '../repositories/task.repository.js';
import { AppError } from '../utils/AppError.js';
import type { ListQuery, Task, TaskCreate, TaskUpdate } from '../types/models.js';

// 404 (not 403) when a task belongs to someone else: we don't even confirm it exists.
const notFound = () => new AppError(404, 'TASK_NOT_FOUND', 'Task not found');

export async function list(userId: string, filters: ListQuery) {
  const { rows, total } = await tasks.findAllByUser(userId, filters);
  return { tasks: rows, meta: { total, limit: filters.limit, offset: filters.offset } };
}

export async function getOne(userId: string, id: string): Promise<Task> {
  const task = await tasks.findByIdForUser(id, userId);
  if (!task) throw notFound();
  return task;
}

export const create = (userId: string, data: TaskCreate): Promise<Task> => tasks.create(userId, data);

export async function update(userId: string, id: string, data: TaskUpdate): Promise<Task> {
  const task = await tasks.update(id, userId, data);
  if (!task) throw notFound();
  return task;
}

export async function remove(userId: string, id: string): Promise<void> {
  if (!(await tasks.remove(id, userId))) throw notFound();
}
