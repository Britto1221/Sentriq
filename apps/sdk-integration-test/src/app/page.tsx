import Link from "next/link";

export default function HomePage() {
  return <main className="shell">
    <header className="top"><Link className="brand" href="/">SENTRIQ <span>SDK consumer</span></Link><nav aria-label="Main"><Link href="/register">Create account</Link><Link href="/login">Sign in</Link></nav></header>
    <section className="hero">
      <p className="eyebrow">Independent integration test</p>
      <h1>Passkeys, integrated by the host.</h1>
      <p>This separate Next.js application owns its account table, challenge store, and session cookies. It calls the public <code>@sentriq/core</code> and <code>@sentriq/browser</code> packages for passkey ceremonies.</p>
      <div className="actions"><Link className="button primary" href="/register">Create an account</Link><Link className="button" href="/login">Sign in with a passkey</Link></div>
    </section>
    <section className="note" aria-labelledby="security-boundary"><h2 id="security-boundary">What this verifies</h2><ul><li>Host-owned accounts with optional email metadata.</li><li>Real WebAuthn registration and assertion verification on the server.</li><li>Opaque, host-issued HTTP-only session cookies.</li><li>Single-use database challenges and credential counter compare-and-swap.</li></ul><p>Reclaim, Shield, Device Link, and multi-passkey management are not yet exposed by the public core package in this app.</p></section>
  </main>;
}
