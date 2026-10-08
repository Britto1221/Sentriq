"use client";

import { useState, type FormEvent } from "react";
import type { ActionIdentifier, PolicyMode } from "@sentriq/shared";
import { useDemo } from "@/lib/demo-context";
import { ACTION_LABELS, REQUIRED_ACTIONS, type DemoSuggestion } from "@/lib/demo-data";
import { formatDate, Modal, PageHeading, SampleLabel, Status } from "@/components/ui";

const policyModes: { value: PolicyMode; label: string; explanation: string }[] = [
  { value: "ALLOW", label: "Allow", explanation: "Allow in this local policy preview." },
  { value: "CONTEXTUAL_RISK", label: "Contextual risk", explanation: "Use sample context to decide whether a challenge is needed." },
  { value: "STEP_UP", label: "Fresh verification", explanation: "Require a fresh verification step in the sample rule." },
  { value: "DENY", label: "Deny", explanation: "Deny in this local policy preview." },
];

export function ProtectedActionsPage() {
  const { data, setProtectedAction, savePolicy, notify } = useDemo();
  return (
    <>
      <PageHeading title="Protected actions" description="Choose which sensitive action types appear in the sample integration and how their local rules are configured." action={<SampleLabel>Local configuration</SampleLabel>}/>
      <div className="callout callout--warning"><strong>Browser preview only:</strong> These settings do not protect real data. Your server would need to evaluate and enforce the result before it performs a sensitive action.</div>
      <div className="stack section-gap">
        {REQUIRED_ACTIONS.map((actionId) => {
          const action = data.protectedActions[actionId];
          const policy = data.policies.find((item) => item.actionId === actionId);
          return <ProtectedActionEditor key={actionId} actionId={actionId} enabled={action?.enabled ?? true} description={action?.description ?? ""} mode={policy?.mode ?? "CONTEXTUAL_RISK"} onSave={(input) => {
            setProtectedAction({ actionId, enabled: input.enabled, description: input.description });
            savePolicy({ actionId, mode: input.mode, enabled: input.enabled });
            notify(`Sample configuration saved for ${ACTION_LABELS[actionId]}.`);
          }}/>;
        })}
      </div>
      <p className="muted small section-gap">The six Stage A action identifiers are shown. All outcomes in this interface are synthetic and have no effect outside this browser.</p>
    </>
  );
}

function ProtectedActionEditor({
  actionId,
  enabled,
  description,
  mode,
  onSave,
}: {
  actionId: ActionIdentifier;
  enabled: boolean;
  description: string;
  mode: PolicyMode;
  onSave(input: { enabled: boolean; description: string; mode: PolicyMode }): void;
}) {
  const [localEnabled, setLocalEnabled] = useState(enabled);
  const [localDescription, setLocalDescription] = useState(description);
  const [localMode, setLocalMode] = useState<PolicyMode>(mode);
  const [error, setError] = useState("");
  const [saved, setSaved] = useState(false);

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (localDescription.trim().length > 240) {
      setError("Description must be 240 characters or fewer.");
      setSaved(false);
      return;
    }
    setError("");
    onSave({ enabled: localEnabled, description: localDescription.trim(), mode: localMode });
    setSaved(true);
  }

  return (
    <form className="panel" onSubmit={submit}>
      <div className="panel-heading"><div><h2>{ACTION_LABELS[actionId]}</h2><p className="mono">{actionId}</p></div><Status tone={localEnabled ? "success" : "neutral"}>{localEnabled ? "Registered" : "Disabled"}</Status></div>
      <div className="two-column">
        <div className="stack">
          <label className="check-row"><input type="checkbox" checked={localEnabled} onChange={(event) => { setLocalEnabled(event.target.checked); setSaved(false); }}/><span><strong>Include this action in the sample integration</strong><br/><span className="small muted">This changes local configuration only.</span></span></label>
          <div className="field"><label htmlFor={`description-${actionId}`}>Developer description</label><textarea className="textarea" id={`description-${actionId}`} maxLength={240} value={localDescription} onChange={(event) => { setLocalDescription(event.target.value); setSaved(false); }}/><p className="field-hint">Use plain language to explain when this action is sensitive.</p></div>
        </div>
        <div className="stack">
          <div className="field"><label htmlFor={`mode-${actionId}`}>Sample policy choice</label><select className="select" id={`mode-${actionId}`} value={localMode} onChange={(event) => { setLocalMode(event.target.value as PolicyMode); setSaved(false); }}>{policyModes.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}</select><p className="field-hint">{policyModes.find((option) => option.value === localMode)?.explanation}</p></div>
          <div className="button-row"><button type="submit" className="button button--primary">Save sample configuration</button>{saved && <Status tone="success">Saved locally</Status>}</div>
          {error && <p className="field-error" role="alert">{error}</p>}
        </div>
      </div>
    </form>
  );
}

