import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { useNavigate } from 'react-router-dom';
import * as authApi from '../api/auth';
import { setUnauthorizedHandler, tokenStorage } from '../api/client';
import type { LoginPayload, RegisterPayload, User } from '../types';

export const SESSION_EXPIRED_MESSAGE = 'Your session has expired. Please log in again.';

interface AuthState {
  user: User | null;
  /** true while an existing token is being checked with GET /api/auth/me */
  loading: boolean;
  /** true after the server rejected our token mid-session (ProtectedRoute then explains why) */
  sessionExpired: boolean;
  login: (payload: LoginPayload) => Promise<void>;
  register: (payload: RegisterPayload) => Promise<void>;
  logout: () => void;
}

const AuthContext = createContext<AuthState | null>(null);

export function useAuth(): AuthState {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used inside <AuthProvider>');
  return ctx;
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const navigate = useNavigate();
  const [user, setUser] = useState<User | null>(null);
  // Only "loading" if there is a token to check; otherwise we already know nobody is logged in.
  const [loading, setLoading] = useState(() => tokenStorage.get() !== null);
  const [sessionExpired, setSessionExpired] = useState(false);

  // Restore the session on page load: the token alone proves nothing until the server accepts it.
  useEffect(() => {
    if (!tokenStorage.get()) return;
    authApi.me()
      .then(setUser, () => { tokenStorage.clear(); setUser(null); })
      .finally(() => { setLoading(false); });
  }, []);

  // Any API call that gets a 401 with a token lands here (expired or invalid token).
  // Clearing the user makes ProtectedRoute send the visitor to /login with SESSION_EXPIRED_MESSAGE.
  useEffect(() => setUnauthorizedHandler(() => {
    setSessionExpired(true);
    setUser(null);
  }), []);

  const login = useCallback(async (payload: LoginPayload) => {
    const { user: loggedIn, token } = await authApi.login(payload);
    tokenStorage.set(token);
    setSessionExpired(false);
    setUser(loggedIn);
  }, []);

  const register = useCallback(async (payload: RegisterPayload) => {
    const { user: created, token } = await authApi.register(payload);
    tokenStorage.set(token);
    setSessionExpired(false);
    setUser(created);
  }, []);

  // A JWT cannot be "revoked" on the server here: logging out means forgetting the token.
  const logout = useCallback(() => {
    tokenStorage.clear();
    setSessionExpired(false);
    setUser(null);
    void navigate('/login', { replace: true });
  }, [navigate]);

  const value = useMemo(
    () => ({ user, loading, sessionExpired, login, register, logout }),
    [user, loading, sessionExpired, login, register, logout],
  );
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}
