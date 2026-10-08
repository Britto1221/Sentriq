"use client";

import { useMemo, useState, type FormEvent, type ReactNode } from "react";
import Link from "next/link";
import type { InvestigationAnswer } from "@sentriq/shared";
import { useDemo } from "@/lib/demo-context";
import { ACTION_LABELS, type DemoEvent, type DemoSession } from "@/lib/demo-data";
import { createMockInvestigationAnswer } from "@/lib/investigation";
import { EmptyState, formatDate, formatTime, Modal, PageHeading, Status } from "@/components/ui";

export function SessionsPage() {
  const { data, revokeSession, notify } = useDemo();
  const [search, setSearch] = useState("");
  const [application, setApplication] = useState("");
  const [status, setStatus] = useState("");
  const [selected, setSelected] = useState<DemoSession | null>(null);
  const [pendingRevoke, setPendingRevoke] = useState<DemoSession | null>(null);

  const filtered = data.sessions.filter((session) => {
    const query = search.toLowerCase();
    return (!query || `${session.email} ${session.id} ${session.deviceLabel} ${session.browser}`.toLowerCase().includes(query))
      && (!application || session.applicationId === application)
      && (!status || session.status === status);
  });

  function confirmRevoke() {
    if (!pendingRevoke) return;
    revokeSession(pendingRevoke.id);
    notify(`Sample session ${pendingRevoke.id} marked revoked locally.`, "info");
    setPendingRevoke(null);
    setSelected(null);
  }

  return (
    <>
      <PageHeading title="Sessions" description="Inspect synthetic session records and simulate a local revocation."/>
      <div className="callout callout--warning"><strong>Simulation:</strong> Revoking a row changes local sample state only. No server session, token, or account is affected.</div>
      <div className="filter-row" role="search" aria-label="Filter sample sessions">
        <div className="field"><label htmlFor="session-search">Search user or session</label><input className="input" id="session-search" value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Email, ID, device"/></div>
        <div className="field"><label htmlFor="session-app-filter">Application</label><select className="select" id="session-app-filter" value={application} onChange={(event) => setApplication(event.target.value)}><option value="">All applications</option>{data.applications.map((app) => <option value={app.id} key={app.id}>{app.name}</option>)}</select></div>
        <div className="field"><label htmlFor="session-status-filter">Status</label><select className="select" id="session-status-filter" value={status} onChange={(event) => setStatus(event.target.value)}><option value="">All statuses</option><option value="active">Active</option><option value="revoked">Revoked</option><option value="expired">Expired</option></select></div>
      </div>
      {filtered.length ? <section className="panel panel--flush"><div className="table-wrap"><table><thead><tr><th>User / session</th><th>Application</th><th>Device and network</th><th>Risk</th><th>Last activity</th><th>Status</th><th>Inspect</th></tr></thead><tbody>
        {filtered.map((session) => <tr key={session.id}><td><strong>{session.email}</strong><span className="row-meta mono">{session.id}</span>{session.current && <span className="row-meta">Current sample session</span>}</td><td>{session.applicationName}</td><td>{session.browser}<span className="row-meta">{session.network}</span></td><td><span className="mono">{session.riskScore}/100</span><span className="row-meta">Illustrative fixture</span></td><td>{formatDate(session.lastSeenAt)}</td><td><Status tone={session.status === "active" ? session.riskScore > 50 ? "warning" : "success" : session.status === "revoked" ? "danger" : "neutral"}>{session.status}</Status></td><td><button className="table-action" onClick={() => setSelected(session)}>Inspect</button></td></tr>)}
      </tbody></table></div></section> : <EmptyState title="No matching sessions" description="Adjust the user, application, or status filters to see sample sessions."/>}
      <p className="muted small section-gap">Approximate network context and risk scores are synthetic fixtures. No session tokens are displayed.</p>
      <Modal open={Boolean(selected)} onClose={() => setSelected(null)} title="Sample session details" description="All values below are synthetic. Session tokens are never shown." footer={selected && <>{selected.status === "active" && <button className="button button--danger" onClick={() => { setPendingRevoke(selected); setSelected(null); }}>Simulate revoke</button>}<button className="button" onClick={() => setSelected(null)}>Close details</button></>}>
        {selected && <dl className="kv-list"><dt>User</dt><dd>{selected.email}</dd><dt>Session ID</dt><dd className="mono">{selected.id}</dd><dt>Application</dt><dd>{selected.applicationName}</dd><dt>Device</dt><dd>{selected.deviceLabel}</dd><dt>Browser</dt><dd>{selected.browser}</dd><dt>Network</dt><dd>{selected.network}</dd><dt>Created</dt><dd>{formatDate(selected.createdAt)}</dd><dt>Last seen</dt><dd>{formatDate(selected.lastSeenAt)}</dd><dt>Expires</dt><dd>{formatDate(selected.expiresAt)}</dd><dt>Sample risk score</dt><dd>{selected.riskScore}/100 · fixture</dd><dt>Signals</dt><dd>{selected.signals.join(", ")}</dd><dt>Status</dt><dd>{selected.status}</dd></dl>}
      </Modal>
      <Modal open={Boolean(pendingRevoke)} onClose={() => setPendingRevoke(null)} title="Simulate session revocation?" description="This action only updates the local sample row and appends a sample event." footer={<><button className="button" onClick={() => setPendingRevoke(null)}>Cancel</button><button className="button button--danger" onClick={confirmRevoke}>Mark sample revoked</button></>}>
        {pendingRevoke && <p>Mark <span className="mono">{pendingRevoke.id}</span> as revoked in this browser preview?</p>}
      </Modal>
    </>
  );
}

