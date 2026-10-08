"use client";

import { createInstance, type Resource } from "i18next";
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { I18nextProvider, initReactI18next } from "react-i18next";
import { isVoiceGuideId, languageCatalogs, type VoiceGuideId } from "./catalogs";
import { languageMetadata, type LanguageCode } from "./languages";
import {
  createBrowserAccessPreferenceStore,
  DEFAULT_ACCESS_PREFERENCES,
  mergeAccessPreferenceChanges,
  sanitizeAccessPreferences,
  type AccessPreferences,
} from "./preferences";
import { getAllowedVoiceText, selectLanguageVoice, type VoiceDescriptor } from "./speech";

type PreferenceUpdater = <K extends keyof AccessPreferences>(key: K, value: AccessPreferences[K]) => void;
type SpeechState = "checking" | "idle" | "speaking" | "paused" | "unsupported" | "no-match";

interface PreferencesContextValue {
  preferences: AccessPreferences;
  ready: boolean;
  setPreference: PreferenceUpdater;
}

interface VoiceContextValue {
  state: SpeechState;
  voices: readonly VoiceDescriptor[];
  canRepeat: boolean;
  speak(guide: VoiceGuideId): void;
  repeat(): void;
  pause(): void;
  resume(): void;
  stop(): void;
}

const PreferencesContext = createContext<PreferencesContextValue | null>(null);
const VoiceContext = createContext<VoiceContextValue | null>(null);

function createAccessI18n() {
  const resources = Object.fromEntries(
    languageMetadata.map(({ code }) => [code, { console: languageCatalogs[code] }]),
  ) as Resource;
  const instance = createInstance();
  void instance.use(initReactI18next).init({
    resources,
    lng: "en",
    fallbackLng: "en",
    supportedLngs: languageMetadata.map(({ code }) => code),
    ns: ["console"],
    defaultNS: "console",
    initAsync: false,
    interpolation: { escapeValue: false },
    react: { useSuspense: false },
  });
  return instance;
}

