import { Link } from 'react-router-dom';
import { ApiError } from '../api/client';
import PageHeading from '../components/PageHeading';

/** 404 = no such task (or another user's task: the API deliberately answers the same). 400 = malformed id. */
export const isNotFound = (err: unknown): boolean => err instanceof ApiError && (err.status === 404 || err.status === 400);

export function TaskNotFound() {
  return (
    <section className="card">
      <PageHeading>Task not found</PageHeading>
      <p>This task does not exist or you do not have access to it.</p>
      <Link to="/">Back to my tasks</Link>
    </section>
  );
}

export default function NotFoundPage() {
  return (
    <main className="card">
      <PageHeading>Page not found</PageHeading>
      <p>There is nothing at this address.</p>
      <Link to="/">Go to the start page</Link>
    </main>
  );
}
