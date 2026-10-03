import { useLocation } from 'react-router-dom';

/** Shows a one-line message passed through navigation state, e.g. navigate('/', { state: { message } }). */
export function useFlashMessage(): string | undefined {
  const state: unknown = useLocation().state;
  if (typeof state === 'object' && state !== null && 'message' in state && typeof state.message === 'string') {
    return state.message;
  }
  return undefined;
}

export default function FlashMessage() {
  const message = useFlashMessage();
  return message ? <p className="flash" role="status">{message}</p> : null;
}
