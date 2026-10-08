"use client";

import Link from "next/link";
import { useState, type FormEvent } from "react";
import { startRegistration } from "@sentriq/browser";

type Phase = "email" | "verification" | "passkey" | "complete";

async function post<T>(url: string, value: unknown): Promise<T> {
  const response = await fetch(url, { method: "POST", credentials: "same-origin", cache: "no-store", headers: { "content-type": "application/json" }, body: JSON.stringify(value) });
  const result: unknown = await response.json().catch(() => undefined);
  if (!response.ok) throw new Error(result && typeof result === "object" && "error" in result && typeof result.error === "string" ? result.error : "The request failed. Try again.");
  return result as T;
}

export function RegistrationFlow() {
  const [phase, setPhase] = useState<Phase>("email");
  const [email, setEmail] = useState("");
  const [code, setCode] = useState("");
  const [localCode, setLocalCode] = useState("");
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);

  async function begin(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); setBusy(true); setMessage("");
    try { const result = await post<{ message: string }>("/api/registration/start", { email }); setMessage(result.message); setPhase("verification"); }
    catch (error) { setMessage(error instanceof Error ? error.message : "Email verification could not start."); }
    finally { setBusy(false); }
  }
  async function loadLocalCode() {
    setBusy(true); setMessage("");
    try { const response = await fetch(`/api/dev-inbox?email=${encodeURIComponent(email)}`, { cache: "no-store" }); const value: unknown = await response.json(); if (!response.ok || !value || typeof value !== "object" || !("code" in value) || typeof value.code !== "string") throw new Error("No local verification message is available."); setLocalCode(value.code); setCode(value.code); setMessage("Local-only development inbox: code loaded."); }
    catch (error) { setMessage(error instanceof Error ? error.message : "The local inbox could not be read."); }
    finally { setBusy(false); }
  }
  async function verify(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); setBusy(true); setMessage("");
    try { const result = await post<{ message: string }>("/api/registration/verify", { email, code }); setMessage(result.message); setPhase("passkey"); }
    catch (error) { setMessage(error instanceof Error ? error.message : "The verification code was rejected."); }
    finally { setBusy(false); }
  }
  async function createPasskey() {
    setBusy(true); setMessage("");
    try {
      const ceremony = await post<{ challengeId: string; options: Parameters<typeof startRegistration>[0]["optionsJSON"] }>("/api/registration/options", {});
      const response = await startRegistration({ optionsJSON: ceremony.options });
      const result = await post<{ message: string }>("/api/registration/finish", { challengeId: ceremony.challengeId, response });
      setMessage(result.message); setPhase("complete");
    } catch (error) { setMessage(error instanceof Error ? error.message : "Passkey registration failed."); }
    finally { setBusy(false); }
  }

  return <main className="shell narrow">
    <Link className="back" href="/">← Back</Link>
    <section className="panel" aria-labelledby="register-title">
      <p className="eyebrow">Host-owned account</p><h1 id="register-title">Create an account</h1>
      <ol className="steps" aria-label="Registration steps"><li aria-current={phase === "email" ? "step" : undefined}>Email</li><li aria-current={phase === "verification" ? "step" : undefined}>Verify</li><li aria-current={phase === "passkey" ? "step" : undefined}>Passkey</li></ol>
      {phase === "email" ? <form onSubmit={(event) => void begin(event)}><label htmlFor="email">Email address</label><input id="email" type="email" autoComplete="email" maxLength={254} required value={email} onChange={(event) => setEmail(event.target.value)} /><button className="button primary" disabled={busy}>{busy ? "Sending…" : "Continue"}</button></form> : null}
      {phase === "verification" ? <form onSubmit={(event) => void verify(event)}><label htmlFor="verify-email">Email address</label><input id="verify-email" value={email} readOnly /><label htmlFor="email-code">Verification code</label><input id="email-code" type="text" autoComplete="one-time-code" inputMode="text" maxLength={64} required value={code} onChange={(event) => setCode(event.target.value.trim())} />
        <button className="button primary" disabled={busy || !code}>Verify email</button><button className="button" type="button" disabled={busy} onClick={() => void loadLocalCode()}>Read local development inbox</button>{localCode ? <p className="hint">This inbox is available only in local development.</p> : null}</form> : null}
      {phase === "passkey" ? <div><p>Use your phone or computer's built-in unlock method, or a security key. Sentriq receives the signed passkey response, not biometric data.</p><button className="button primary" disabled={busy} onClick={() => void createPasskey()}>{busy ? "Waiting for authenticator…" : "Create passkey"}</button></div> : null}
      {phase === "complete" ? <div><p>Your passkey is registered. This sample integration does not yet issue Reclaim recovery codes.</p><Link className="button primary" href="/login">Continue to sign in</Link></div> : null}
      <p className="status" role="status" aria-live="polite">{message}</p>
    </section>
  </main>;
}
