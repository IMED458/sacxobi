import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { doc, onSnapshot } from 'firebase/firestore';
import { db } from '../lib/firebase';
import { hasPermission } from '../lib/permissions';
import type { AppUser, Permission } from '../types';
import { COL } from '../services/db';
import {
  clearSession,
  fetchProfile,
  isBootstrapped,
  login as doLogin,
  logout as doLogout,
  readSession,
  stripSecret
} from '../services/auth';

interface AuthState {
  user: AppUser | null;
  loading: boolean;
  bootstrapped: boolean | null;
  /** ბაზასთან კავშირის პრობლემა. */
  configError: string | null;
  login: (username: string, password: string) => Promise<void>;
  logout: () => Promise<void>;
  refreshBootstrap: () => Promise<void>;
  can: (permission: Permission) => boolean;
}

const AuthContext = createContext<AuthState | null>(null);

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [user, setUser] = useState<AppUser | null>(null);
  const [loading, setLoading] = useState(true);
  const [bootstrapped, setBootstrapped] = useState<boolean | null>(null);
  const [configError, setConfigError] = useState<string | null>(null);

  const refreshBootstrap = useCallback(async () => {
    try {
      setBootstrapped(await isBootstrapped());
      setConfigError(null);
    } catch {
      setBootstrapped(true);
      setConfigError('მონაცემთა ბაზასთან კავშირი ვერ დამყარდა — შეამოწმეთ ინტერნეტი და Firebase-ის კონფიგურაცია.');
    }
  }, []);

  useEffect(() => {
    void refreshBootstrap();
  }, [refreshBootstrap]);

  // შენახული სესიის აღდგენა გვერდის განახლების შემდეგ.
  useEffect(() => {
    const userId = readSession();
    if (!userId) {
      setLoading(false);
      return;
    }
    let cancelled = false;
    fetchProfile(userId)
      .then((profile) => {
        if (cancelled) return;
        if (profile && profile.status === 'active') setUser(stripSecret(profile));
        else clearSession();
      })
      .catch(() => clearSession())
      .finally(() => !cancelled && setLoading(false));
    return () => {
      cancelled = true;
    };
  }, []);

  // პროფილის ცოცხალი თვალყური — უფლებების/სტატუსის ცვლილება მაშინვე მოქმედებს.
  useEffect(() => {
    if (!user?.id) return;
    const unsub = onSnapshot(
      doc(db, COL.users, user.id),
      (snap) => {
        if (!snap.exists()) return;
        const next = snap.data() as AppUser;
        if (next.status !== 'active') {
          clearSession();
          setUser(null);
          return;
        }
        setUser(stripSecret(next));
      },
      () => undefined
    );
    return unsub;
  }, [user?.id]);

  const login = useCallback(async (username: string, password: string) => {
    setLoading(true);
    try {
      setUser(await doLogin(username, password));
    } finally {
      setLoading(false);
    }
  }, []);

  const logout = useCallback(async () => {
    await doLogout(user);
    setUser(null);
  }, [user]);

  const value = useMemo<AuthState>(
    () => ({
      user,
      loading,
      bootstrapped,
      configError,
      login,
      logout,
      refreshBootstrap,
      can: (permission: Permission) => hasPermission(user, permission)
    }),
    [user, loading, bootstrapped, configError, login, logout, refreshBootstrap]
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
};

export function useAuth(): AuthState {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth უნდა გამოიყენოთ AuthProvider-ის შიგნით');
  return ctx;
}
