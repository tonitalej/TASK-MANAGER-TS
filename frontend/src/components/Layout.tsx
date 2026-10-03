import type { ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';

export default function Layout({ children }: { children: ReactNode }) {
  const { user, logout } = useAuth();
  return (
    <>
      <header className="topbar">
        <Link to="/" className="brand">Task Manager</Link>
        <div className="row">
          <span className="muted small">{user?.name}</span>
          <button type="button" className="secondary" onClick={() => { logout(); }}>Log out</button>
        </div>
      </header>
      <main className="page">{children}</main>
    </>
  );
}
