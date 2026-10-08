import { isLanguageCode, type LanguageCode } from "./languages";

export const ACCESS_PREFERENCES_STORAGE_KEY = "sentriq.access.preferences.v1";

export interface AccessPreferences {
  language: LanguageCode;
  voiceURI: string;
  rate: number;
  voiceEnabled: boolean;
  highContrast: boolean;
  largerText: boolean;
  reducedMotion: boolean;
  keyboardGuide: boolean;
}

export const DEFAULT_ACCESS_PREFERENCES: Readonly<AccessPreferences> = Object.freeze({
  language: "en",
  voiceURI: "",
  rate: 1,
  voiceEnabled: false,
  highContrast: false,
  largerText: false,
  reducedMotion: false,
  keyboardGuide: false,
});

const preferenceKeys = ["language", "voiceURI", "rate", "voiceEnabled", "highContrast", "largerText", "reducedMotion", "keyboardGuide"] as const;

export function sanitizeAccessPreferences(value: unknown): AccessPreferences {
  if (!value || typeof value !== "object" || Array.isArray(value)) return { ...DEFAULT_ACCESS_PREFERENCES };
  const input = value as Record<string, unknown>;
  const voiceURI = typeof input.voiceURI === "string" && input.voiceURI.length <= 256 ? input.voiceURI : "";
  const rate = typeof input.rate === "number" && Number.isFinite(input.rate)
    ? Math.min(1.2, Math.max(0.8, input.rate))
    : DEFAULT_ACCESS_PREFERENCES.rate;

  return {
    language: isLanguageCode(input.language) ? input.language : DEFAULT_ACCESS_PREFERENCES.language,
    voiceURI,
    rate,
    voiceEnabled: input.voiceEnabled === true,
    highContrast: input.highContrast === true,
    largerText: input.largerText === true,
    reducedMotion: input.reducedMotion === true,
    keyboardGuide: input.keyboardGuide === true,
  };
}

/** Stored values seed the controls, while an interaction before hydration wins for that key. */
export function mergeAccessPreferenceChanges(stored: unknown, pending: Partial<AccessPreferences>): AccessPreferences {
  return sanitizeAccessPreferences({ ...sanitizeAccessPreferences(stored), ...pending });
}

export interface AccessPreferenceStorage {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
}

export function serializeAccessPreferences(value: unknown): string {
  const preferences = sanitizeAccessPreferences(value);
  return JSON.stringify(Object.fromEntries(preferenceKeys.map((key) => [key, preferences[key]])));
}

export function createAccessPreferenceStore(storage: AccessPreferenceStorage) {
  return {
    load(): AccessPreferences {
      try {
        const raw = storage.getItem(ACCESS_PREFERENCES_STORAGE_KEY);
        return raw ? sanitizeAccessPreferences(JSON.parse(raw)) : { ...DEFAULT_ACCESS_PREFERENCES };
      } catch {
        return { ...DEFAULT_ACCESS_PREFERENCES };
      }
    },
    save(value: unknown): void {
      storage.setItem(ACCESS_PREFERENCES_STORAGE_KEY, serializeAccessPreferences(value));
    },
  };
}

export function createBrowserAccessPreferenceStore() {
  if (typeof window === "undefined") return createAccessPreferenceStore({ getItem: () => null, setItem: () => undefined });
  return createAccessPreferenceStore({
    getItem(key) {
      try { return window.localStorage.getItem(key); } catch { return null; }
    },
    setItem(key, value) {
      try { window.localStorage.setItem(key, value); } catch { /* Preferences stay usable if storage is unavailable. */ }
    },
  });
}
