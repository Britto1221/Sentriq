"use client";

import { LinkButton } from "@/components/primitives";

export function LandingPage() {
  return <main id="main-content" className="landing-page page-container">
    <section className="landing-hero" aria-labelledby="landing-title">
      <div className="landing-copy">
        <p className="landing-kicker"><span aria-hidden="true" />Northstar · Sentriq SDK example</p>
        <h1 id="landing-title" tabIndex={-1}>Account security<br />you can verify.</h1>
        <p className="landing-lede">Try a self-hosted authentication flow with passkeys, fresh checks on sensitive actions, one-use recovery codes, and accessible guidance.</p>
        <div className="landing-actions"><LinkButton href="/signup">Create account</LinkButton><LinkButton href="/login" variant="secondary">Sign in</LinkButton></div>
        <p className="landing-caption">Registration, sessions, passkeys, recovery, and audit events use the configured Sentriq Security API.</p>
      </div>
      <div className="workspace-preview" aria-label="Sentriq capabilities used in this demo">
        <div className="preview-topline"><span>Northstar security path</span><span className="preview-tag">Live local demo</span></div>
        <ol className="security-path-list">
          <li><span>01</span><div><strong>Authenticate</strong><small>WebAuthn passkey verification</small></div></li>
          <li><span>02</span><div><strong>Protect</strong><small>Server-enforced Action Shield</small></div></li>
          <li><span>03</span><div><strong>Recover</strong><small>Single-use recovery codes</small></div></li>
          <li><span>04</span><div><strong>Access</strong><small>English and Tamil guidance</small></div></li>
        </ol>
        <p className="workspace-preview-note">The application backend enforces protected operations. UI state alone cannot authorize an action.</p>
      </div>
    </section>
  </main>;
}
