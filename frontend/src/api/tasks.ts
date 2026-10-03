import type { Task, TaskChanges, TaskListQuery, TaskListResult, TaskPayload } from '../types';
import { request } from './client';

interface Envelope<T> { data: T }

export async function listTasks(query: TaskListQuery): Promise<TaskListResult> {
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(query)) {
    if (value !== undefined && value !== '') params.set(key, String(value));
  }
  const qs = params.toString();
  const body = (await request('GET', `/tasks${qs ? `?${qs}` : ''}`)) as Envelope<Task[]> & { meta: TaskListResult['meta'] };
  return { tasks: body.data, meta: body.meta };
}

export async function getTask(id: string): Promise<Task> {
  return ((await request('GET', `/tasks/${encodeURIComponent(id)}`)) as Envelope<Task>).data;
}

export async function createTask(payload: TaskPayload): Promise<Task> {
  return ((await request('POST', '/tasks', payload)) as Envelope<Task>).data;
}

export async function updateTask(id: string, changes: TaskChanges): Promise<Task> {
  return ((await request('PATCH', `/tasks/${encodeURIComponent(id)}`, changes)) as Envelope<Task>).data;
}

export async function deleteTask(id: string): Promise<void> {
  await request('DELETE', `/tasks/${encodeURIComponent(id)}`);
}
