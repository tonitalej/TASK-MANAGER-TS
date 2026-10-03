import { useNavigate, useParams } from 'react-router-dom';
import { updateTask } from '../api/tasks';
import { messageOf } from '../api/client';
import PageHeading from '../components/PageHeading';
import TaskForm from '../components/TaskForm';
import { useTask } from '../hooks';
import { isNotFound, TaskNotFound } from './NotFoundPage';

export default function EditTaskPage() {
  const id = useParams().id ?? '';
  const navigate = useNavigate();
  const { task, error, loading } = useTask(id);

  if (loading) return <p className="muted" role="status">Loading task…</p>;
  if (isNotFound(error)) return <TaskNotFound />;
  if (error || !task) return <p className="error" role="alert">Could not load the task: {messageOf(error)}</p>;

  return (
    <section className="card wide">
      <PageHeading>Edit task</PageHeading>
      <TaskForm
        // key: if the id in the URL changes, start a fresh form with that task's values
        key={task.id}
        initialValues={{
          title: task.title,
          description: task.description ?? '',
          status: task.status,
          priority: task.priority,
          due_date: task.due_date ?? '',
        }}
        submitLabel="Save changes"
        cancelTo={`/tasks/${task.id}`}
        onSubmit={async (payload) => {
          await updateTask(task.id, payload);
          void navigate(`/tasks/${task.id}`, { state: { message: 'Task updated.' } });
        }}
      />
    </section>
  );
}
