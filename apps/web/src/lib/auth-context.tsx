'use client';

import { createContext, useContext, useEffect, useRef, useState } from 'react';
import api from './api-client';
import { panelRoleOf, homeFor, type PanelRole } from './roles';

export interface AuthUser {
  id: string;
  email: string;
  firstName: string;
  lastName: string;
  organizationId: string;
  clientId?: string | null;
  departmentId?: string | null;
  roles: string[];
  primaryRole: string;
}

interface AuthContextType {
  user: AuthUser | null;
  role: PanelRole;
  isAuthenticated: boolean;
  isLoading: boolean;
  login: (token: string, user: AuthUser) => Promise<void>;
  logout: () => void;
  hasRole: (...names: string[]) => boolean;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

function toAuthUser(raw: any): AuthUser {
  // /auth/login returns `roles` as names; /users/me returns join rows in `roles` and names in `roleNames`.
  const source: any[] = raw.roleNames ?? raw.roles ?? [];
  const roles: string[] = source
    .map((r) => (typeof r === 'string' ? r : r?.role?.name ?? r?.name))
    .filter((r): r is string => typeof r === 'string');
  return {
    id: raw.id,
    email: raw.email,
    firstName: raw.firstName,
    lastName: raw.lastName,
    organizationId: raw.organizationId,
    clientId: raw.clientId ?? null,
    departmentId: raw.departmentId ?? null,
    roles,
    primaryRole: raw.primaryRole ?? roles[0] ?? 'Employee',
  };
}

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const authCheckStarted = useRef(false);

  useEffect(() => {
    if (authCheckStarted.current) return;
    authCheckStarted.current = true;

    const checkAuth = async () => {
      const token = localStorage.getItem('auth_token');
      if (token) {
        try {
          const { data } = await api.get('/users/me');
          const u = toAuthUser(data);
          setUser(u);
          localStorage.setItem('auth_user', JSON.stringify(u));
        } catch {
          localStorage.removeItem('auth_token');
          localStorage.removeItem('auth_user');
          setUser(null);
        }
      }
      setIsLoading(false);
    };
    checkAuth();
  }, []);

  const login = async (token: string, rawUser: AuthUser) => {
    localStorage.setItem('auth_token', token);
    const u = toAuthUser(rawUser);
    setUser(u);
    localStorage.setItem('auth_user', JSON.stringify(u));
  };

  const logout = () => {
    localStorage.removeItem('auth_token');
    localStorage.removeItem('auth_user');
    setUser(null);
    window.location.href = '/login';
  };

  const hasRole = (...names: string[]) => names.some((n) => user?.roles.includes(n));
  const role = panelRoleOf(user?.roles, user?.primaryRole);
  const isAuthenticated = !!user;

  return (
    <AuthContext.Provider value={{ user, role, isAuthenticated, isLoading, login, logout, hasRole }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
}

export function useHomePath() {
  const { role } = useAuth();
  return homeFor(role);
}
