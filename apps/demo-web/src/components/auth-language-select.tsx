"use client";

import { useEffect } from "react";
import { useAccessPreferences, useTranslation, type LanguageCode } from "@sentriq/access";

export function AuthLanguageSelect({ id }: { id: string }) {
  const { t } = useTranslation("console");
  const { preferences, ready, setPreference } = useAccessPreferences();

  useEffect(() => {
    document.documentElement.lang = preferences.language;
  }, [preferences.language]);

  return (
    <div className="form-field access-field auth-language-select">
      <label htmlFor={id}>{t("settings.language")}</label>
      <select id={id} value={preferences.language} disabled={!ready}
        onChange={(event) => setPreference("language", event.currentTarget.value as LanguageCode)}>
        <option value="en">English</option>
        <option value="ta">தமிழ்</option>
      </select>
    </div>
  );
}
