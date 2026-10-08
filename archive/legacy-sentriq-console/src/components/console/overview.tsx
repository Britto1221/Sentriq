"use client";

import Link from "next/link";
import { useDemo } from "@/lib/demo-context";
import { formatDate, PageHeading, SampleLabel, Status } from "@/components/ui";

export function OverviewPage() {
  const { data } = useDemo();
  const evaluations = data.events.filter((event) => event.type === "ACTION_EVALUATED");
  const allows = evaluations.filter((event) => event.outcome === "SUCCESS").length;
  const challenges = evaluations.filter((event) => event.outcome === "REQUIRED").length;
  const denials = evaluations.filter((event) => event.outcome === "DENIED").length;
  const activeSessions = data.sessions.filter((session) => session.status === "active").length;
  const events = data.events.slice(0, 4);
  const integrationsReady = data.applications.filter((application) => application.status === "Ready").length;

  return (
    <>
      <PageHeading title="Overview" description="A compact view of your sample applications, evaluations, and recent evidence." action={<SampleLabel>Sample workspace</SampleLabel>}/>
      <div className="metric-grid metric-grid--six" aria-label="Sample workspace summary">
        <Metric label="Applications" value={String(data.applications.length)} note="Registered sample apps"/>
        <Metric label="Allow results" value={String(allows)} note="Recorded sample outcomes"/>
        <Metric label="Challenges" value={String(challenges)} note="Fresh verification required"/>
        <Metric label="Denials" value={String(denials)} note="Recorded sample outcomes"/>
        <Metric label="Active sessions" value={String(activeSessions)} note="Synthetic sessions"/>
        <Metric label="Evaluation events" value={String(evaluations.length)} note="Stored sample events"/>
      </div>

      <div className="two-column section-gap">
        <section className="panel panel--flush" aria-labelledby="overview-events-heading">
          <div className="panel-heading" style={{ padding: "18px 18px 0" }}>
            <div><h2 id="overview-events-heading">Recent event evidence</h2><p>Latest stored sample events</p></div>
            <Link href="/console/events">View all</Link>
          </div>
          {events.length ? <div className="table-wrap"><table><thead><tr><th>Event</th><th>Application</th><th>Result</th><th>When</th></tr></thead><tbody>
            {events.map((event) => <tr key={event.id}><td><span className="row-title">{event.type.replaceAll("_", " ")}</span><span className="row-meta mono">{event.id}</span></td><td>{event.applicationName}<span className="row-meta">{event.actionId ?? "Session event"}</span></td><td><Status tone={event.outcome === "SUCCESS" ? "success" : event.outcome === "DENIED" || event.outcome === "FAILURE" ? "danger" : event.outcome === "REQUIRED" ? "warning" : "signal"}>{event.outcome}</Status></td><td>{formatDate(event.occurredAt)}</td></tr>)}
          </tbody></table></div> : <div className="table-empty">No sample events recorded yet.</div>}
        </section>
        <section className="panel" aria-labelledby="overview-health-heading">
          <div className="panel-heading"><div><h2 id="overview-health-heading">Integration setup</h2><p>Sample configuration status</p></div><Status tone="signal">Preview</Status></div>
          <div className="stack">
            <div className="switch-row"><div><strong>{integrationsReady} of {data.applications.length} apps marked ready</strong><p>This is saved sample metadata, not a health check.</p></div><Status tone={integrationsReady ? "success" : "warning"}>{integrationsReady ? "Configured" : "Setup"}</Status></div>
            <div className="callout">No API connection is configured. The integrating developer would enforce an evaluation on their trusted server.</div>
            <Link className="button" href="/console/integrations">View integration guidance</Link>
          </div>
        </section>
      </div>

      <section className="panel section-gap" aria-labelledby="overview-sessions-heading">
        <div className="panel-heading"><div><h2 id="overview-sessions-heading">Sessions to review</h2><p>Sample session inventory with illustrative risk indicators</p></div><Link href="/console/sessions">Review sessions</Link></div>
        <div className="table-wrap"><table><thead><tr><th>User</th><th>Application</th><th>Device</th><th>Sample risk</th><th>Status</th></tr></thead><tbody>
          {data.sessions.filter((session) => session.status === "active").slice(0, 3).map((session) => <tr key={session.id}><td><span className="row-title">{session.email}</span><span className="row-meta mono">{session.id}</span></td><td>{session.applicationName}</td><td>{session.deviceLabel}</td><td><span className="mono">{session.riskScore}/100</span><span className="row-meta">Fixture value</span></td><td><Status tone={session.riskScore > 50 ? "warning" : "success"}>{session.riskScore > 50 ? "Review" : "Active"}</Status></td></tr>)}
          {!data.sessions.some((session) => session.status === "active") && <tr><td colSpan={5} className="table-empty">No active sample sessions.</td></tr>}
        </tbody></table></div>
      </section>
      <p className="muted small section-gap">Every metric above comes from local sample fixtures. Evaluations are historical examples; no decision is being made now.</p>
    </>
  );
}

function Metric({ label, value, note }: { label: string; value: string; note: string }) {
  return <div className="metric"><span className="metric__label">{label}</span><strong className="metric__value">{value}</strong><span className="metric__note">{note}</span></div>;
}
