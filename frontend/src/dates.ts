import type { Task } from './types';

/** Today as 'YYYY-MM-DD' in the user's LOCAL time zone (toISOString() would give the UTC date). */
export function localToday(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

/** Open tasks whose due date is before today. 'YYYY-MM-DD' strings compare correctly as text. */
export function isOverdue(task: Pick<Task, 'status' | 'due_date'>): boolean {
  return task.status !== 'done' && task.due_date !== null && task.due_date < localToday();
}

/** '2026-03-15' -> "15 Mar 2026" without time zone shifts (the date is parsed as local midnight). */
export function formatDate(date: string): string {
  const [y = 0, m = 1, d = 1] = date.split('-').map(Number);
  return new Date(y, m - 1, d).toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' });
}

export function formatDateTime(iso: string): string {
  return new Date(iso).toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' });
}
