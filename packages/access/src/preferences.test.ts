import { describe, expect, it } from "vitest";
import {
  ACCESS_PREFERENCES_STORAGE_KEY,
  DEFAULT_ACCESS_PREFERENCES,
  createAccessPreferenceStore,
  mergeAccessPreferenceChanges,
  sanitizeAccessPreferences,
} from "./preferences";

describe("access preference storage", () => {
  it("stores only the allowlisted non-sensitive display preferences", () => {
    let storedKey = "";
    let storedValue = "";
    const store = createAccessPreferenceStore({
      getItem: () => null,
      setItem: (key, value) => { storedKey = key; storedValue = value; },
    });
    store.save({
      ...DEFAULT_ACCESS_PREFERENCES,
      language: "ta",
      email: "developer@sentriq.test",
      password: "never persist",
      apiKey: "never persist",
      recoveryCode: "never persist",
    });

    expect(storedKey).toBe(ACCESS_PREFERENCES_STORAGE_KEY);
    expect(JSON.parse(storedValue)).toEqual({ ...DEFAULT_ACCESS_PREFERENCES, language: "ta" });
    expect(storedValue).not.toMatch(/email|password|apiKey|recoveryCode|never persist/i);
  });

  it("rejects unsupported languages and clamps speech rates to the UI range", () => {
    expect(sanitizeAccessPreferences({ language: "fr", rate: 8 })).toEqual({
      ...DEFAULT_ACCESS_PREFERENCES,
      rate: 1.2,
    });
  });

  it("keeps spoken guidance disabled by default until a user enables it", () => {
    expect(DEFAULT_ACCESS_PREFERENCES.voiceEnabled).toBe(false);
    expect(sanitizeAccessPreferences({ voiceEnabled: "true" }).voiceEnabled).toBe(false);
    expect(sanitizeAccessPreferences({ voiceEnabled: true }).voiceEnabled).toBe(true);
  });

  it("keeps user changes made before stored preferences finish loading", () => {
    const pending = { voiceEnabled: true, language: "ta" as const };
    expect(mergeAccessPreferenceChanges({ voiceEnabled: false, language: "hi" }, pending)).toEqual({
      ...DEFAULT_ACCESS_PREFERENCES,
      voiceEnabled: true,
      language: "ta",
    });
  });

  it("falls back safely when stored JSON is malformed", () => {
    const store = createAccessPreferenceStore({ getItem: () => "{broken", setItem: () => undefined });
    expect(store.load()).toEqual(DEFAULT_ACCESS_PREFERENCES);
  });
});