export function AccessProvider({ children, navigationKey }: { children: ReactNode; navigationKey?: string }) {
  const [i18n] = useState(createAccessI18n);
  const [preferences, setPreferences] = useState<AccessPreferences>({ ...DEFAULT_ACCESS_PREFERENCES });
  const [ready, setReady] = useState(false);
  const pendingPreferenceChanges = useRef<Partial<AccessPreferences>>({});
  const [voices, setVoices] = useState<readonly SpeechSynthesisVoice[]>([]);
  const [speechState, setSpeechState] = useState<SpeechState>("checking");
  const currentUtterance = useRef<SpeechSynthesisUtterance | null>(null);
  const latestSpeech = useRef(0);
  const lastGuide = useRef<VoiceGuideId | null>(null);

  const cancelCurrentSpeech = useCallback((updateState = true) => {
    latestSpeech.current += 1;
    if (typeof window !== "undefined" && "speechSynthesis" in window) window.speechSynthesis.cancel();
    currentUtterance.current = null;
    if (updateState) setSpeechState("idle");
  }, []);

  useEffect(() => {
    const store = createBrowserAccessPreferenceStore();
    setPreferences(mergeAccessPreferenceChanges(store.load(), pendingPreferenceChanges.current));
    setReady(true);
  }, []);

  useEffect(() => {
    if (!ready) return;
    createBrowserAccessPreferenceStore().save(preferences);
    document.documentElement.lang = preferences.language;
    document.documentElement.dataset.accessHighContrast = String(preferences.highContrast);
    document.documentElement.dataset.accessLargerText = String(preferences.largerText);
    document.documentElement.dataset.accessReducedMotion = String(preferences.reducedMotion);
    void i18n.changeLanguage(preferences.language);
  }, [i18n, preferences, ready]);

  useEffect(() => {
    cancelCurrentSpeech();
  }, [navigationKey, cancelCurrentSpeech]);

  useEffect(() => {
    if (typeof window === "undefined" || !("speechSynthesis" in window) || typeof SpeechSynthesisUtterance === "undefined") {
      setSpeechState("unsupported");
      return;
    }

    const synthesis = window.speechSynthesis;
    const updateVoices = () => {
      setVoices(synthesis.getVoices());
    };
    updateVoices();
    synthesis.addEventListener("voiceschanged", updateVoices);
    return () => {
      synthesis.removeEventListener("voiceschanged", updateVoices);
      cancelCurrentSpeech(false);
    };
  }, [cancelCurrentSpeech]);

  useEffect(() => {
    if (speechState === "unsupported" || speechState === "speaking" || speechState === "paused") return;
    setSpeechState(selectLanguageVoice(voices, preferences.language, preferences.voiceURI) ? "idle" : "no-match");
  }, [preferences.language, preferences.voiceURI, speechState, voices]);

  const setPreference: PreferenceUpdater = useCallback((key, value) => {
    if (!ready) pendingPreferenceChanges.current = { ...pendingPreferenceChanges.current, [key]: value };
    if (key === "language") {
      cancelCurrentSpeech();
      document.documentElement.lang = value as LanguageCode;
      void i18n.changeLanguage(value as LanguageCode);
    }
    if (key === "voiceEnabled" && value === false) cancelCurrentSpeech();
    setPreferences((current) => sanitizeAccessPreferences({ ...current, [key]: value }));
  }, [cancelCurrentSpeech, i18n, ready]);

  const speak = useCallback((guide: VoiceGuideId) => {
    if (!isVoiceGuideId(guide)) {
      setSpeechState("idle");
      return;
    }
    if (!preferences.voiceEnabled) {
      setSpeechState("idle");
      return;
    }
    if (typeof window === "undefined" || !("speechSynthesis" in window) || typeof SpeechSynthesisUtterance === "undefined") {
      setSpeechState("unsupported");
      return;
    }
    const synthesis = window.speechSynthesis;
    const selectedVoice = selectLanguageVoice(synthesis.getVoices(), preferences.language, preferences.voiceURI);
    if (!selectedVoice) {
      synthesis.cancel();
      setSpeechState("no-match");
      return;
    }

    synthesis.cancel();
    const sequence = ++latestSpeech.current;
    const utterance = new SpeechSynthesisUtterance(getAllowedVoiceText(preferences.language, guide));
    utterance.voice = selectedVoice;
    utterance.lang = selectedVoice.lang;
    utterance.rate = preferences.rate;
    utterance.onstart = () => { if (latestSpeech.current === sequence) setSpeechState("speaking"); };
    utterance.onend = () => { if (latestSpeech.current === sequence) { currentUtterance.current = null; setSpeechState("idle"); } };
    utterance.onerror = () => { if (latestSpeech.current === sequence) { currentUtterance.current = null; setSpeechState("idle"); } };
    currentUtterance.current = utterance;
    lastGuide.current = guide;
    setSpeechState("speaking");
    synthesis.speak(utterance);
  }, [preferences]);

  const repeat = useCallback(() => {
    if (lastGuide.current) speak(lastGuide.current);
  }, [speak]);
  const pause = useCallback(() => {
    if (typeof window !== "undefined" && "speechSynthesis" in window && window.speechSynthesis.speaking) {
      window.speechSynthesis.pause();
      setSpeechState("paused");
    }
  }, []);
  const resume = useCallback(() => {
    if (typeof window !== "undefined" && "speechSynthesis" in window && window.speechSynthesis.paused) {
      window.speechSynthesis.resume();
      setSpeechState("speaking");
    }
  }, []);
  const stop = useCallback(() => cancelCurrentSpeech(), [cancelCurrentSpeech]);

  const preferencesValue = useMemo(() => ({ preferences, ready, setPreference }), [preferences, ready, setPreference]);
  const voiceValue = useMemo<VoiceContextValue>(() => ({
    state: speechState,
    voices,
    canRepeat: lastGuide.current !== null,
    speak,
    repeat,
    pause,
    resume,
    stop,
  }), [pause, repeat, resume, speak, speechState, stop, voices]);

  return (
    <I18nextProvider i18n={i18n} defaultNS="console">
      <PreferencesContext.Provider value={preferencesValue}>
        <VoiceContext.Provider value={voiceValue}>{children}</VoiceContext.Provider>
      </PreferencesContext.Provider>
    </I18nextProvider>
  );
}

export function useAccessPreferences(): PreferencesContextValue {
  const context = useContext(PreferencesContext);
  if (!context) throw new Error("useAccessPreferences must be used inside AccessProvider");
  return context;
}

export function useAccessVoice(): VoiceContextValue {
  const context = useContext(VoiceContext);
  if (!context) throw new Error("useAccessVoice must be used inside AccessProvider");
  return context;
}
