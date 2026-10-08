"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import type { ActionIdentifier, ApplicationInput, PolicyMode } from "@sentriq/shared";
import { createLocalDemoAdapter, type LocalDemoAdapter } from "./demo-adapter";
import { INITIAL_DEMO_STATE, type ConsoleDemoState } from "./demo-data";

type NoticeKind = "success" | "error" | "info";
interface DemoContextValue {
  data: ConsoleDemoState;
  ready: boolean;
  adapter: LocalDemoAdapter;
  notice: { text: string; kind: NoticeKind } | null;
  notify(text: string, kind?: NoticeKind): void;
  dismissNotice(): void;
  createApplication(input: ApplicationInput): void;
  createApiKey(input: { applicationId: string; name: string; scopes: string[] }): void;
  revealApiKey(id: string): void;
  revokeApiKey(id: string): void;
  setProtectedAction(input: { actionId: ActionIdentifier; enabled: boolean; description: string }): void;
  savePolicy(input: { actionId: ActionIdentifier; mode: PolicyMode; enabled: boolean }): void;
  revokeSession(id: string): void;
  createSuggestion(input: { actionId: ActionIdentifier; citedEventIds: string[] }): void;
  confirmSuggestion(id: string): void;
  dismissSuggestion(id: string): void;
  saveSettings(settings: ConsoleDemoState["settings"]): void;
  reset(): void;
}

const DemoContext = createContext<DemoContextValue | null>(null);

export function DemoProvider({ children }: { children: ReactNode }) {
  const adapter = useMemo(() => createLocalDemoAdapter(), []);
  const [data, setData] = useState<ConsoleDemoState>(INITIAL_DEMO_STATE);
  const [ready, setReady] = useState(false);
  const [notice, setNotice] = useState<DemoContextValue["notice"]>(null);

  useEffect(() => {
    setData(adapter.load());
    setReady(true);
  }, [adapter]);

  const update = useCallback((operation: (current: ConsoleDemoState) => ConsoleDemoState) => {
    setData((current) => {
      const next = operation(current);
      adapter.save(next);
      return next;
    });
  }, [adapter]);
  const notify = useCallback((text: string, kind: NoticeKind = "success") => setNotice({ text, kind }), []);
  const dismissNotice = useCallback(() => setNotice(null), []);
  const createApplication: DemoContextValue["createApplication"] = (input) => update((current) => adapter.createApplication(current, input).state);
  const createApiKey: DemoContextValue["createApiKey"] = (input) => update((current) => adapter.createApiKey(current, input));
  const revealApiKey: DemoContextValue["revealApiKey"] = (id) => update((current) => adapter.revealApiKey(current, id));
  const revokeApiKey: DemoContextValue["revokeApiKey"] = (id) => update((current) => adapter.revokeApiKey(current, id));
  const setProtectedAction: DemoContextValue["setProtectedAction"] = (input) => update((current) => adapter.setProtectedAction(current, input));
  const savePolicy: DemoContextValue["savePolicy"] = (input) => update((current) => adapter.savePolicy(current, input));
  const revokeSession: DemoContextValue["revokeSession"] = (id) => update((current) => adapter.revokeSession(current, id));
  const createSuggestion: DemoContextValue["createSuggestion"] = (input) => update((current) => adapter.createSuggestion(current, input));
  const confirmSuggestion: DemoContextValue["confirmSuggestion"] = (id) => update((current) => adapter.confirmSuggestion(current, id));
  const dismissSuggestion: DemoContextValue["dismissSuggestion"] = (id) => update((current) => adapter.dismissSuggestion(current, id));
  const saveSettings: DemoContextValue["saveSettings"] = (settings) => update((current) => adapter.saveSettings(current, settings));
  const reset = useCallback(() => {
    setData(adapter.reset());
    setNotice({ text: "Sample data restored to its starting state.", kind: "success" });
  }, [adapter]);

  const value: DemoContextValue = {
    data,
    ready,
    adapter,
    notice,
    notify,
    dismissNotice,
    createApplication,
    createApiKey,
    revealApiKey,
    revokeApiKey,
    setProtectedAction,
    savePolicy,
    revokeSession,
    createSuggestion,
    confirmSuggestion,
    dismissSuggestion,
    saveSettings,
    reset,
  };

  return <DemoContext.Provider value={value}>{children}</DemoContext.Provider>;
}

export function useDemo(): DemoContextValue {
  const context = useContext(DemoContext);
  if (!context) throw new Error("useDemo must be used inside DemoProvider");
  return context;
}
