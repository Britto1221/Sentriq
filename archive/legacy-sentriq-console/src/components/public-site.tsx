import type { ReactNode } from "react";
import Link from "next/link";
import { Brand, Icon, SampleLabel } from "@/components/ui";
import { PublicSiteFrame } from "@/components/public-site-frame";

export function PublicSite({ children, activePath = "" }: { children: ReactNode; activePath?: string }) {
  return <PublicSiteFrame activePath={activePath}>{children}</PublicSiteFrame>;
}

export function HomePage() {
  return (
    <>
      <section className="hero" aria-labelledby="home-title">
        <div>
          <SampleLabel>Local product preview</SampleLabel>
          <h1 id="home-title">Trust doesn't end at login.</h1>
          <p className="hero__copy">Sensitive actions deserve a fresh look at the session, the evidence, and the rule behind each decision.</p>
          <div className="hero__actions">
            <Link className="button button--primary" href="/console/overview">Explore the demo console <Icon name="arrow" size={16}/></Link>
            <Link className="button" href="/developers">For developers</Link>
          </div>
          <p className="hero__note">Development preview with synthetic records. No real actions are protected.</p>
        </div>
        <EvidencePreview/>
      </section>
      <section className="home-sections" aria-label="How Sentriq approaches sensitive actions">
        <article className="home-section"><h2>Keep action context</h2><p>Connect a sensitive action to its session, application, and recorded signals.</p></article>
        <article className="home-section"><h2>Make rules readable</h2><p>See the deterministic rule that shaped a sample evaluation and its result.</p></article>
        <article className="home-section"><h2>Investigate with evidence</h2><p>Review recorded facts separately from inference and missing information.</p></article>
      </section>
    </>
  );
}

function EvidencePreview() {
  return (
    <section className="evidence-preview" aria-label="Sample evidence-to-decision flow">
      <div className="evidence-preview__top"><span>Northstar Workspace</span><SampleLabel>Sample event</SampleLabel></div>
      <div className="preview-timeline">
        <div className="preview-event"><span className="preview-event__dot"/><div className="preview-event__body"><strong>New device signal recorded</strong><span>Session <code>ses_alice_review</code> · event <code>evt_7814</code></span></div></div>
        <div className="preview-event"><span className="preview-event__dot"/><div className="preview-event__body"><strong>Data export evaluated</strong><span>Rule version 3 · event <code>evt_7815</code></span></div></div>
        <div className="preview-event"><span className="preview-event__dot"/><div className="preview-event__body"><strong>Verification not completed</strong><span>No export was authorized in this sample · event <code>evt_7816</code></span></div></div>
      </div>
      <div className="decision-preview">
        <div className="decision-preview__title"><span>Deterministic sample result</span><span className="status status--warning">STEP UP</span></div>
        <p>Fresh verification was required for this data export. An AI explanation does not make or change the decision.</p>
      </div>
    </section>
  );
}

export function FeaturesPage() {
  return (
    <section className="marketing-content">
      <header className="marketing-intro">
        <SampleLabel>Product preview</SampleLabel>
        <h1>Follow the evidence behind each action.</h1>
        <p>Sentriq's preview brings application setup, protected actions, policy configuration, session context, and event history into one developer view.</p>
      </header>
      <div className="marketing-grid">
        <article className="panel"><h2>Action context</h2><p>Review which sample user, application, session, and protected action appear in an evaluation.</p></article>
        <article className="panel"><h2>Readable policy rules</h2><p>Edit local demo settings and inspect rule versions. A real integrating backend would still need to enforce any decision.</p></article>
        <article className="panel"><h2>Session and event review</h2><p>Search synthetic event records and simulate a session revocation in the browser.</p></article>
        <article className="panel"><h2>Evidence-led investigation</h2><p>Explore a simulated investigation that separates recorded facts, inference, missing evidence, and next steps.</p></article>
      </div>
      <div className="callout section-gap"><strong>Preview boundary:</strong> This site is a frontend demo. It does not authenticate a developer, protect an action, or connect to a live security service.</div>
    </section>
  );
}

export function DevelopersPage() {
  const example = `// Stage A typed contract preview — no network request is made.\nimport type { EvaluationResult } from "@sentriq/sdk";\n\nconst sampleResult: EvaluationResult = {\n  decision: "STEP_UP",\n  reasonCode: "new_device",\n  riskScore: 68,\n  policyVersion: 3,\n  correlationId: "sample-correlation-id",\n};\n\n// In production, your trusted server would enforce the result.\n// This example only shows the shape of a sample response.`;

  return (
    <section className="marketing-content">
      <header className="marketing-intro">
        <SampleLabel>Stage A contract preview</SampleLabel>
        <h1>A clear contract for the server you control.</h1>
        <p>Keep sensitive-action checks on a trusted server. The snippet below uses the initial typed SDK result shape; it does not call Sentriq or enforce a policy.</p>
      </header>
      <div className="two-column">
        <div className="stack">
          <div className="panel"><h2>Server-side boundary</h2><p className="muted">A browser UI cannot protect a backend action. In a future integration, your server would evaluate an action and proceed only after a verified allow result.</p></div>
          <div className="panel"><h2>Start with the sample console</h2><p className="muted">Register sample applications, explore event evidence, and review local policy settings without creating credentials.</p><p className="section-gap"><Link className="button button--primary" href="/console/overview">Open development console</Link></p></div>
        </div>
        <div className="code-panel"><div className="code-panel__title">TypeScript · shape only · sample data</div><pre><code>{example}</code></pre></div>
      </div>
    </section>
  );
}

export function SecurityPage() {
  return (
    <section className="marketing-content">
      <header className="marketing-intro">
        <SampleLabel>Security preview</SampleLabel>
        <h1>Make the security boundary easy to see.</h1>
        <p>The console makes recorded evidence and proposed explanations legible. Enforcement belongs to a trusted server integration, not this browser preview.</p>
      </header>
      <div className="marketing-grid">
        <article className="panel"><h2>Recorded sample evidence</h2><p>Events show synthetic IDs, sample timestamps, action context, and a visible simulated marker.</p></article>
        <article className="panel"><h2>Policy decisions stay deterministic</h2><p>The sample evaluation result is stored as an event. The investigator does not compute or change that outcome.</p></article>
        <article className="panel"><h2>AI is simulated</h2><p>Sample answers cite only selected mock event IDs and separate facts from inference and missing evidence.</p></article>
        <article className="panel"><h2>No secrets in the demo</h2><p>The preview has no password fields, real API credentials, live API calls, or user authentication.</p></article>
      </div>
      <div className="callout callout--warning section-gap"><strong>Not a security control:</strong> Local sample changes do not revoke a real session or protect an account.</div>
    </section>
  );
}

export function PricingPage() {
  return (
    <section className="marketing-content">
      <header className="marketing-intro">
        <SampleLabel>Pricing preview</SampleLabel>
        <h1>Pricing details are still being shaped.</h1>
        <p>There is no live plan, rate, or billing workflow in this development preview.</p>
      </header>
      <div className="price-callout"><h2>Coming soon</h2><p>Plan names and prices are intentionally not shown as real offers. Explore the console with synthetic data while the product is in development.</p><p style={{ marginTop: 18 }}><Link className="button button--primary" href="/console/overview">Open the sample console</Link></p></div>
      <p className="muted small section-gap">No checkout or payment information is collected.</p>
    </section>
  );
}

export function AuthPageLayout({ children, activePath }: { children: ReactNode; activePath: string }) {
  return <PublicSite activePath={activePath}>{children}</PublicSite>;
}
