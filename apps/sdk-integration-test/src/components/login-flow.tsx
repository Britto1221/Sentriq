"use client";

import { useRouter } from "next/navigation";
import { useState, type FormEvent } from "react";
import { startAuthentication } from "@sentriq/browser";

async function post<T>(url: string, value: unknown): Promise<T> {
  const response = await fetch(url, { method: "POST", credentials: "same-origin", cache: "no-store", headers: { "content-type": "application/json" }, body: JSON.stringify(value) });
  const result: unknown = await response.json().catch(() => undefined);
  if (!response.ok) throw new Error(result && typeof result === "object" && "error" in result && typeof result.error === "string" ? result.error : "Passkey sign-in failed.");
  return result as T;
}

export function LoginFlow() {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  async function signIn(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); setBusy(true); setMessage("");
    try {
      const ceremony = await post<{ challengeId: string; options: Parameters<typeof startAuthentication>[0]["optionsJSON"] }>("/api/login/options", {});
      const response = await startAuthentication({ optionsJSON: ceremony.options });
      await post("/api/login/finish", { challengeId: ceremony.challengeId, response });
      router.push("/profile");
    } catch (error) { setMessage(error instanceof Error ? error.message : "Passkey sign-in failed. Try again."); }
    finally { setBusy(false); }
  }
  return <main className="shell narrow"><section className="panel" aria-labelledby="login-title"><p className="eyebrow">Passwordless sign-in</p><h1 id="login-title">Welcome back</h1><p>Choose a passkey saved on this device, or use a synced passkey from another device. No email address or password is required.</p><form onSubmit={(event) => void signIn(event)}><button className="button primary" disabled={busy}>{busy ? "Waiting for passkey…" : "Continue with passkey"}</button></form><p className="status" role="status" aria-live="polite">{message}</p></section></main>;
}
