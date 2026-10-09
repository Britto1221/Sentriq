"use client";

import Link from "next/link";
import { useEffect, useState } from "react";

interface Account { id: string; email?: string | null; displayName: string }
interface Passkey { id: string; createdAt: string; deviceType: string; backedUp: boolean }

export function Profile() {
  const [account, setAccount] = useState<Account | null>(null);
  const [passkeys, setPasskeys] = useState<Passkey[]>([]);
  const [message, setMessage] = useState("Loading account…");
  useEffect(() => {
    let cancelled = false;
    void Promise.all([fetch("/api/me", { cache: "no-store" }), fetch("/api/passkeys", { cache: "no-store" })]).then(async ([accountResponse, passkeyResponse]) => {
      if (!accountResponse.ok || !passkeyResponse.ok) throw new Error("Sign in with a passkey to view this profile.");
      const accountBody = await accountResponse.json() as { account: Account };
      const passkeyBody = await passkeyResponse.json() as { passkeys: Passkey[] };
      if (!cancelled) { setAccount(accountBody.account); setPasskeys(passkeyBody.passkeys); setMessage(""); }
    }).catch((error: unknown) => { if (!cancelled) setMessage(error instanceof Error ? error.message : "Profile could not be loaded."); });
    return () => { cancelled = true; };
  }, []);
  async function signOut() {
    const response = await fetch("/api/logout", { method: "POST", headers: { "content-type": "application/json" }, body: "{}" });
    if (response.ok) location.assign("/login"); else setMessage("Sign out could not be completed.");
  }
  return <main className="shell narrow"><Link className="back" href="/">← Home</Link><section className="panel" aria-labelledby="profile-title"><p className="eyebrow">Host profile</p><h1 id="profile-title">Your account</h1>{account ? <><dl><dt>Account ID</dt><dd><code>{account.id}</code></dd><dt>Name</dt><dd>{account.displayName}</dd>{account.email ? <><dt>Email</dt><dd>{account.email}</dd></> : null}</dl><h2>Registered passkey</h2><ul>{passkeys.map((key) => <li key={key.id}>{key.deviceType}; {key.backedUp ? "sync-backup reported" : "backup not reported"}; added {new Date(key.createdAt).toLocaleDateString()}</li>)}</ul><p>Credential management and recovery are not yet exposed by this public SDK integration example.</p><button className="button" onClick={() => void signOut()}>Sign out</button></> : <p role="status">{message}<br /><Link href="/login">Sign in</Link></p>}</section></main>;
}
