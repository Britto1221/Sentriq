"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import type { FormEvent } from "react";
import { startRegistration } from "@sentriq/browser";
import { useAccessPreferences, useAccessVoice, useTranslation } from "@sentriq/access";
import { AuthLanguageSelect } from "@/components/auth-language-select";
import { Button, InlineStatus } from "@/components/primitives";
import { RecoveryAssistant } from "@/components/recovery-assistant";
import { northstarAuth, NorthstarAuthError } from "@/lib/auth-client";

type RecoveryPhase = "identify" | "verify" | "enroll" | "complete";

export function RecoveryFlow() {
  const { t } = useTranslation("console");
  const { preferences, ready, setPreference } = useAccessPreferences();
  const voice = useAccessVoice();
  const [phase, setPhase] = useState<RecoveryPhase>("identify");
  const [email, setEmail] = useState("");
  const [recoveryCode, setRecoveryCode] = useState("");
  const [recoveryCodes, setRecoveryCodes] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState<{ kind: "error" | "success"; message: string } | null>(null);
  const [savedCodes, setSavedCodes] = useState(false);

  useEffect(() => { document.documentElement.lang = preferences.language; }, [preferences.language]);

  function failureCopy(error: unknown): string {
    return error instanceof NorthstarAuthError && error.code === "RATE_LIMITED" ? t("auth.live.rateLimited") : t("auth.live.genericFailure");
  }

  async function start(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); setBusy(true); setStatus(null);
    try {
      await northstarAuth.reclaimStart({ email: email.trim().toLowerCase() });
      setPhase("verify");
      setStatus({ kind: "success", message: t("auth.live.recoveryRequestAccepted") });
    } catch (error) {
      setStatus({ kind: "error", message: failureCopy(error) });
    } finally { setBusy(false); }
  }

  async function verifyCode(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true); setStatus(null);
    try {
      await northstarAuth.reclaimVerify({ email: email.trim().toLowerCase(), recoveryCode });
      setRecoveryCode("");
      setPhase("enroll");
      setStatus({ kind: "success", message: t("auth.live.recoveryReplacementIntro") });
    } catch (error) {
      setStatus({ kind: "error", message: failureCopy(error) });
      if (preferences.voiceEnabled) voice.speak("authError");
    } finally { setBusy(false); }
  }

  async function registerReplacement() {
    setBusy(true); setStatus(null);
    try {
      const ceremony = await northstarAuth.reclaimRegistrationOptions();
      const response = await startRegistration({ optionsJSON: ceremony.options as Parameters<typeof startRegistration>[0]["optionsJSON"] });
      const completed = await northstarAuth.reclaimRegistrationVerify({ challengeId: ceremony.challengeId, response });
      setRecoveryCodes(completed.recoveryCodes);
      setPhase("complete");
      setStatus({ kind: "success", message: t("auth.live.recoverySuccess") });
    } catch {
      setStatus({ kind: "error", message: t("auth.live.recoveryPasskeyError") });
      if (preferences.voiceEnabled) voice.speak("authError");
    } finally { setBusy(false); }
  }

  async function cancel() {
    setBusy(true); setStatus(null);
    try {
      await northstarAuth.reclaimCancel();
      setRecoveryCode(""); setRecoveryCodes([]); setPhase("identify");
      setStatus({ kind: "success", message: t("auth.live.recoveryCancelled") });
    } catch (error) {
      setStatus({ kind: "error", message: failureCopy(error) });
    } finally { setBusy(false); }
  }

  async function copyRecoveryCodes() {
    try {
      await navigator.clipboard.writeText(recoveryCodes.join("\n"));
      setStatus({ kind: "success", message: t("auth.live.recoveryCodesCopied") });
    } catch {
      setStatus({ kind: "error", message: t("auth.live.clipboardUnavailable") });
    }
  }

  function downloadRecoveryCodes() {
    const url = URL.createObjectURL(new Blob([`Northstar recovery codes\n${t("auth.live.recoveryCodesDownloadWarning")}\n\n${recoveryCodes.join("\n")}\n`], { type: "text/plain;charset=utf-8" }));
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = "northstar-recovery-codes.txt";
    anchor.click();
    setTimeout(() => URL.revokeObjectURL(url), 1_000);
  }

  return <main id="main-content" className="identity-page page-container">
    <section className="identity-panel" aria-labelledby="recovery-title">
      <div className="identity-heading"><p className="page-kicker">Northstar Workspace</p>
        <h1 id="recovery-title" tabIndex={-1}>{t("auth.live.recoveryTitle")}</h1>
        <p>{t("auth.live.recoveryIntro")}</p>
      </div>
      <div className="auth-access-tools">
        <AuthLanguageSelect id="recovery-language" />
        <div className="auth-voice-control">
          <label className="check-row" htmlFor="recovery-voice-enabled"><input id="recovery-voice-enabled" type="checkbox" checked={preferences.voiceEnabled} disabled={!ready} onChange={(event) => setPreference("voiceEnabled", event.target.checked)} /><span>{t("auth.live.voiceGuidanceLabel")}</span></label>
          <p className="field-help">{t("auth.live.voiceGuidanceHint")}</p>
          <Button type="button" variant="secondary" disabled={!ready || !preferences.voiceEnabled || voice.state === "unsupported" || voice.state === "no-match"} onClick={() => voice.speak("liveAuth")}>{t("settings.speakGuide")}</Button>
          <p role="status" aria-live="polite" className="field-help">{voice.state === "unsupported" ? t("settings.voiceUnavailable") : voice.state === "no-match" ? t("settings.voiceNoMatching") : ""}</p>
        </div>
      </div>

      {phase === "identify" ? <form className="identity-form" onSubmit={(event) => void start(event)}>
        <div className="form-field"><label htmlFor="recovery-email">{t("auth.live.emailLabel")}</label><input id="recovery-email" type="email" autoComplete="email" maxLength={254} required value={email} onChange={(event) => setEmail(event.target.value)} /></div>
        {status ? <InlineStatus kind={status.kind} role={status.kind === "error" ? "alert" : "status"}>{status.message}</InlineStatus> : null}
        <Button type="submit" className="button-full" disabled={busy || !email.trim()}>{busy ? t("auth.live.working") : t("auth.live.beginRecovery")}</Button>
      </form> : null}

      {phase === "verify" ? <form className="identity-form" onSubmit={(event) => void verifyCode(event)}>
        <p className="field-help">{t("auth.live.recoveryCodeHint")}</p>
        <div className="form-field"><label htmlFor="recovery-code">{t("auth.live.recoveryCodeLabel")}</label><input id="recovery-code" name="recoveryCode" type="text" autoComplete="off" inputMode="text" spellCheck={false} required maxLength={32} value={recoveryCode} onChange={(event) => setRecoveryCode(event.target.value.trim())} /></div>
        {status ? <InlineStatus kind={status.kind} role={status.kind === "error" ? "alert" : "status"}>{status.message}</InlineStatus> : null}
        <div className="auth-voice-actions"><Button type="submit" disabled={busy || recoveryCode.length !== 32}>{busy ? t("auth.live.working") : t("auth.live.completeRecovery")}</Button><Button type="button" variant="secondary" disabled={busy} onClick={() => void cancel()}>{t("common.cancel")}</Button></div>
      </form> : null}

      {phase === "enroll" ? <div className="identity-form">
        {status ? <InlineStatus kind={status.kind} role={status.kind === "error" ? "alert" : "status"}>{status.message}</InlineStatus> : null}
        <p className="field-help">{t("auth.live.recoveryReplacementIntro")}</p>
        <div className="auth-voice-actions"><Button type="button" disabled={busy} onClick={() => void registerReplacement()}>{busy ? t("auth.live.working") : t("auth.live.recoveryRegisterPasskey")}</Button><Button type="button" variant="secondary" disabled={busy} onClick={() => void cancel()}>{t("common.cancel")}</Button></div>
      </div> : null}

      {phase === "complete" ? <div className="identity-form">
        {status ? <InlineStatus kind={status.kind} role="status">{status.message}</InlineStatus> : null}
        {recoveryCodes.length ? <>
          <p className="field-help">{t("auth.live.recoveryCodesSave")}</p>
          <p className="field-help">{t("auth.live.recoveryCodesDownloadWarning")}</p>
          <ol className="recovery-code-grid" aria-label={t("auth.live.recoveryCodesLabel")}>
            {recoveryCodes.map((code, index) => <li key={`${index}-${code}`}><span className="recovery-code-index">{index + 1}.</span> <code>{code}</code></li>)}
          </ol>
          <div className="auth-voice-actions">
            <Button type="button" variant="secondary" onClick={() => void copyRecoveryCodes()}>{t("auth.live.recoveryCodesCopy")}</Button>
            <Button type="button" variant="secondary" onClick={downloadRecoveryCodes}>{t("auth.live.recoveryCodesDownload")}</Button>
            <Button type="button" variant="secondary" onClick={() => window.print()}>{t("auth.live.recoveryCodesPrint")}</Button>
          </div>
          <label className="check-row recovery-code-ack" htmlFor="recovery-codes-saved">
            <input id="recovery-codes-saved" type="checkbox" checked={savedCodes} onChange={(event) => setSavedCodes(event.target.checked)} />
            <span>{t("auth.live.recoveryCodesAcknowledgement")}</span>
          </label>
          <Button type="button" disabled={!savedCodes} onClick={() => { setRecoveryCodes([]); setSavedCodes(false); }}>{t("auth.live.recoveryCodesContinue")}</Button>
        </> : <p className="auth-recovery-link"><Link href="/login">{t("auth.live.signIn")}</Link></p>}
      </div> : null}

      <p className="identity-switch"><Link href="/login">{t("auth.live.backToSignIn")}</Link></p>
    </section>
    <RecoveryAssistant />
  </main>;
}
