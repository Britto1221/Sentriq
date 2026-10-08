"use client";

import Link from "next/link";
import { useState, type FormEvent } from "react";
import { applicationInputSchema } from "@sentriq/shared";
import { useDemo } from "@/lib/demo-context";
import { ACTION_LABELS, REQUIRED_ACTIONS } from "@/lib/demo-data";
import { DemoNotice, EmptyState, formatDate, Modal, PageHeading, Status } from "@/components/ui";

export function ApplicationsPage() {
  const { data, createApplication, notify } = useDemo();
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [origins, setOrigins] = useState("http://localhost:3001");
  const [error, setError] = useState("");

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const parsed = applicationInputSchema.safeParse({ name, origins: origins.split(/[\n,]+/).map((origin) => origin.trim()).filter(Boolean) });
    if (!parsed.success) {
      setError(parsed.error.issues[0]?.message ?? "Check the application details and try again.");
      return;
    }
    createApplication(parsed.data);
    notify("Sample application added to this browser.");
    setOpen(false);
    setName("");
    setOrigins("http://localhost:3001");
    setError("");
  }

  return (
    <>
      <PageHeading title="Applications" description="Manage registered sample apps and review their local setup." action={<button className="button button--primary" onClick={() => setOpen(true)}>Add application</button>}/>
      {data.applications.length ? <section className="panel panel--flush"><div className="table-wrap"><table><thead><tr><th>Application</th><th>Allowed origins</th><th>Actions</th><th>Added</th><th>Status</th></tr></thead><tbody>
        {data.applications.map((application) => <tr key={application.id}><td><Link className="row-title" href={`/console/applications/${encodeURIComponent(application.id)}`}>{application.name}</Link><span className="row-meta mono">{application.id}</span></td><td>{application.origins.map((origin) => <span className="row-meta mono" key={origin}>{origin}</span>)}</td><td>{REQUIRED_ACTIONS.length}<span className="row-meta">sample actions</span></td><td>{formatDate(application.createdAt)}</td><td><Status tone={application.status === "Ready" ? "success" : "warning"}>{application.status}</Status></td></tr>)}
      </tbody></table></div></section> : <EmptyState title="No applications yet" description="Add a sample application to explore local setup and policy views." action={<button className="button button--primary" onClick={() => setOpen(true)}>Add application</button>}/>}
      <p className="muted small section-gap">Origins are local demo metadata. They are not checked by a live security service.</p>
      <Modal open={open} onClose={() => setOpen(false)} title="Add sample application" description="The app is stored in this browser. No credentials or live integration are created." footer={<><button className="button" type="button" onClick={() => setOpen(false)}>Cancel</button><button className="button button--primary" type="submit" form="application-form">Add sample app</button></>}>
        <form id="application-form" className="stack" onSubmit={submit} noValidate>
          <div className="field"><label htmlFor="app-name">Application name</label><input className="input" id="app-name" value={name} maxLength={80} onChange={(event) => setName(event.target.value)} aria-describedby={error ? "app-error" : "app-name-hint"} required/><p id="app-name-hint" className="field-hint">Use a name that helps you identify this sample integration.</p></div>
          <div className="field"><label htmlFor="app-origins">Allowed origins</label><textarea className="textarea mono" id="app-origins" value={origins} onChange={(event) => setOrigins(event.target.value)} aria-describedby={error ? "app-error" : "app-origin-hint"} required/><p id="app-origin-hint" className="field-hint">Enter HTTPS origins, or localhost HTTP origins. Separate multiple entries with commas or new lines.</p></div>
          {error && <p className="field-error" id="app-error" role="alert">{error}</p>}
          <p className="muted small">Protected actions shown for this app: {REQUIRED_ACTIONS.map((action) => ACTION_LABELS[action]).join(", ")}.</p>
        </form>
      </Modal>
    </>
  );
}

