import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { api, ApiError, setUnauthorizedHandler, tokenStore } from './api';
import { clearApiCache } from './hooks';
import type { Permission, User } from './types';

interface AuthState {
  user: User | null;
  /** Restoring a saved session on page load. */
  loading: boolean;
  /** The saved session couldn't be checked because the server is unreachable (it is kept, not discarded). */
  offline: boolean;
  /** Set when the server rejected a saved session (expired/disabled), so sign-in can explain why. */
  sessionEnded: boolean;
  login: (email: string, password: string) => Promise<void>;
  logout: () => void;
  retry: () => void;
  can: (permission: Permission) => boolean;
}

const AuthContext = createContext<AuthState | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(() => Boolean(tokenStore.get()));
  const [offline, setOffline] = useState(false);
  const [sessionEnded, setSessionEnded] = useState(false);
  const [attempt, setAttempt] = useState(0);

  const logout = useCallback(() => {
    tokenStore.set(null);
    clearApiCache();
    setSessionEnded(false);
    setUser(null);
  }, []);

  // Any 401 mid-session (token expired, account disabled): sign out and say why.
  useEffect(() => {
    setUnauthorizedHandler(() => {
      tokenStore.set(null);
      clearApiCache();
      setUser((u) => { if (u) setSessionEnded(true); return null; });
    });
  }, []);

  // Restore a saved session. Only a real 401 discards the token; if the server is just
  // unreachable (offline, restarting) the session is kept and retried with backoff.
  useEffect(() => {
    if (!tokenStore.get()) { setLoading(false); return; }
    let cancelled = false;
    let timer: ReturnType<typeof setTimeout>;
    const check = (n: number) => {
      api.get<{ user: User }>('/auth/me')
        .then((r) => { if (!cancelled) { setUser(r.user); setOffline(false); setLoading(false); } })
        .catch((e: ApiError) => {
          if (cancelled) return;
          if (e.status === 0) {
            setOffline(true);
            timer = setTimeout(() => check(n + 1), Math.min(1000 * 2 ** n, 10000));
          } else {
            tokenStore.set(null);
            if (e.status === 401) setSessionEnded(true);
            setOffline(false);
            setLoading(false);
          }
        });
    };
    check(0);
    return () => { cancelled = true; clearTimeout(timer); };
  }, [attempt]);

  const login = useCallback(async (email: string, password: string) => {
    const r = await api.post<{ token: string; user: User }>('/auth/login', { email: email.trim(), password });
    tokenStore.set(r.token);
    clearApiCache();
    setSessionEnded(false);
    setOffline(false);
    setUser(r.user);
  }, []);

  const value = useMemo<AuthState>(() => ({
    user,
    loading,
    offline,
    sessionEnded,
    login,
    logout,
    retry: () => setAttempt((a) => a + 1),
    // UI hint only: every permission is enforced again on the server.
    can: (p) => Boolean(user?.permissions?.includes(p)),
  }), [user, loading, offline, sessionEnded, login, logout]);

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used inside AuthProvider');
  return ctx;
}

export function Can({ perm, children, fallback = null }: { perm: Permission; children: ReactNode; fallback?: ReactNode }) {
  return <>{useAuth().can(perm) ? children : fallback}</>;
}