export function EventsPage() {
  const { data } = useDemo();
  const [search, setSearch] = useState("");
  const [type, setType] = useState("");
  const [outcome, setOutcome] = useState("");
  const eventTypes = [...new Set(data.events.map((event) => event.type))];
  const outcomes = [...new Set(data.events.map((event) => event.outcome))];
  const filtered = data.events.filter((event) => {
    const query = search.toLowerCase();
    return (!query || `${event.id} ${event.type} ${event.subjectEmail} ${event.sessionId ?? ""} ${event.applicationName} ${event.actionId ?? ""}`.toLowerCase().includes(query))
      && (!type || event.type === type)
      && (!outcome || event.outcome === outcome);
  });
  return (
    <>
      <PageHeading title="Events" description="Search the stored sample event history and inspect decision evidence."/>
      <div className="filter-row" role="search" aria-label="Filter sample events">
        <div className="field"><label htmlFor="event-search">Search events</label><input className="input" id="event-search" value={search} onChange={(event) => setSearch(event.target.value)} placeholder="ID, user, session, action"/></div>
        <div className="field"><label htmlFor="event-type-filter">Event type</label><select className="select" id="event-type-filter" value={type} onChange={(event) => setType(event.target.value)}><option value="">All types</option>{eventTypes.map((eventType) => <option key={eventType} value={eventType}>{eventType.replaceAll("_", " ")}</option>)}</select></div>
        <div className="field"><label htmlFor="event-outcome-filter">Outcome</label><select className="select" id="event-outcome-filter" value={outcome} onChange={(event) => setOutcome(event.target.value)}><option value="">All outcomes</option>{outcomes.map((item) => <option key={item}>{item}</option>)}</select></div>
      </div>
      {filtered.length ? <section className="panel panel--flush"><div className="table-wrap"><table><thead><tr><th>Event / timestamp</th><th>Application</th><th>Subject / session</th><th>Action</th><th>Outcome</th><th>Evidence</th></tr></thead><tbody>
        {filtered.map((event) => <tr id={`event-${event.id}`} key={event.id}><td><strong>{event.type.replaceAll("_", " ")}</strong><span className="row-meta mono">{event.id}</span><span className="row-meta">{formatDate(event.occurredAt)}</span></td><td>{event.applicationName}</td><td>{event.subjectEmail}<span className="row-meta mono">{event.sessionId ?? "No session ID"}</span></td><td>{event.actionId ?? "—"}</td><td><Status tone={event.outcome === "SUCCESS" ? "success" : event.outcome === "DENIED" || event.outcome === "FAILURE" ? "danger" : event.outcome === "REQUIRED" ? "warning" : "signal"}>{event.outcome}</Status></td><td><span className="row-title">{event.summary}</span><span className="row-meta">Policy v{event.policyVersion ?? "—"} · risk {event.riskScore ?? "—"}/100 · simulated</span></td></tr>)}
      </tbody></table></div></section> : <EmptyState title="No matching events" description="Try a different search or remove one of the filters."/>}
      <p className="muted small section-gap">Event filters operate over local mock records. Nothing is fetched from an API.</p>
    </>
  );
}

