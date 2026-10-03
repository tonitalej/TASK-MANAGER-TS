// Route guards are UX only: they decide which page to SHOW. The backend checks the token
// on every request, so hiding a page here is not what keeps data safe.
import { Navigate, Outlet, useLocation } from 'react-router-dom';
import { SESSION_EXPIRED_MESSAGE, useAuth } from '../context/AuthContext';
import Layout from './Layout';

function Checking() {
  return <p className="center muted" role="status">Loading…</p>;
}

/** Logged-out users are sent to /login (and come back to the page they wanted after logging in). */
export function ProtectedRoute() {
  const { user, loading, sessionExpired } = useAuth();
  const location = useLocation();
  if (loading) return <Checking />;
  if (!user) {
    const message = sessionExpired ? SESSION_EXPIRED_MESSAGE : undefined;
    return <Navigate to="/login" replace state={{ from: location.pathname, message }} />;
  }
  return <Layout><Outlet /></Layout>;
}

/**
 * Logged-in users never see /login or /register. This is also what moves the user on after a
 * successful login: they go back to the page ProtectedRoute sent them away from, or to the dashboard.
 */
export function GuestRoute() {
  const { user, loading } = useAuth();
  const location = useLocation();
  if (loading) return <Checking />;
  if (user) {
    const from: unknown = (location.state as { from?: unknown } | null)?.from;
    return <Navigate to={typeof from === 'string' ? from : '/'} replace />;
  }
  return <Outlet />;
}
