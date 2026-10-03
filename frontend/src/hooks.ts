import { useEffect, useState } from 'react';
import { getTask } from './api/tasks';
import type { Task } from './types';

/** Returns `value`, but only after it stopped changing for `delayMs` (used for search-as-you-type). */
export function useDebouncedValue<T>(value: T, delayMs: number): T {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const timer = setTimeout(() => { setDebounced(value); }, delayMs);
    return () => { clearTimeout(timer); };
  }, [value, delayMs]);
  return debounced;
}

/** Loads one task. The result is tagged with its id, so a stale answer for another id is never shown. */
export function useTask(id: string): { task?: Task; error?: unknown; loading: boolean } {
  const [result, setResult] = useState<{ id: string; task?: Task; error?: unknown }>();
  useEffect(() => {
    let ignore = false; // set when id changes or the page unmounts before the response arrives
    getTask(id).then(
      (task) => { if (!ignore) setResult({ id, task }); },
      (error: unknown) => { if (!ignore) setResult({ id, error }); },
    );
    return () => { ignore = true; };
  }, [id]);
  const current = result?.id === id ? result : undefined;
  return { task: current?.task, error: current?.error, loading: current === undefined };
}
