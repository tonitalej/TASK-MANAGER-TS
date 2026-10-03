import { useNavigate } from 'react-router-dom';
import { createTask } from '../api/tasks';
import PageHeading from '../components/PageHeading';
import TaskForm, { EMPTY_TASK } from '../components/TaskForm';

export default function NewTaskPage() {
  const navigate = useNavigate();
  return (
    <section className="card wide">
      <PageHeading>New task</PageHeading>
      <TaskForm
        initialValues={EMPTY_TASK}
        submitLabel="Create task"
        cancelTo="/"
        onSubmit={async (payload) => {
          const task = await createTask(payload);
          void navigate(`/tasks/${task.id}`, { state: { message: 'Task created.' } });
        }}
      />
    </section>
  );
}
