import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { deleteTask, listTasks } from '../api/tasks';
import { messageOf } from '../api/client';
import PageHeading from '../components/PageHeading';
import { useFlashMessage } from '../components/FlashMessage';
import { DueDate, PriorityLabel, StatusBadge } from '../components/TaskBadges';
import { useDebouncedValue } from '../hooks';
import type { SortField, SortOrder, Task, TaskListQuery, TaskPriority, TaskStatus } from '../types';
import { PRIORITIES, PRIORITY_LABEL, STATUSES, STATUS_LABEL } from '../validation';

const PAGE_SIZE = 10;
const SORT_LABEL: Record<SortField, string> = {
  created_at: 'Created', updated_at: 'Last updated', due_date: 'Due date', title: 'Title', priority: 'Priority', status: 'Status',
};

interface ListResult { key: string; tasks?: Task[]; total?: number; error?: string }

export default function DashboardPage() {
  const flash = useFlashMessage();
  const [notice, setNotice] = useState('');
  const [search, setSearch] = useState('');
  const [status, setStatus] = useState<TaskStatus | ''>('');
  const [priority, setPriority] = useState<TaskPriority | ''>('');
  const [sort, setSort] = useState<SortField>('created_at');
  const [order, setOrder] = useState<SortOrder>('desc');
  const [page, setPage] = useState(0);
  const [reloadCount, setReloadCount] = useState(0);
  const [result, setResult] = useState<ListResult>();

  // Wait until the user stops typing for 300 ms before searching (one request, not one per key).
  const debouncedSearch = useDebouncedValue(search.trim(), 300);

  const query = useMemo<TaskListQuery>(() => ({
    status: status || undefined,
    priority: priority || undefined,
    search: debouncedSearch || undefined,
    sort, order, limit: PAGE_SIZE, offset: page * PAGE_SIZE,
  }), [status, priority, debouncedSearch, sort, order, page]);
  // Results are tagged with the request they belong to, so an old response can never overwrite a newer one.
  const key = `${JSON.stringify(query)}#${reloadCount}`;

  useEffect(() => {
    let ignore = false;
    listTasks(query).then(
      ({ tasks, meta }) => { if (!ignore) setResult({ key, tasks, total: meta.total }); },
      (err: unknown) => { if (!ignore) setResult({ key, error: messageOf(err) }); },
    );
    return () => { ignore = true; };
  }, [query, key]);

  const current = result?.key === key ? result : undefined;
  const loading = current === undefined;
  const total = current?.total ?? 0;
  const pageCount = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const filtered = Boolean(status || priority || debouncedSearch);

  // Any filter change starts again at page 1.
  function changeFilter(apply: () => void) {
    apply();
    setPage(0);
    setNotice('');
  }

  async function remove(task: Task) {
    if (!window.confirm(`Delete "${task.title}"? This cannot be undone.`)) return;
    try {
      await deleteTask(task.id);
      setNotice(`Deleted "${task.title}".`);
      if (current?.tasks?.length === 1 && page > 0) setPage(page - 1);
      setReloadCount((n) => n + 1);
    } catch (err) {
      setNotice(`Could not delete: ${messageOf(err)}`);
    }
  }

  const message = notice || flash;

  return (
    <>
      <div className="row between">
        <PageHeading>My tasks</PageHeading>
        <Link to="/tasks/new" className="button">New task</Link>
      </div>
      {message && <p className="flash" role="status">{message}</p>}

      <form className="filters" role="search" onSubmit={(e) => { e.preventDefault(); }}>
        <div className="field grow">
          <label htmlFor="search">Search</label>
          <input id="search" type="search" value={search} maxLength={100} placeholder="Title or description"
            onChange={(e) => { changeFilter(() => { setSearch(e.target.value); }); }} />
        </div>
        <div className="field">
          <label htmlFor="filter-status">Status</label>
          <select id="filter-status" value={status} onChange={(e) => { changeFilter(() => { setStatus(e.target.value as TaskStatus | ''); }); }}>
            <option value="">All statuses</option>
            {STATUSES.map((s) => <option key={s} value={s}>{STATUS_LABEL[s]}</option>)}
          </select>
        </div>
        <div className="field">
          <label htmlFor="filter-priority">Priority</label>
          <select id="filter-priority" value={priority} onChange={(e) => { changeFilter(() => { setPriority(e.target.value as TaskPriority | ''); }); }}>
            <option value="">All priorities</option>
            {PRIORITIES.map((p) => <option key={p} value={p}>{PRIORITY_LABEL[p]}</option>)}
          </select>
        </div>
        <div className="field">
          <label htmlFor="sort">Sort by</label>
          <select id="sort" value={sort} onChange={(e) => { changeFilter(() => { setSort(e.target.value as SortField); }); }}>
            {Object.entries(SORT_LABEL).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
          </select>
        </div>
        <div className="field">
          <label htmlFor="order">Order</label>
          <select id="order" value={order} onChange={(e) => { changeFilter(() => { setOrder(e.target.value as SortOrder); }); }}>
            <option value="desc">Descending</option>
            <option value="asc">Ascending</option>
          </select>
        </div>
      </form>

      {/* aria-live: screen readers announce the new result count after each search/filter. */}
      <p className="muted small" aria-live="polite">
        {loading ? 'Loading tasks…' : current.error ? '' : `${total} task${total === 1 ? '' : 's'} found`}
      </p>

      {current?.error && (
        <div className="error-box" role="alert">
          <p>Could not load tasks: {current.error}</p>
          <button type="button" className="secondary" onClick={() => { setReloadCount((n) => n + 1); }}>Try again</button>
        </div>
      )}

      {current?.tasks?.length === 0 && (
        <p className="empty">
          {filtered ? 'No tasks match your search or filters.' : <>No tasks yet. <Link to="/tasks/new">Create your first task</Link>.</>}
        </p>
      )}

      {current?.tasks && current.tasks.length > 0 && (
        <ul className="tasks">
          {current.tasks.map((task) => (
            <li key={task.id} className={`task ${task.status}`}>
              <div className="grow">
                <Link to={`/tasks/${task.id}`} className="title">{task.title}</Link>
                <div className="meta small">
                  <StatusBadge status={task.status} />
                  <PriorityLabel priority={task.priority} />
                  <DueDate task={task} />
                </div>
              </div>
              <div className="row">
                <Link to={`/tasks/${task.id}/edit`} className="button secondary" aria-label={`Edit ${task.title}`}>Edit</Link>
                <button type="button" className="danger" aria-label={`Delete ${task.title}`} onClick={() => { void remove(task); }}>Delete</button>
              </div>
            </li>
          ))}
        </ul>
      )}

      {total > PAGE_SIZE && (
        <nav className="row pagination" aria-label="Pagination">
          <button type="button" className="secondary" disabled={page === 0} onClick={() => { setPage(page - 1); }}>Previous</button>
          <span className="small">Page {page + 1} of {pageCount}</span>
          <button type="button" className="secondary" disabled={page + 1 >= pageCount} onClick={() => { setPage(page + 1); }}>Next</button>
        </nav>
      )}
    </>
  );
}
