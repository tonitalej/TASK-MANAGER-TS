import { useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { deleteTask } from '../api/tasks';
import { messageOf } from '../api/client';
import FlashMessage from '../components/FlashMessage';
import PageHeading from '../components/PageHeading';
import { DueDate, PriorityLabel, StatusBadge } from '../components/TaskBadges';
import { formatDateTime } from '../dates';
import { useTask } from '../hooks';
import { isNotFound, TaskNotFound } from './NotFoundPage';

export default function TaskDetailsPage() {
  const id = useParams().id ?? '';
  const navigate = useNavigate();
  const { task, error, loading } = useTask(id);
  const [deleteError, setDeleteError] = useState('');

  if (loading) return <p className="muted" role="status">Loading task…</p>;
  if (isNotFound(error)) return <TaskNotFound />;
  if (error || !task) return <p className="error" role="alert">Could not load the task: {messageOf(error)}</p>;

  async function remove() {
    if (!task || !window.confirm(`Delete "${task.title}"? This cannot be undone.`)) return;
    try {
      await deleteTask(task.id);
      void navigate('/', { state: { message: `Deleted "${task.title}".` } });
    } catch (err) {
      setDeleteError(messageOf(err));
    }
  }

  return (
    <article className="card wide">
      <p className="small"><Link to="/">← Back to my tasks</Link></p>
      <FlashMessage />
      <PageHeading>{task.title}</PageHeading>
      <div className="meta">
        <StatusBadge status={task.status} />
        <PriorityLabel priority={task.priority} />
        <DueDate task={task} />
      </div>

      <h2 className="small muted">Description</h2>
      {/* Rendered as text by React (escaped), never as HTML: user content cannot inject scripts. */}
      <p className="description">{task.description ?? <span className="muted">No description</span>}</p>

      <dl className="timestamps small">
        <dt>Created</dt><dd>{formatDateTime(task.created_at)}</dd>
        <dt>Last updated</dt><dd>{formatDateTime(task.updated_at)}</dd>
        {task.completed_at && <><dt>Completed</dt><dd>{formatDateTime(task.completed_at)}</dd></>}
      </dl>

      {deleteError && <p className="error" role="alert">Could not delete: {deleteError}</p>}
      <div className="row">
        <Link to={`/tasks/${task.id}/edit`} className="button">Edit</Link>
        <button type="button" className="danger" onClick={() => { void remove(); }}>Delete</button>
      </div>
    </article>
  );
}
