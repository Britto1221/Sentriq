"use client";

import { useCallback, useEffect, useState } from "react";

export type QueryStatus = "loading" | "ready" | "error";

export interface AsyncQuery<T> {
  status: QueryStatus;
  data: T | null;
  error: string | null;
  reload: () => void;
}

export function useAsyncQuery<T>(load: () => Promise<T>, enabled = true): AsyncQuery<T> {
  const [status, setStatus] = useState<QueryStatus>("loading");
  const [data, setData] = useState<T | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [attempt, setAttempt] = useState(0);
  const reload = useCallback(() => setAttempt((value) => value + 1), []);

  useEffect(() => {
    let current = true;
    if (!enabled) {
      setStatus("loading");
      setData(null);
      setError(null);
      return () => { current = false; };
    }
    setStatus("loading");
    setData(null);
    setError(null);
    load().then((nextData) => {
      if (!current) return;
      setData(nextData);
      setStatus("ready");
    }).catch((caught) => {
      if (!current) return;
      setError(caught instanceof Error ? caught.message : "Sample data could not be loaded.");
      setStatus("error");
    });
    return () => {
      current = false;
    };
  }, [attempt, enabled, load]);

  return { status, data, error, reload };
}
