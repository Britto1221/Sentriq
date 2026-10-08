"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import type { FormEvent } from "react";
import { startAuthentication, startRegistration } from "@sentriq/browser";
import { useAccessPreferences, useAccessVoice, useTranslation } from "@sentriq/access";
import { useDemo } from "@/components/demo-provider";
import { AuthLanguageSelect } from "@/components/auth-language-select";
import { Button, InlineStatus } from "@/components/primitives";
import { northstarAuth, NorthstarAuthError } from "@/lib/auth-client";

type SignupPhase = "email" | "verify-email" | "passkey" | "recovery-codes" | "complete";
type DeviceLinkStatus = "PENDING" | "APPROVED" | "REJECTED" | "COMPLETED" | "EXPIRED" | "CANCELLED";
interface DeviceLinkProgress {
  requestId: string;
  comparisonCode: string;
  expiresAt: number;
}

export function IdentityFlow({ mode, developmentInboxEnabled = false }: { mode: "login" | "signup"; developmentInboxEnabled?: boolean }) {
  const isSignup = mode === "signup";
  const router = useRouter();
  const { t } = useTranslation("console");
  const { preferences, ready, setPreference } = useAccessPreferences();
  const voice = useAccessVoice();
  const { refreshSession } = useDemo();
  const [email, setEmail] = useState("");
  const [verificationCode, setVerificationCode] = useState("");
  const [signupPhase, setSignupPhase] = useState<SignupPhase>("email");
  const [recoveryCodes, setRecoveryCodes] = useState<string[]>([]);
  const [savedCodes, setSavedCodes] = useState(false);
  const [deviceLink, setDeviceLink] = useState<DeviceLinkProgress | null>(null);
  const [deviceStatus, setDeviceStatus] = useState<DeviceLinkStatus | null>(null);
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState<{ kind: "error" | "success"; message: string } | null>(null);
  const [emailError, setEmailError] = useState<string | null>(null);
  const [codeError, setCodeError] = useState<string | null>(null);

  useEffect(() => {
    if (!deviceLink || deviceStatus !== "PENDING") return;
    let stopped = false;
    let timer: ReturnType<typeof setTimeout> | undefined;

    const poll = async () => {
      if (stopped) return;
      if (Date.now() >= deviceLink.expiresAt) {
        setDeviceStatus("EXPIRED");
        return;
      }
      try {
        const result = await northstarAuth.deviceLinkStatus(deviceLink.requestId);
        if (stopped) return;
        setDeviceStatus(result.status);
        if (result.status === "PENDING") timer = setTimeout(() => void poll(), 2_000);
      } catch {
        if (!stopped) timer = setTimeout(() => void poll(), 4_000);
      }
    };

    void poll();
    return () => {
      stopped = true;
      if (timer) clearTimeout(timer);
    };
  }, [deviceLink, deviceStatus]);

  const getFailureCopy = (error: unknown) => {
    if (error instanceof NorthstarAuthError) {
      if (error.code === "RATE_LIMITED") return t("auth.live.rateLimited");
      if (["NETWORK_UNAVAILABLE", "UPSTREAM_UNAVAILABLE", "UPSTREAM_TIMEOUT"].includes(error.code)) return t("auth.live.networkError");
    }
    return t("auth.live.genericFailure");
  };

  function validateEmail() {
    if (!/^\S+@[^\s.]+(?:\.[^\s.]+)+$/.test(email.trim()) || email.trim().length > 254) {
      setEmailError(t("auth.live.invalidEmail"));
      return false;
    }
    setEmailError(null);
    return true;
  }

  async function beginRegistration(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setStatus(null);
    if (!validateEmail()) return;
    setBusy(true);
    try {
      await northstarAuth.registrationStart({ email: email.trim().toLowerCase() });
      setSignupPhase("verify-email");
      setStatus({ kind: "success", message: t("auth.live.signupSuccess") });
    } catch (error) {
      setStatus({ kind: "error", message: getFailureCopy(error) });
    } finally {
      setBusy(false);
    }
  }

  async function loadDevelopmentCode() {
    if (!validateEmail()) return;
    setBusy(true);
    setStatus(null);
    try {
      const result = await northstarAuth.developmentEmailInbox({ email: email.trim().toLowerCase() });
      setVerificationCode(result.verificationCode);
      setStatus({ kind: "success", message: t("auth.live.developmentInboxLoaded") });
    } catch (error) {
      setStatus({ kind: "error", message: getFailureCopy(error) });
    } finally {
      setBusy(false);
    }
  }

  async function resendEmailCode() {
    if (!validateEmail()) return;
    setBusy(true);
    setStatus(null);
    try {
      await northstarAuth.registrationStart({ email: email.trim().toLowerCase() });
      setVerificationCode("");
      setStatus({ kind: "success", message: t("auth.live.verificationResent") });
    } catch (error) {
      setStatus({ kind: "error", message: getFailureCopy(error) });
    } finally {
      setBusy(false);
    }
  }

  async function verifyEmail(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setStatus(null);
    const normalizedEmail = email.trim().toLowerCase();
    if (!validateEmail()) return;
    if (!/^[A-Za-z0-9_-]{12}$/.test(verificationCode)) {
      setCodeError(t("auth.live.invalidVerificationCode"));
      return;
    }
    setCodeError(null);
    setBusy(true);
    try {
      await northstarAuth.verifyRegistrationEmail({ email: normalizedEmail, code: verificationCode });
      setVerificationCode("");
      setSignupPhase("passkey");
      setStatus({ kind: "success", message: t("auth.live.emailVerified") });
    } catch (error) {
      setStatus({ kind: "error", message: getFailureCopy(error) });
      if (preferences.voiceEnabled) voice.speak("authError");
    } finally {
      setBusy(false);
    }
  }

  async function createFirstPasskey() {
    setBusy(true);
    setStatus(null);
    try {
      const ceremony = await northstarAuth.registrationOptions();
      const response = await startRegistration({
        optionsJSON: ceremony.options as Parameters<typeof startRegistration>[0]["optionsJSON"],
      });
      const result = await northstarAuth.registrationVerify({ challengeId: ceremony.challengeId, response });
      setRecoveryCodes(result.recoveryCodes);
      setSignupPhase("recovery-codes");
      setStatus({ kind: "success", message: t("auth.live.passkeyEnrollSuccess") });
    } catch (error) {
      setStatus({ kind: "error", message: getFailureCopy(error) });
      if (preferences.voiceEnabled) voice.speak("authError");
    } finally {
      setBusy(false);
    }
  }

  async function signInWithPasskey(includeEmail: boolean) {
    setStatus(null);
    if (includeEmail && !validateEmail()) return;
    setBusy(true);
    try {
      const ceremony = await northstarAuth.authenticationOptions(includeEmail ? email.trim().toLowerCase() : undefined);
      const response = await startAuthentication({
        optionsJSON: ceremony.options as Parameters<typeof startAuthentication>[0]["optionsJSON"],
      });
      await northstarAuth.authenticationVerify({ challengeId: ceremony.challengeId, response });
      await refreshSession();
      setStatus({ kind: "success", message: t("auth.live.loginSuccess") });
      router.push("/dashboard");
    } catch {
      setStatus({ kind: "error", message: t("auth.live.passkeyFailure") });
      if (preferences.voiceEnabled) voice.speak("authError");
    } finally {
      setBusy(false);
    }
  }

  async function beginDeviceLink() {
    setStatus(null);
    if (!validateEmail()) return;
    setBusy(true);
    try {
      const result = await northstarAuth.startDeviceLink({ email: email.trim().toLowerCase() });
      setDeviceLink({ requestId: result.requestId, comparisonCode: result.comparisonCode, expiresAt: Date.now() + result.expiresIn * 1_000 });
      setDeviceStatus("PENDING");
    } catch (error) {
      setStatus({ kind: "error", message: getFailureCopy(error) });
    } finally {
      setBusy(false);
    }
  }

  async function registerLinkedDevice() {
    if (!deviceLink) return;
    setBusy(true);
    setStatus(null);
    try {
      const ceremony = await northstarAuth.deviceLinkRegistrationOptions(deviceLink.requestId);
      const response = await startRegistration({
        optionsJSON: ceremony.options as Parameters<typeof startRegistration>[0]["optionsJSON"],
      });
      await northstarAuth.deviceLinkRegistrationVerify({ requestId: deviceLink.requestId, challengeId: ceremony.challengeId, response });
      await refreshSession();
      router.push("/dashboard");
    } catch (error) {
      setStatus({ kind: "error", message: getFailureCopy(error) });
      if (preferences.voiceEnabled) voice.speak("authError");
    } finally {
      setBusy(false);
    }
  }

  async function cancelDeviceLink() {
    if (!deviceLink) return;
    setBusy(true);
    try {
      await northstarAuth.cancelDeviceLink(deviceLink.requestId);
    } catch {
      // The request may already have expired or changed state. The server remains authoritative.
    }
    setDeviceLink(null);
    setDeviceStatus(null);
    setBusy(false);
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
    const contents = `Northstar account recovery codes\n${t("auth.live.recoveryCodesDownloadWarning")}\n\n${recoveryCodes.join("\n")}\n`;
    const url = URL.createObjectURL(new Blob([contents], { type: "text/plain;charset=utf-8" }));
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = "northstar-recovery-codes.txt";
    anchor.click();
    setTimeout(() => URL.revokeObjectURL(url), 1_000);
  }

  function finishRecoveryCodeSetup() {
    setRecoveryCodes([]);
    setSignupPhase("complete");
    void refreshSession();
  }

  const signupHeading = signupPhase === "verify-email" ? "auth.live.verifyEmailTitle"
    : signupPhase === "passkey" ? "auth.live.createPasskeyTitle"
      : signupPhase === "recovery-codes" ? "auth.live.saveRecoveryCodesTitle"
        : signupPhase === "complete" ? "auth.live.accountReadyTitle"
          : "auth.live.signupTitle";

  return (
    <main id="main-content" className="identity-page page-container">
      <section className="identity-panel" aria-labelledby="identity-title">
        <div className="identity-heading">
          <p className="page-kicker">Northstar Workspace</p>
          <h1 id="identity-title" tabIndex={-1}>{t(isSignup ? signupHeading : "auth.live.loginTitle")}</h1>
          <p>{t(isSignup
            ? signupPhase === "email" ? "auth.live.signupIntro"
              : signupPhase === "verify-email" ? "auth.live.verifyEmailIntro"
                : signupPhase === "passkey" ? "auth.live.createPasskeyDescription"
                  : signupPhase === "recovery-codes" ? "auth.live.saveRecoveryCodesDescription"
                    : "auth.live.accountReadyDescription"
            : "auth.live.loginIntro")}</p>
        </div>

        <div className="auth-access-tools" aria-label={t("settings.preferenceTitle")}>
          <AuthLanguageSelect id="auth-language" />
          <div className="auth-voice-control">
            <label className="check-row" htmlFor="auth-voice-enabled">
              <input id="auth-voice-enabled" type="checkbox" checked={preferences.voiceEnabled}
                disabled={!ready}
                onChange={(event) => setPreference("voiceEnabled", event.target.checked)} />
              <span>{t("auth.live.voiceGuidanceLabel")}</span>
            </label>
            <p className="field-help">{t("auth.live.voiceGuidanceHint")}</p>
            <div className="auth-voice-actions">
              <Button type="button" variant="secondary" disabled={!ready || !preferences.voiceEnabled || voice.state === "unsupported" || voice.state === "no-match"}
                onClick={() => voice.speak("liveAuth")}>{t("settings.speakGuide")}</Button>
              <Button type="button" variant="secondary" disabled={!ready || !preferences.voiceEnabled || !voice.canRepeat}
                onClick={voice.repeat}>{t("settings.repeatGuide")}</Button>
              <Button type="button" variant="secondary" disabled={!ready || voice.state !== "speaking" && voice.state !== "paused"}
                onClick={voice.state === "paused" ? voice.resume : voice.pause}>
                {voice.state === "paused" ? t("settings.resumeSpeech") : t("settings.pauseSpeech")}
              </Button>
              <Button type="button" variant="secondary" disabled={!ready || voice.state !== "speaking" && voice.state !== "paused"}
                onClick={voice.stop}>{t("settings.stopSpeech")}</Button>
            </div>
            <p role="status" aria-live="polite" className="field-help" data-speech-state={voice.state}>
              {voice.state === "unsupported" ? t("settings.voiceUnavailable") : voice.state === "no-match" ? t("settings.voiceNoMatching") : ""}
            </p>
          </div>
        </div>

        {isSignup && signupPhase === "email" ? <form className="identity-form" onSubmit={(event) => void beginRegistration(event)} noValidate>
          <div className="form-field">
            <label htmlFor="email-address">{t("auth.live.emailLabel")}</label>
            <input id="email-address" name="email" type="email" autoComplete="email" maxLength={254} required value={email}
              aria-invalid={Boolean(emailError)} aria-describedby={emailError ? "email-error" : undefined}
              onChange={(event) => { setEmail(event.target.value); setEmailError(null); }} />
            {emailError ? <span id="email-error" className="field-error">{emailError}</span> : null}
          </div>
          {status ? <InlineStatus kind={status.kind} role={status.kind === "error" ? "alert" : "status"}>{status.message}</InlineStatus> : null}
          <Button className="button-full" type="submit" disabled={busy}>{busy ? t("auth.live.working") : t("auth.live.emailContinue")}</Button>
        </form> : null}

        {isSignup && signupPhase === "verify-email" ? <form className="identity-form" onSubmit={(event) => void verifyEmail(event)} noValidate>
          <div className="form-field">
            <label htmlFor="email-address">{t("auth.live.emailLabel")}</label>
            <input id="email-address" type="email" autoComplete="email" value={email} readOnly aria-describedby="verification-code-hint" />
          </div>
          <div className="form-field">
            <label htmlFor="email-verification-code">{t("auth.live.verificationCodeLabel")}</label>
            <input id="email-verification-code" name="one-time-code" type="text" autoComplete="one-time-code" inputMode="text"
              maxLength={12} spellCheck={false} required value={verificationCode} aria-invalid={Boolean(codeError)}
              aria-describedby={codeError ? "verification-code-error" : "verification-code-hint"}
              onChange={(event) => { setVerificationCode(event.target.value.replace(/\s/g, "").slice(0, 12)); setCodeError(null); }} />
            {codeError ? <span id="verification-code-error" className="field-error">{codeError}</span> : <span id="verification-code-hint" className="field-help">{t("auth.live.verificationCodeHint")}</span>}
          </div>
          {status ? <InlineStatus kind={status.kind} role={status.kind === "error" ? "alert" : "status"}>{status.message}</InlineStatus> : null}
          <Button className="button-full" type="submit" disabled={busy || verificationCode.length !== 12}>{busy ? t("auth.live.working") : t("auth.live.verifyEmail")}</Button>
          <Button className="button-full" type="button" variant="secondary" disabled={busy} onClick={() => void resendEmailCode()}>{t("auth.live.resendVerification")}</Button>
          {developmentInboxEnabled ? <div className="development-inbox-note">
            <p>{t("auth.live.developmentInboxHelp")}</p>
            <Button type="button" variant="secondary" disabled={busy} onClick={() => void loadDevelopmentCode()}>{t("auth.live.developmentInboxLabel")}</Button>
          </div> : null}
        </form> : null}

        {isSignup && signupPhase === "passkey" ? <div className="identity-form">
          <p className="field-help">{t("auth.live.verifiedEmailLabel")}: <strong>{email}</strong></p>
          {status ? <InlineStatus kind={status.kind} role={status.kind === "error" ? "alert" : "status"}>{status.message}</InlineStatus> : null}
          <Button className="button-full" type="button" disabled={busy} onClick={() => void createFirstPasskey()}>{busy ? t("auth.live.working") : t("auth.live.createPasskeyAction")}</Button>
        </div> : null}

        {isSignup && signupPhase === "recovery-codes" ? <div className="identity-form recovery-issuance">
          <p className="field-help">{t("auth.live.recoveryCodesDownloadWarning")}</p>
          <ol className="recovery-code-grid" aria-label={t("auth.live.recoveryCodesLabel")}>
            {recoveryCodes.map((code, index) => <li key={`${index}-${code}`}><span className="recovery-code-index">{index + 1}.</span> <code>{code}</code></li>)}
          </ol>
          <div className="auth-voice-actions">
            <Button type="button" variant="secondary" onClick={() => void copyRecoveryCodes()}>{t("auth.live.recoveryCodesCopy")}</Button>
            <Button type="button" variant="secondary" onClick={downloadRecoveryCodes}>{t("auth.live.recoveryCodesDownload")}</Button>
            <Button type="button" variant="secondary" onClick={() => window.print()}>{t("auth.live.recoveryCodesPrint")}</Button>
          </div>
          {status ? <InlineStatus kind={status.kind} role={status.kind === "error" ? "alert" : "status"}>{status.message}</InlineStatus> : null}
          <label className="check-row recovery-code-ack" htmlFor="recovery-codes-saved">
            <input id="recovery-codes-saved" type="checkbox" checked={savedCodes} onChange={(event) => setSavedCodes(event.target.checked)} />
            <span>{t("auth.live.recoveryCodesAcknowledgement")}</span>
          </label>
          <Button className="button-full" type="button" disabled={!savedCodes || busy} onClick={finishRecoveryCodeSetup}>{t("auth.live.recoveryCodesContinue")}</Button>
        </div> : null}

        {isSignup && signupPhase === "complete" ? <div className="identity-form">
          <dl className="registration-summary">
            <div><dt>{t("auth.live.verifiedEmailLabel")}</dt><dd>{email}</dd></div>
            <div><dt>{t("auth.live.registeredPasskeyLabel")}</dt><dd>{t("auth.live.setupComplete")}</dd></div>
            <div><dt>{t("auth.live.recoveryCodesIssuedLabel")}</dt><dd>{t("auth.live.setupComplete")}</dd></div>
          </dl>
          <Button className="button-full" type="button" onClick={() => router.push("/dashboard")}>{t("auth.live.continueToAccount")}</Button>
        </div> : null}

        {!isSignup ? <>
          <form className="identity-form" onSubmit={(event) => { event.preventDefault(); void signInWithPasskey(true); }} noValidate>
            <div className="form-field">
              <label htmlFor="email-address">{t("auth.live.emailLabel")}</label>
              <input id="email-address" name="email" type="email" autoComplete="email" maxLength={254} required value={email}
                aria-invalid={Boolean(emailError)} aria-describedby={emailError ? "email-error" : undefined}
                onChange={(event) => { setEmail(event.target.value); setEmailError(null); }} />
              {emailError ? <span id="email-error" className="field-error">{emailError}</span> : null}
            </div>
            {status ? <InlineStatus kind={status.kind} role={status.kind === "error" ? "alert" : "status"}>{status.message}</InlineStatus> : null}
            <Button className="button-full" type="submit" disabled={busy}>{busy ? t("auth.live.working") : t("auth.live.passkeyLogin")}</Button>
          </form>
          <div className="auth-method-divider"><span>{t("auth.live.or")}</span></div>
          <Button className="button-full" variant="secondary" type="button" disabled={busy} onClick={() => void signInWithPasskey(false)}>{t("auth.live.discoverableSignIn")}</Button>
          <div className="auth-device-link">
            <h2>{t("auth.live.deviceLinkTitle")}</h2>
            <p>{t("auth.live.deviceLinkIntro")}</p>
            {!deviceLink ? <Button className="button-full" type="button" variant="secondary" disabled={busy} onClick={() => void beginDeviceLink()}>{t("auth.live.deviceLinkStart")}</Button> : null}
            {deviceLink ? <div className="device-link-progress" aria-live="polite">
              <p className="device-link-code-label">{t("auth.live.deviceLinkComparisonLabel")}</p>
              <p className="device-link-code" aria-label={`${t("auth.live.deviceLinkComparisonLabel")}: ${deviceLink.comparisonCode}`}>{deviceLink.comparisonCode}</p>
              <p>{t("auth.live.deviceLinkComparisonHint")}</p>
              {deviceStatus === "PENDING" ? <p role="status">{t("auth.live.deviceLinkPending")}</p> : null}
              {deviceStatus === "APPROVED" ? <>
                <InlineStatus kind="success" role="status">{t("auth.live.deviceLinkApproved")}</InlineStatus>
                <Button className="button-full" type="button" disabled={busy} onClick={() => void registerLinkedDevice()}>{busy ? t("auth.live.working") : t("auth.live.deviceLinkCreatePasskey")}</Button>
              </> : null}
              {deviceStatus === "REJECTED" || deviceStatus === "CANCELLED" ? <InlineStatus kind="error" role="alert">{t("auth.live.deviceLinkRejected")}</InlineStatus> : null}
              {deviceStatus === "EXPIRED" ? <InlineStatus kind="error" role="alert">{t("auth.live.deviceLinkExpired")}</InlineStatus> : null}
              {deviceStatus === "COMPLETED" ? <InlineStatus kind="success" role="status">{t("auth.live.deviceApprovalComplete")}</InlineStatus> : null}
              {deviceStatus !== "COMPLETED" ? <Button className="button-full" type="button" variant="secondary" disabled={busy} onClick={() => void cancelDeviceLink()}>{t("auth.live.deviceLinkCancel")}</Button> : null}
              {deviceStatus === "REJECTED" || deviceStatus === "CANCELLED" || deviceStatus === "EXPIRED" ? <Button className="button-full" type="button" variant="text" disabled={busy} onClick={() => { setDeviceLink(null); setDeviceStatus(null); }}>{t("auth.live.deviceLinkStartOver")}</Button> : null}
            </div> : null}
          </div>
          <Link className="auth-recovery-link" href="/recover">{t("auth.live.recoveryLink")}</Link>
        </> : null}

        <p className="identity-switch">
          {isSignup ? t("auth.live.haveAccount") : t("auth.live.needAccount")} {" "}
          <Link href={isSignup ? "/login" : "/signup"}>{t(isSignup ? "auth.live.signIn" : "auth.live.signUp")}</Link>
        </p>
        <Link className="back-link" href="/">{t("auth.live.returnHome")}</Link>
      </section>
    </main>
  );
}
