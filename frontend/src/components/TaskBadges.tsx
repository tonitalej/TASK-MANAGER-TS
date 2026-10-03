import { formatDate, isOverdue } from '../dates';
import type { Task } from '../types';
import { PRIORITY_LABEL, STATUS_LABEL } from '../validation';

export function StatusBadge({ status }: Pick<Task, 'status'>) {
  return <span className={`badge ${status}`}>{STATUS_LABEL[status]}</span>;
}

export function PriorityLabel({ priority }: Pick<Task, 'priority'>) {
  return <span className={`prio ${priority}`}>{PRIORITY_LABEL[priority]} priority</span>;
}

export function DueDate({ task }: { task: Pick<Task, 'status' | 'due_date'> }) {
  if (!task.due_date) return <span className="muted">No due date</span>;
  const overdue = isOverdue(task);
  return (
    <span className={overdue ? 'overdue' : undefined}>
      Due {formatDate(task.due_date)}{overdue && <strong> (overdue)</strong>}
    </span>
  );
}
