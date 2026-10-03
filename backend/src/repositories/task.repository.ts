import { db } from '../config/db.js';
import type { ListQuery, SortField, Task, TaskCreate, TaskUpdate } from '../types/models.js';

const COLUMNS = 'id, user_id, title, description, status, priority, due_date, completed_at, created_at, updated_at';

// Columns a client may change. Because this list is a constant in OUR code,
// it is safe to put these names into the SQL text. Values still use $n placeholders.
const UPDATABLE = ['title', 'description', 'status', 'priority', 'due_date'] as const;

// Sort keys a client may choose -> the SQL expression for ORDER BY. Identifiers cannot be
// $n placeholders, so the client only picks a KEY (validated against the same list) and the
// SQL text always comes from this constant. priority/status sort in their logical order,
// not alphabetically ("high" < "low" < "medium" would be useless).
const SORT_SQL: Record<SortField, string> = {
  created_at: 'created_at',
  updated_at: 'updated_at',
  due_date: 'due_date',
  title: 'lower(title)',
  priority: "CASE priority WHEN 'low' THEN 1 WHEN 'medium' THEN 2 ELSE 3 END",
  status: "CASE status WHEN 'todo' THEN 1 WHEN 'in_progress' THEN 2 ELSE 3 END",
};

// In LIKE patterns % and _ are wildcards. Escape them (and the escape character itself)
// so a search for "50%" finds the text "50%", not "50 followed by anything".
function escapeLike(text: string): string {
  return text.replace(/[\\%_]/g, (ch) => `\\${ch}`);
}

// EVERY query below filters by user_id. That single WHERE clause IS the authorization:
// a task that belongs to someone else simply "does not exist" for you.

export async function findAllByUser(userId: string, q: ListQuery): Promise<{ rows: Task[]; total: number }> {
  const where = ['user_id = $1'];
  const params: unknown[] = [userId];
  if (q.status) { params.push(q.status); where.push(`status = $${params.length}`); }
  if (q.priority) { params.push(q.priority); where.push(`priority = $${params.length}`); }
  if (q.search) {
    params.push(`%${escapeLike(q.search)}%`); // the user's text is a VALUE, never part of the SQL
    where.push(`(title ILIKE $${params.length} ESCAPE '\\' OR description ILIKE $${params.length} ESCAPE '\\')`);
  }
  const whereSql = where.join(' AND ');
  const direction = q.order === 'asc' ? 'ASC' : 'DESC';

  const [list, count] = await Promise.all([
    db.query<Task>(
      // NULLS LAST: tasks without a due date go to the end in both directions.
      // ", id" is a tie-breaker so pagination is stable when sort values are equal.
      `SELECT ${COLUMNS} FROM tasks WHERE ${whereSql}
       ORDER BY ${SORT_SQL[q.sort]} ${direction} NULLS LAST, id
       LIMIT $${params.length + 1} OFFSET $${params.length + 2}`,
      [...params, q.limit, q.offset],
    ),
    db.query<{ total: number }>(`SELECT count(*)::int AS total FROM tasks WHERE ${whereSql}`, params),
  ]);
  return { rows: list.rows, total: count.rows[0]?.total ?? 0 };
}

export async function findByIdForUser(id: string, userId: string): Promise<Task | null> {
  const { rows } = await db.query<Task>(`SELECT ${COLUMNS} FROM tasks WHERE id = $1 AND user_id = $2`, [id, userId]);
  return rows[0] ?? null;
}

export async function create(userId: string, data: TaskCreate): Promise<Task> {
  const { title, description = null, status = 'todo', priority = 'medium', due_date = null } = data;
  const { rows } = await db.query<Task>(
    `INSERT INTO tasks (user_id, title, description, status, priority, due_date, completed_at)
     VALUES ($1, $2, $3, $4, $5, $6, CASE WHEN $4 = 'done' THEN now() END)
     RETURNING ${COLUMNS}`,
    [userId, title, description, status, priority, due_date],
  );
  const task = rows[0];
  if (!task) throw new Error('INSERT ... RETURNING returned no row');
  return task;
}

export async function update(id: string, userId: string, fields: TaskUpdate): Promise<Task | null> {
  const params: unknown[] = [id, userId];
  const sets: string[] = [];
  for (const column of UPDATABLE) {
    if (column in fields) {
      params.push(fields[column]);
      sets.push(`${column} = $${params.length}`);
    }
  }
  // Keep completed_at consistent with status (the CHECK constraint demands it).
  if (fields.status !== undefined) {
    sets.push(fields.status === 'done' ? 'completed_at = COALESCE(completed_at, now())' : 'completed_at = NULL');
  }
  // ONE atomic statement: "find it AND check the owner AND change it".
  // A separate SELECT-then-UPDATE would leave a gap between check and use.
  const { rows } = await db.query<Task>(
    `UPDATE tasks SET ${sets.join(', ')} WHERE id = $1 AND user_id = $2 RETURNING ${COLUMNS}`,
    params,
  );
  return rows[0] ?? null;
}

export async function remove(id: string, userId: string): Promise<boolean> {
  const { rowCount } = await db.query('DELETE FROM tasks WHERE id = $1 AND user_id = $2', [id, userId]);
  return (rowCount ?? 0) > 0;
}