export function InvestigatePage() {
  const { data, createSuggestion, notify } = useDemo();
  const [selectedEventId, setSelectedEventId] = useState(data.events[0]?.id ?? "");
  const [question, setQuestion] = useState("Why was a fresh verification required for this export?");
  const [answer, setAnswer] = useState<InvestigationAnswer | null>(null);
  const [answering, setAnswering] = useState(false);
  const [error, setError] = useState("");
  const selectedEvent = data.events.find((event) => event.id === selectedEventId) ?? data.events[0];
  const incidentEvents = useMemo(() => {
    if (!selectedEvent) return [];
    const associated = selectedEvent.sessionId
      ? data.events.filter((event) => event.sessionId === selectedEvent.sessionId)
      : [selectedEvent];
    return [...associated].sort((a, b) => a.occurredAt.localeCompare(b.occurredAt));
  }, [data.events, selectedEvent]);

  function ask(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    if (!question.trim()) {
      setError("Enter a question about the selected sample event.");
      return;
    }
    setAnswering(true);
    window.setTimeout(() => {
      setAnswer(createMockInvestigationAnswer(incidentEvents, question.trim()));
      setAnswering(false);
    }, 280);
  }

  function createDraft() {
    if (!answer) return;
    const citedEventIds = answer.citedEventIds.filter((id) => incidentEvents.some((event) => event.id === id));
    const actionId = incidentEvents.find((event) => event.actionId)?.actionId ?? "data.export";
    createSuggestion({ actionId, citedEventIds });
    notify("Draft policy suggestion created. Review it in Policies before confirming.", "info");
  }

  const suggestions = [
    "What is recorded for this session?",
    "Why was a fresh verification required?",
    "Which evidence is still missing?",
    "Can these events identify who used the device?",
  ];

  return (
    <>
      <PageHeading title="Investigate" description="Ask a question about stored sample events. Answers are generated locally and do not change policy outcomes." action={<Status tone="signal">AI simulated</Status>}/>
      <div className="callout callout--warning"><strong>Simulated investigator:</strong> No model or live API is used. Facts come only from the selected sample events; AI-style output never calculates risk, identifies a person, or changes policy decisions.</div>
      {data.events.length ? <div className="two-column section-gap">
        <div className="stack">
          <section className="panel"><div className="panel-heading"><div><h2>Incident context</h2><p>Choose one stored event as the investigation anchor.</p></div><span className="sample-label">Sample incident</span></div>
            <div className="field"><label htmlFor="incident-event">Anchor event</label><select className="select" id="incident-event" value={selectedEvent?.id ?? ""} onChange={(event) => { setSelectedEventId(event.target.value); setAnswer(null); }}>
              {data.events.map((item) => <option key={item.id} value={item.id}>{item.id} · {item.type.replaceAll("_", " ")}</option>)}
            </select></div>
            {selectedEvent && <dl className="kv-list section-gap"><dt>Application</dt><dd>{selectedEvent.applicationName}</dd><dt>Subject</dt><dd>{selectedEvent.subjectEmail}</dd><dt>Session</dt><dd className="mono">{selectedEvent.sessionId ?? "Not recorded"}</dd><dt>Protected action</dt><dd>{selectedEvent.actionId ? ACTION_LABELS[selectedEvent.actionId] : "None recorded"}</dd><dt>Recorded outcome</dt><dd><Status tone={selectedEvent.outcome === "DENIED" || selectedEvent.outcome === "FAILURE" ? "danger" : selectedEvent.outcome === "REQUIRED" ? "warning" : "signal"}>{selectedEvent.outcome}</Status></dd><dt>Sample risk</dt><dd>{selectedEvent.riskScore ?? "Not recorded"}{selectedEvent.riskScore !== undefined ? "/100 · fixture" : ""}</dd></dl>}
          </section>
          <section className="panel"><div className="panel-heading"><div><h2>Recorded timeline</h2><p>Only events linked to the selected session are included.</p></div></div>
            {incidentEvents.length ? <div className="timeline">{incidentEvents.map((event) => <div className="timeline-item" id={`event-${event.id}`} key={event.id}><time className="timeline-time" dateTime={event.occurredAt}>{formatTime(event.occurredAt)}</time><span className="timeline-dot"/><div className="timeline-copy"><strong>{event.type.replaceAll("_", " ")} · {event.outcome}</strong><p>{event.summary} <a href={`#event-${event.id}`} className="mono">{event.id}</a></p></div></div>)}</div> : <p className="muted">No related events.</p>}
          </section>
        </div>
        <section className="panel"><div className="panel-heading"><div><h2>Ask about the evidence</h2><p>Questions stay in this browser and do not leave the sample adapter.</p></div><Status tone="signal">Simulated AI</Status></div>
          <div className="field"><span className="field-label">Suggested questions</span><div className="button-row">{suggestions.map((item) => <button key={item} className="button button--quiet" type="button" onClick={() => setQuestion(item)}>{item}</button>)}</div></div>
          <form className="stack section-gap" onSubmit={ask}>
            <div className="field"><label htmlFor="investigation-question">Your question</label><textarea className="textarea" id="investigation-question" value={question} onChange={(event) => setQuestion(event.target.value)} maxLength={500} aria-describedby={error ? "investigation-error" : "investigation-hint"}/><p id="investigation-hint" className="field-hint">The local response is illustrative and uses the selected mock records.</p></div>
            {error && <p id="investigation-error" className="field-error" role="alert">{error}</p>}
            <button className="button button--primary" type="submit" disabled={answering}>{answering ? "Preparing sample answer…" : "Ask simulated investigator"}</button>
          </form>
          {answer && <div className="stack section-gap" aria-live="polite">
            <div className="callout"><strong>AI is simulated.</strong> This answer was generated from local sample data. No policy decision was made or changed.</div>
            <AnswerSection title="Recorded facts">{answer.recordedFacts.length ? <ul className="evidence-list">{answer.recordedFacts.map((fact) => <li key={fact.eventId}>{fact.text} <a href={`#event-${fact.eventId}`} className="mono">[{fact.eventId}]</a></li>)}</ul> : <p className="muted">No facts are available for the selected event.</p>}</AnswerSection>
            <AnswerSection title="Inference"><ul className="evidence-list">{answer.inferences.map((item) => <li key={item}>{item}</li>)}</ul></AnswerSection>
            <AnswerSection title="Missing evidence"><ul className="evidence-list">{answer.missingEvidence.map((item) => <li key={item}>{item}</li>)}</ul></AnswerSection>
            <AnswerSection title="Next steps"><ul className="evidence-list">{answer.nextSteps.map((item) => <li key={item}>{item}</li>)}</ul></AnswerSection>
            <p className="small muted">Citations checked against selected sample event IDs: {answer.citedEventIds.map((id) => <span className="mono" key={id}>{id} </span>)}</p>
            <button className="button" type="button" onClick={createDraft}>Create draft policy suggestion</button>
          </div>}
        </section>
      </div> : <EmptyState title="No sample events" description="The investigator needs a stored sample event to build a mock answer."/>}
    </>
  );
}

function AnswerSection({ title, children }: { title: string; children: ReactNode }) {
  return <section className="panel" style={{ padding: 14 }}><h3>{title}</h3>{children}</section>;
}
