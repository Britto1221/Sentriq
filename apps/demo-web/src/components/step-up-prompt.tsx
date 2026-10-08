"use client";

import { useState } from "react";
import { startAuthentication } from "@sentriq/browser";
import { useAccessPreferences, useAccessVoice, useTranslation } from "@sentriq/access";
import { Button, InlineStatus, Panel } from "@/components/primitives";
import { northstarProtected } from "@/lib/auth-client";

export function StepUpPrompt({ challengeId, actionId, onVerified }: {
  challengeId: string;
  actionId: "data.export" | "account.delete" | "session.revoke" | "passkey.remove";
  onVerified: () => Promise<void>;
}) {
  const { t } = useTranslation("console");
  const { preferences } = useAccessPreferences();
  const voice = useAccessVoice();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function verify() {
    setBusy(true); setError(null);
    try {
      const ceremony = await northstarProtected.stepUpOptions(challengeId);
      const response = await startAuthentication({
        optionsJSON: ceremony.options as Parameters<typeof startAuthentication>[0]["optionsJSON"],
      });
      await northstarProtected.verifyStepUp({ actionId, challengeId, response });
      await onVerified();
    } catch {
      setError(t("auth.live.genericFailure"));
      if (preferences.voiceEnabled) voice.speak("authError");
    } finally { setBusy(false); }
  }

  return <Panel className="step-up-prompt" aria-busy={busy}>
    <p className="panel-kicker">{t("auth.live.stepUpTitle")}</p>
    <h2>{t("auth.live.stepUpTitle")}</h2>
    <p className="body-copy">{t("auth.live.stepUpIntro")}</p>
    {error ? <InlineStatus kind="error">{error}</InlineStatus> : null}
    <Button type="button" disabled={busy} onClick={() => void verify()}>
      {busy ? t("auth.live.working") : t("auth.live.stepUpButton")}
    </Button>
  </Panel>;
}