export function ApplicationDetailPage({ applicationId }: { applicationId: string }) {
  const { data } = useDemo();
  const application = data.applications.find((item) => item.id === applicationId);
  if (!application) return <EmptyState title="Application not found" description="This sample application ID is not present in the local workspace." action={<Link className="button" href="/console/applications">Back to applications</Link>}/>;
  const keys = data.apiKeys.filter((key) => key.applicationId === application.id);
  const policies = data.policies.filter((policy) => policy.applicationId === application.id);
  const events = data.events.filter((event) => event.applicationId === application.id).slice(0, 4);
  return (
    <>
      <PageHeading title={application.name} description={`Sample application · ${application.id}`} action={<><Link className="button" href="/console/applications">All applications</Link><Link className="button button--primary" href="/console/api-keys">Manage sample keys</Link></>}/>
      <div className="callout callout--warning"><strong>Enforcement boundary:</strong> This page is browser-only. An integrating developer must check and enforce any policy result on their trusted backend.</div>
      <div className="two-column section-gap">
        <section className="panel"><div className="panel-heading"><div><h2>Application details</h2><p>Local sample configuration</p></div><Status tone={application.status === "Ready" ? "success" : "warning"}>{application.status}</Status></div><dl className="kv-list"><dt>Application ID</dt><dd className="mono">{application.id}</dd><dt>Added</dt><dd>{formatDate(application.createdAt)}</dd><dt>Origin</dt><dd>{application.origins.map((origin) => <div className="mono" key={origin}>{origin}</div>)}</dd></dl></section>
        <section className="panel"><div className="panel-heading"><div><h2>Protected actions</h2><p>{REQUIRED_ACTIONS.length} supported sample actions</p></div><Link href="/console/protected-actions">Edit</Link></div><ul className="evidence-list">{REQUIRED_ACTIONS.map((action) => <li key={action}><strong>{ACTION_LABELS[action]}</strong><span className="row-meta mono">{action}</span></li>)}</ul></section>
        <section className="panel"><div className="panel-heading"><div><h2>Policy rules</h2><p>Stored local settings</p></div><Link href="/console/policies">Open policies</Link></div>{policies.length ? <div className="stack">{policies.slice(0, 4).map((policy) => <div className="switch-row" key={policy.id}><div><strong>{ACTION_LABELS[policy.actionId]}</strong><p>Version {policy.version}</p></div><Status tone={policy.mode === "DENY" ? "danger" : policy.mode === "STEP_UP" ? "warning" : "signal"}>{policy.mode.replaceAll("_", " ")}</Status></div>)}</div> : <p className="muted">No sample policy rules for this application yet.</p>}</section>
        <section className="panel"><div className="panel-heading"><div><h2>Sample key records</h2><p>No credential values are stored</p></div><Link href="/console/api-keys">View keys</Link></div>{keys.length ? keys.map((key) => <div className="switch-row" key={key.id}><div><strong>{key.name}</strong><p>{key.scopes.join(", ")}</p></div><Status tone={key.status === "active" ? "success" : "danger"}>{key.status}</Status></div>) : <p className="muted">No key records for this app.</p>}</section>
      </div>
      <section className="panel section-gap"><div className="panel-heading"><div><h2>Recent evaluations</h2><p>Recorded sample evidence from this app</p></div><Link href="/console/events">See all events</Link></div>{events.length ? <div className="table-wrap"><table><thead><tr><th>Event</th><th>Subject</th><th>Action</th><th>Result</th><th>When</th></tr></thead><tbody>{events.map((event) => <tr key={event.id}><td><span className="row-title">{event.type.replaceAll("_", " ")}</span><span className="row-meta mono">{event.id}</span></td><td>{event.subjectEmail}</td><td>{event.actionId ?? "—"}</td><td><Status tone={event.outcome === "DENIED" || event.outcome === "FAILURE" ? "danger" : event.outcome === "REQUIRED" ? "warning" : "signal"}>{event.outcome}</Status></td><td>{formatDate(event.occurredAt)}</td></tr>)}</tbody></table></div> : <p className="muted">No events for this app yet.</p>}</section>
    </>
  );
}
