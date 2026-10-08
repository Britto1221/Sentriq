"use client";

import { useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { AccessLanguageSelect, useTranslation } from "@sentriq/access";
import { SampleLabel } from "@/components/ui";

export function AuthDemoForm({ mode }: { mode: "login" | "signup" }) {
  const router = useRouter();
  const { t } = useTranslation("console");
  const [email, setEmail] = useState("developer@sentriq.test");
  const [organization, setOrganization] = useState("Sentriq sample workspace");
  const [understood, setUnderstood] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    setSuccess("");
    if (!email.trim() || !email.includes("@")) {
      setError(t("auth.invalidEmail"));
      return;
    }
    if (mode === "login") {
      if (email.trim().toLowerCase() !== "developer@sentriq.test") {
        setError(t("auth.demoIdentityError"));
        return;
      }
      router.push("/console/overview");
      return;
    }
    if (!organization.trim()) {
      setError(t("auth.organizationRequired"));
      return;
    }
    if (!understood) {
      setError(t("auth.signupConfirmRequired"));
      return;
    }
    setSuccess(t("auth.signupSuccess"));
  }

  return (
    <section className="auth-panel">
      <div className="auth-panel__controls">
        <SampleLabel>{t("auth.previewLabel")}</SampleLabel>
        <AccessLanguageSelect id={`${mode}-language`} />
      </div>
      <h1>{t(mode === "login" ? "auth.loginTitle" : "auth.signupTitle")}</h1>
      <p className="auth-panel__intro">{t(mode === "login" ? "auth.loginIntro" : "auth.signupIntro")}</p>
      <div className="auth-note"><strong>{t("auth.demoIdentityLabel")}:</strong> developer@sentriq.test<br/><span>{t("auth.noPassword")}</span></div>
      <form className="auth-panel__form" onSubmit={submit} noValidate>
        {mode === "signup" && <div className="field"><label htmlFor="signup-organization">{t("auth.organizationLabel")}</label><input className="input" id="signup-organization" value={organization} onChange={(event) => setOrganization(event.target.value)} autoComplete="organization" required/></div>}
        <div className="field"><label htmlFor={`${mode}-email`}>{t(mode === "login" ? "auth.loginEmailLabel" : "auth.signupEmailLabel")}</label><input className="input" id={`${mode}-email`} type="email" autoComplete="email" value={email} onChange={(event) => setEmail(event.target.value)} aria-invalid={error ? true : undefined} aria-describedby={error ? "auth-error" : "auth-hint"} required/><p id="auth-hint" className="field-hint">{t(mode === "login" ? "auth.loginEmailHint" : "auth.signupEmailHint")}</p></div>
        {mode === "signup" && <label className="check-row"><input type="checkbox" checked={understood} onChange={(event) => setUnderstood(event.target.checked)}/><span>{t("auth.signupConfirm")}</span></label>}
        {error && <p className="field-error" id="auth-error" role="alert">{error}</p>}
        {success && <p className="callout" role="status">{success}</p>}
        <button className="button button--primary" type="submit">{t(mode === "login" ? "auth.loginButton" : "auth.signupButton")}</button>
      </form>
      <p className="muted small section-gap">{mode === "login" ? <><Link href="/">{t("auth.loginHomeLink")}</Link> · <Link href="/signup">{t("auth.loginSignupLink")}</Link></> : <>{t("auth.signupExistingText")} <Link href="/login">{t("auth.signupLoginLink")}</Link></>}</p>
    </section>
  );
}