export function PoliciesPage() {
  const { data, savePolicy, createSuggestion, confirmSuggestion, dismissSuggestion, notify } = useDemo();
  const [reviewing, setReviewing] = useState<DemoSuggestion | null>(null);
  const latestEventIds = data.events.slice(0, 3).map((event) => event.id);

  function addDraft() {
    const event = data.events.find((item) => item.actionId) ?? data.events[0];
    const actionId = event?.actionId ?? "data.export";
    createSuggestion({ actionId, citedEventIds: latestEventIds });
    notify("Sample policy suggestion created as a draft.");
  }

  return (
    <>
      <PageHeading title="Policies" description="Review deterministic sample rules and policy suggestion drafts." action={<button className="button" onClick={addDraft}>Create sample draft</button>}/>
      <div className="callout callout--warning"><strong>Server enforcement required:</strong> The browser does not make security decisions. A real integrating backend must enforce its deterministic policy before carrying out an action.</div>
      <section className="panel section-gap">
        <div className="panel-heading"><div><h2>Deterministic sample rules</h2><p>Local rule configuration. Past event outcomes remain recorded as they were.</p></div><SampleLabel>Sample policy</SampleLabel></div>
        <div className="table-wrap"><table><thead><tr><th>Protected action</th><th>Sample rule</th><th>Enabled</th><th>Version</th><th>Updated</th><th>Change rule</th></tr></thead><tbody>
          {REQUIRED_ACTIONS.map((actionId) => <PolicyEditRow key={actionId} actionId={actionId} mode={data.policies.find((policy) => policy.actionId === actionId)?.mode ?? "CONTEXTUAL_RISK"} enabled={data.policies.find((policy) => policy.actionId === actionId)?.enabled ?? true} version={data.policies.find((policy) => policy.actionId === actionId)?.version ?? 1} updatedAt={data.policies.find((policy) => policy.actionId === actionId)?.updatedAt} onSave={(mode, enabled) => { savePolicy({ actionId, mode, enabled }); notify(`Sample rule saved for ${ACTION_LABELS[actionId]}.`); }}/>) }
        </tbody></table></div>
        <p className="muted small" style={{ margin: "14px 16px" }}>Editing a sample rule does not re-evaluate history or update a real security policy.</p>
      </section>
      <section className="panel section-gap">
        <div className="panel-heading"><div><h2>Policy suggestions</h2><p>AI-style suggestions are simulated and remain drafts until you review and confirm.</p></div><Status tone="signal">Simulated AI</Status></div>
        {data.suggestions.length ? <div className="stack">{data.suggestions.map((suggestion) => <div className="switch-row" key={suggestion.id}><div><strong>{suggestion.title}</strong><p>{suggestion.rationale}</p><span className="row-meta">Scope: {suggestion.applicationId} · {suggestion.actionId}</span></div><div className="button-row"><Status tone={suggestion.status === "confirmed" ? "success" : suggestion.status === "dismissed" ? "neutral" : "warning"}>{suggestion.status}</Status>{suggestion.status === "draft" && <button className="button" onClick={() => setReviewing(suggestion)}>Review draft</button>}</div></div>)}</div> : <p className="muted">No sample suggestions are available.</p>}
      </section>
      <Modal
        open={Boolean(reviewing)}
        onClose={() => setReviewing(null)}
        title="Review sample policy suggestion"
        description="AI is simulated. Confirming changes local rule configuration only; it does not change or recalculate past decisions."
        footer={reviewing && <><button className="button" onClick={() => setReviewing(null)}>Keep as draft</button><button className="button button--quiet" onClick={() => { dismissSuggestion(reviewing.id); notify("Draft dismissed in the local preview.", "info"); setReviewing(null); }}>Dismiss draft</button><button className="button button--primary" onClick={() => { confirmSuggestion(reviewing.id); notify("Sample rule configuration confirmed. Historical decisions were not recalculated."); setReviewing(null); }}>Confirm local rule change</button></>}
      >
        {reviewing && <SuggestionDetails suggestion={reviewing}/>}
      </Modal>
    </>
  );
}

function SuggestionDetails({ suggestion }: { suggestion: DemoSuggestion }) {
  const { data } = useDemo();
  return <div className="stack"><div><p className="eyebrow">Draft proposal</p><h3>{suggestion.title}</h3></div><dl className="kv-list"><dt>Application</dt><dd>{data.applications.find((app) => app.id === suggestion.applicationId)?.name ?? suggestion.applicationId}</dd><dt>Action</dt><dd>{ACTION_LABELS[suggestion.actionId]} <span className="mono">({suggestion.actionId})</span></dd><dt>Proposed rule</dt><dd>{suggestion.proposedMode.replaceAll("_", " ")}</dd><dt>Rationale</dt><dd>{suggestion.rationale}</dd><dt>Evidence references</dt><dd>{suggestion.citedEventIds.length ? suggestion.citedEventIds.map((id) => <span className="sample-value mono" style={{ margin: "0 5px 5px 0" }} key={id}>{id}</span>) : "No event IDs attached"}</dd></dl><div className="callout">Review every cited event before confirming. This simulation cannot calculate risk or change an evaluation result.</div></div>;
}

function PolicyEditRow({ actionId, mode, enabled, version, updatedAt, onSave }: { actionId: ActionIdentifier; mode: PolicyMode; enabled: boolean; version: number; updatedAt?: string; onSave(mode: PolicyMode, enabled: boolean): void }) {
  const [draftMode, setDraftMode] = useState(mode);
  const [draftEnabled, setDraftEnabled] = useState(enabled);
  return <tr><td><strong>{ACTION_LABELS[actionId]}</strong><span className="row-meta mono">{actionId}</span></td><td><Status tone={draftMode === "DENY" ? "danger" : draftMode === "STEP_UP" ? "warning" : "signal"}>{draftMode.replaceAll("_", " ")}</Status></td><td>{draftEnabled ? "Yes" : "No"}</td><td>v{version}</td><td>{formatDate(updatedAt)}</td><td><div className="stack" style={{ gap: 7 }}><select className="select" aria-label={`Sample rule for ${actionId}`} value={draftMode} onChange={(event) => setDraftMode(event.target.value as PolicyMode)}>{policyModes.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}</select><label className="check-row small"><input type="checkbox" checked={draftEnabled} onChange={(event) => setDraftEnabled(event.target.checked)}/>Enabled</label><button className="button" onClick={() => onSave(draftMode, draftEnabled)}>Save rule</button></div></td></tr>;
}
