"use client";

import { useState } from "react";
import { useTranslation } from "react-i18next";
import { languageMetadata } from "./languages";
import { useAccessPreferences, useAccessVoice } from "./provider";
import type { VoiceGuideId } from "./catalogs";

export function AccessLanguageSelect({ id = "access-language" }: { id?: string }) {
  const { t } = useTranslation("console");
  const { preferences, ready, setPreference } = useAccessPreferences();
  return (
    <div className="access-field">
      <label htmlFor={id}>{t("settings.language")}</label>
      <select id={id} value={preferences.language} disabled={!ready} onChange={(event) => setPreference("language", event.target.value as typeof preferences.language)}>
        {languageMetadata.map((language) => <option key={language.code} value={language.code}>{language.nativeName} — {language.name}</option>)}
      </select>
      <p>{t("settings.languageHint")}</p>
    </div>
  );
}

const guideIds: readonly VoiceGuideId[] = ["authPreview", "accessPreview", "keyboardGuide", "formErrors"];

export function AccessPreferencesPanel() {
  const { t } = useTranslation("console");
  const { preferences, ready, setPreference } = useAccessPreferences();
  const voice = useAccessVoice();
  const [guide, setGuide] = useState<VoiceGuideId>("accessPreview");
  const matchingVoices = voice.voices.filter((item) => item.lang.toLowerCase().replaceAll("_", "-").startsWith(preferences.language));

  const voiceStatus = !preferences.voiceEnabled
    ? t("settings.voiceDisabledStatus")
    : voice.state === "unsupported"
    ? t("settings.voiceStatusUnsupported")
    : voice.state === "no-match"
      ? t("settings.voiceStatusNoMatch")
      : voice.state === "speaking"
        ? t("settings.voiceStatusSpeaking")
        : voice.state === "paused"
          ? t("settings.voiceStatusPaused")
          : t("settings.voiceStatusIdle");

  return (
    <section className="access-preferences" aria-labelledby="access-preferences-title" aria-busy={!ready}>
      <header className="access-preferences__header">
        <div>
          <p className="access-preferences__eyebrow">{t("common.localOnly")}</p>
          <h2 id="access-preferences-title">{t("settings.preferenceTitle")}</h2>
          <p>{t("settings.preferenceDescription")}</p>
        </div>
      </header>

      <div className="access-preferences__grid">
        <AccessLanguageSelect id="settings-language" />
        <div className="access-field">
          <label htmlFor="settings-voice">{t("settings.voice")}</label>
          <select id="settings-voice" value={preferences.voiceURI} disabled={!ready || voice.state === "unsupported" || matchingVoices.length === 0} onChange={(event) => setPreference("voiceURI", event.target.value)}>
            <option value="">{t("settings.systemVoice")}</option>
            {matchingVoices.map((item) => <option key={item.voiceURI} value={item.voiceURI}>{item.name} ({item.lang})</option>)}
          </select>
          <p>{voice.state === "unsupported" ? t("settings.voiceUnavailable") : matchingVoices.length === 0 ? t("settings.voiceNoMatching") : t("settings.voiceHint")}</p>
        </div>
        <div className="access-field">
          <label htmlFor="settings-rate">{t("settings.voiceRate")}: <output htmlFor="settings-rate">{preferences.rate.toFixed(1)}×</output></label>
          <input id="settings-rate" type="range" min="0.8" max="1.2" step="0.1" value={preferences.rate} disabled={!ready} onChange={(event) => setPreference("rate", Number(event.target.value))} />
          <p>{t("settings.voiceRateHint")}</p>
        </div>
      </div>

      <div className="access-preferences__switches">
        <PreferenceToggle id="settings-voice-enabled" checked={preferences.voiceEnabled} disabled={!ready} label={t("settings.voiceEnabled")} description={t("settings.voiceEnabledHint")} onChange={(value) => setPreference("voiceEnabled", value)} />
        <PreferenceToggle id="settings-contrast" checked={preferences.highContrast} disabled={!ready} label={t("settings.highContrast")} description={t("settings.highContrastHint")} onChange={(value) => setPreference("highContrast", value)} />
        <PreferenceToggle id="settings-larger-text" checked={preferences.largerText} disabled={!ready} label={t("settings.largerText")} description={t("settings.largerTextHint")} onChange={(value) => setPreference("largerText", value)} />
        <PreferenceToggle id="settings-motion" checked={preferences.reducedMotion} disabled={!ready} label={t("settings.reducedMotion")} description={t("settings.reducedMotionHint")} onChange={(value) => setPreference("reducedMotion", value)} />
        <PreferenceToggle id="settings-keyboard-guide" checked={preferences.keyboardGuide} disabled={!ready} label={t("settings.keyboardGuide")} description={t("settings.keyboardGuideHint")} onChange={(value) => setPreference("keyboardGuide", value)} />
      </div>

      {preferences.keyboardGuide && (
        <div className="access-keyboard-guide" role="note" aria-labelledby="keyboard-guide-title">
          <h3 id="keyboard-guide-title">{t("settings.keyboardGuideTitle")}</h3>
          <ul><li>{t("settings.keyboardTab")}</li><li>{t("settings.keyboardActivate")}</li><li>{t("settings.keyboardEscape")}</li></ul>
        </div>
      )}

      <section className="access-voice-tools" aria-labelledby="voice-guidance-title">
        <h3 id="voice-guidance-title">{t("settings.voiceGuidanceTitle")}</h3>
        <p>{t("settings.voiceGuidanceDescription")}</p>
        <div className="access-voice-tools__controls">
          <div className="access-field access-field--guide">
            <label htmlFor="voice-guide-choice">{t("settings.voiceGuideChoice")}</label>
            <select id="voice-guide-choice" value={guide} disabled={!ready} onChange={(event) => setGuide(event.target.value as VoiceGuideId)}>
              {guideIds.map((id) => <option key={id} value={id}>{t(`settings.voiceGuide${id === "authPreview" ? "Auth" : id === "accessPreview" ? "Access" : id === "keyboardGuide" ? "Keyboard" : "Error"}`)}</option>)}
            </select>
          </div>
          <div className="access-voice-tools__buttons">
            <button className="access-button access-button--primary" type="button" onClick={() => voice.speak(guide)} disabled={!ready || !preferences.voiceEnabled}>{t("settings.speakGuide")}</button>
            <button className="access-button" type="button" onClick={voice.repeat} disabled={!ready || !preferences.voiceEnabled || !voice.canRepeat}>{t("settings.repeatGuide")}</button>
            <button className="access-button" type="button" onClick={voice.pause} disabled={!ready || voice.state !== "speaking"}>{t("settings.pauseSpeech")}</button>
            <button className="access-button" type="button" onClick={voice.resume} disabled={!ready || voice.state !== "paused"}>{t("settings.resumeSpeech")}</button>
            <button className="access-button" type="button" onClick={voice.stop} disabled={!ready || voice.state !== "speaking" && voice.state !== "paused"}>{t("settings.stopSpeech")}</button>
          </div>
        </div>
        <p className="access-voice-tools__status" role="status" aria-live="polite">{voiceStatus}</p>
      </section>

      <aside className="access-privacy-note" role="note">
        <h3>{t("settings.privacyTitle")}</h3>
        <p>{t("settings.privacyDescription")}</p>
        <p>{t("settings.translationNotice")}</p>
      </aside>
    </section>
  );
}

function PreferenceToggle({ id, checked, disabled, label, description, onChange }: { id: string; checked: boolean; disabled: boolean; label: string; description: string; onChange(value: boolean): void }) {
  return (
    <div className="access-toggle">
      <div><label htmlFor={id}>{label}</label><p>{description}</p></div>
      <input id={id} type="checkbox" checked={checked} disabled={disabled} onChange={(event) => onChange(event.target.checked)} />
    </div>
  );
}
