import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { doc, onSnapshot } from 'firebase/firestore';
import { auth, db } from '../lib/firebase';
import { hasPermission } from '../lib/permissions';
import type { AppUser, Permission } from '../types';
import { COL } from '../services/db';
import { fetchProfile, isBootstrapped, login as doLogin, logout as doLogout, watchAuth } from '../services/auth';

interface AuthState {
  user: AppUser | null;
  loading: boolean;
  bootstrapped: boolean | null;
  /** Firebase-ის კონფიგურაციის პრობლემა (rules/auth ჯერ არ არის ჩართული). */
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
    } catch (err) {
      // ვერ მივწვდით `meta/bootstrap`-ს — ყველაზე ხშირი მიზეზი ისაა, რომ
      // Firestore Security Rules ჯერ არ არის deploy-ებული.
      setBootstrapped(true);
      setConfigError(
        (err as { code?: string })?.code === 'permission-denied'
          ? 'მონაცემთა ბაზასთან წვდომა შეზღუდულია — გთხოვთ, დააყენოთ Firestore Security Rules (firebase deploy --only firestore:rules). დეტალები README-ში.'
          : 'მონაცემთა ბაზასთან კავშირი ვერ დამყარდა. შეამოწმეთ Firebase-ის კონფიგურაცია.'
      );
    }
  }, []);

  useEffect(() => {
    void refreshBootstrap();
  }, [refreshBootstrap]);

  useEffect(() => {
    const unsub = watchAuth(async (fbUser) => {
      if (!fbUser) {
        setUser(null);
        setLoading(false);
        return;
      }
      try {
        const profile = await fetchProfile(fbUser.uid);
        setUser(profile && profile.status === 'active' ? profile : null);
        if (profile && profile.status !== 'active') await doLogout(null);
      } catch {
        setUser(null);
      } finally {
        setLoading(false);
      }
    });
    return unsub;
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
          void doLogout(null);
          setUser(null);
          return;
        }
        setUser(next);
      },
      () => undefined
    );
    return unsub;
  }, [user?.id]);

  const login = useCallback(async (username: string, password: string) => {
    setLoading(true);
    try {
      const profile = await doLogin(username, password);
      setUser(profile);
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

export { auth };
