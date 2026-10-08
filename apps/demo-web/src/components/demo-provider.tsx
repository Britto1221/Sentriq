"use client";

import { createContext, useContext, useEffect, useMemo, useState } from "react";
import type { ReactNode } from "react";
import { northstarAuth, type AuthenticatedUser } from "@/lib/auth-client";

interface DemoContextValue {
  authenticatedUser: AuthenticatedUser | null;
  authenticationLoading: boolean;
  refreshSession: () => Promise<void>;
  signOut: () => Promise<void>;
}

const DemoContext = createContext<DemoContextValue | null>(null);

export function DemoProvider({ children }: { children: ReactNode }) {
  const [authenticatedUser, setAuthenticatedUser] = useState<AuthenticatedUser | null>(null);
  const [authenticationLoading, setAuthenticationLoading] = useState(true);

  useEffect(() => {
    let active = true;
    void northstarAuth.session().then((session) => {
      if (active) setAuthenticatedUser(session.user);
    }).catch(() => {
      if (active) setAuthenticatedUser(null);
    }).finally(() => {
      if (active) setAuthenticationLoading(false);
    });
    return () => { active = false; };
  }, []);

  const refreshSession = async () => {
    setAuthenticationLoading(true);
    try { setAuthenticatedUser((await northstarAuth.session()).user); }
    catch { setAuthenticatedUser(null); }
    finally { setAuthenticationLoading(false); }
  };

  const signOut = async () => {
    await northstarAuth.logout();
    setAuthenticatedUser(null);
  };

  const value = useMemo(() => ({ authenticatedUser, authenticationLoading, refreshSession, signOut }),
    [authenticatedUser, authenticationLoading]);
  return <DemoContext.Provider value={value}>{children}</DemoContext.Provider>;
}

export function useDemo(): DemoContextValue {
  const value = useContext(DemoContext);
  if (!value) throw new Error("useDemo must be used inside DemoProvider.");
  return value;
}
