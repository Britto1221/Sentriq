"use client";

import Link from "next/link";
import { useState, type FormEvent } from "react";
import { startRegistration } from "@sentriq/browser";

type Phase = "details" | "passkey" | "complete";

async function post<T>(url: string, value: unknown): Promise<T> {
  const response = await fetch(url, { method: "POST", credentials: "same-origin", cache: "no-store", headers: { "content-type": "application/json" }, body: JSON.stringify(value) });
  const result: unknown = await response.json().catch(() => undefined);
  if (!response.ok) throw new Error(result && typeof result === "object" && "error" in result && typeof result.error === "string" ? result.error : "The request failed. Try again.");
  return result as T;
}

export function RegistrationFlow() {
  const [phase, setPhase] = useState<Phase>("details");
  const [displayName, setDisplayName] = useState("");
  const [accountId, setAccountId] = useState("");
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);

  async function begin(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); setBusy(true); setMessage("");
    try {
      const result = await post<{ message: string; accountId: string }>("/api/registration/start", { displayName });
      setAccountId(result.accountId); setMessage(result.message); setPhase("passkey");
    } catch (error) { setMessage(error instanceof Error ? error.message : "Account registration could not start."); }
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
      <ol className="steps" aria-label="Registration steps"><li aria-current={phase === "details" ? "step" : undefined}>Account</li><li aria-current={phase === "passkey" ? "step" : undefined}>Passkey</li></ol>
      {phase === "details" ? <form onSubmit={(event) => void begin(event)}>
        <label htmlFor="display-name">Your name</label><input id="display-name" name="displayName" autoComplete="name" maxLength={100} required value={displayName} onChange={(event) => setDisplayName(event.target.value)} />
        <p className="hint">The host application creates a private account ID. Email is optional and is not used to identify or authorize you.</p>
        <button className="button primary" disabled={busy || !displayName.trim()}>{busy ? "Creating account…" : "Continue"}</button>
      </form> : null}
      {phase === "passkey" ? <div><p>Use your phone or computer's built-in unlock method, or a security key. Sentriq receives the signed passkey response, not biometric data.</p><button className="button primary" disabled={busy} onClick={() => void createPasskey()}>{busy ? "Waiting for authenticator…" : "Create passkey"}</button></div> : null}
      {phase === "complete" ? <div><p>Your passkey is registered. Your host account ID is <code>{accountId}</code>.</p><p>This independent SDK example currently demonstrates host-owned account identity and passkey authentication. It does not claim to expose Reclaim, Shield, or Device Link.</p><Link className="button primary" href="/login">Continue to sign in</Link></div> : null}
      <p className="status" role="status" aria-live="polite">{message}</p>
    </section>
  </main>;
}
