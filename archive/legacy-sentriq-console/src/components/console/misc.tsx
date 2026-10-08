"use client";

import { useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { useTranslation } from "@sentriq/access";
import { AccessPreferencesPanel } from "@sentriq/access";
import { useDemo } from "@/lib/demo-context";
import { EmptyState, formatDate, Icon, Modal, PageHeading, SampleLabel, Status } from "@/components/ui";

const demoDisplay = "SAMPLE ONLY · NOT AN API KEY";
const scopes = ["events:read", "evaluations:write", "policies:read"];

export function ApiKeysPage() {
  const { data, createApiKey, revealApiKey, revokeApiKey, notify } = useDemo();
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [applicationId, setApplicationId] = useState(data.applications[0]?.id ?? "");
  const [selectedScopes, setSelectedScopes] = useState<string[]>(["events:read"]);
  const [error, setError] = useState("");
  const [pending, setPending] = useState<string | null>(null);

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (name.trim().length < 2) { setError("Give this sample key record a name with at least 2 characters."); return; }
    if (!applicationId) { setError("Add an application before creating a sample key record."); return; }
    if (selectedScopes.length === 0) { setError("Choose at least one sample scope."); return; }
    createApiKey({ applicationId, name: name.trim(), scopes: selectedScopes });
    notify("Sample key record created. No credential value was generated.", "info");
    setOpen(false);
    setName("");
    setSelectedScopes(["events:read"]);
    setError("");
  }

  async function copySampleLabel() {
    try {
      await navigator.clipboard.writeText(demoDisplay);
      notify("Copied the non-credential sample label to the clipboard.", "info");
    } catch {
      notify("Clipboard access was unavailable. The sample label remains visible on screen.", "error");
    }
  }

  return (
    <>
      <PageHeading title="API keys" description="Review local metadata records for future application credentials." action={<button className="button button--primary" onClick={() => { setApplicationId(data.applications[0]?.id ?? ""); setOpen(true); }}>Create sample record</button>}/>
      <div className="callout callout--warning"><strong>No credentials exist here.</strong> This page never creates, stores, or sends an API key. The display action reveals a text label that is not a credential.</div>
      {data.apiKeys.length ? <section className="panel panel--flush section-gap"><div className="table-wrap"><table><thead><tr><th>Key record</th><th>Application</th><th>Scopes</th><th>Created</th><th>Last used</th><th>Status</th><th>Sample display / action</th></tr></thead><tbody>
        {data.apiKeys.map((key) => <tr key={key.id}><td><strong>{key.name}</strong><span className="row-meta mono">{key.id}</span></td><td>{data.applications.find((app) => app.id === key.applicationId)?.name ?? "Unknown sample app"}</td><td>{key.scopes.map((scope) => <span className="row-meta mono" key={scope}>{scope}</span>)}</td><td>{formatDate(key.createdAt)}</td><td>{key.lastUsedAt ? `${formatDate(key.lastUsedAt)} · sample` : "Never · sample"}</td><td><Status tone={key.status === "active" ? "success" : "danger"}>{key.status}</Status></td><td><div className="stack" style={{ gap: 8 }}>
          {key.sampleShown ? <><span className="sample-value">{demoDisplay}</span><button className="button button--quiet" onClick={copySampleLabel}>Copy sample label</button></> : <button className="button" onClick={() => { revealApiKey(key.id); notify("Displayed sample text only. No key was revealed.", "info"); }}>Show sample value once</button>}
          {key.status === "active" ? <button className="button button--danger" onClick={() => setPending(key.id)}>Simulate revoke</button> : <span className="row-meta">Revoked in this browser</span>}
        </div></td></tr>)}
      </tbody></table></div></section> : <EmptyState title="No sample key records" description="Create a metadata-only record to explore scope and revoke states." action={<button className="button button--primary" onClick={() => setOpen(true)}>Create sample record</button>}/>}
      <p className="muted small section-gap">Timestamps and scopes are synthetic. No real secrets appear in this browser.</p>
      <Modal open={open} onClose={() => setOpen(false)} title="Create sample key record" description="This adds metadata to the local demo state. It does not generate a key or secret." footer={<><button className="button" onClick={() => setOpen(false)}>Cancel</button><button className="button button--primary" type="submit" form="sample-key-form">Add record</button></>}>
        <form className="stack" id="sample-key-form" onSubmit={submit} noValidate>
          <div className="field"><label htmlFor="key-name">Record name</label><input className="input" id="key-name" value={name} onChange={(event) => setName(event.target.value)} maxLength={80} aria-describedby="key-name-hint" required/><p id="key-name-hint" className="field-hint">A label only. Do not enter credentials or passwords.</p></div>
          <div className="field"><label htmlFor="key-app">Application</label><select className="select" id="key-app" value={applicationId} onChange={(event) => setApplicationId(event.target.value)}>{data.applications.map((app) => <option key={app.id} value={app.id}>{app.name}</option>)}</select></div>
          <fieldset className="field" style={{ border: 0, padding: 0, margin: 0 }}><legend className="field-label">Sample scopes</legend><p className="field-hint">These are labels in the demo, not enforced permissions.</p>{scopes.map((scope) => <label className="check-row" key={scope}><input type="checkbox" checked={selectedScopes.includes(scope)} onChange={(event) => setSelectedScopes((current) => event.target.checked ? [...current, scope] : current.filter((item) => item !== scope))}/><span className="mono">{scope}</span></label>)}</fieldset>
          {error && <p className="field-error" role="alert">{error}</p>}
        </form>
      </Modal>
      <Modal open={Boolean(pending)} onClose={() => setPending(null)} title="Simulate key-record revocation?" description="The local metadata record will be marked revoked. No real credential exists to revoke." footer={<><button className="button" onClick={() => setPending(null)}>Cancel</button><button className="button button--danger" onClick={() => { if (pending) { revokeApiKey(pending); notify("Sample key record marked revoked locally.", "info"); } setPending(null); }}>Mark record revoked</button></>}>
        <p>This change only affects sample UI state in the current browser.</p>
      </Modal>
    </>
  );
}

export function IntegrationsPage() {
  const { data, notify } = useDemo();
  const example = `import type { EvaluationResult } from "@sentriq/sdk";\n\n// Stage A contract preview; no request is made.\nconst result: EvaluationResult = {\n  decision: "STEP_UP",\n  reasonCode: "new_device",\n  riskScore: 68,\n  policyVersion: 3,\n  correlationId: "sample-correlation-id",\n};\n\n// Your trusted server would enforce the result.\n// The browser preview does not authorize an action.`;

  async function copy() {
    try {
      await navigator.clipboard.writeText(example);
      notify("Copied the sample contract snippet.", "info");
    } catch {
      notify("Clipboard access was unavailable. Select the snippet to copy it manually.", "error");
    }
  }

  return (
    <>
      <PageHeading title="Integrations" description="Read the initial typed contract and setup notes for the sample applications." action={<Status tone="neutral">No live connection</Status>}/>
      <div className="callout callout--warning"><strong>Server-side enforcement:</strong> Keep API credentials on a trusted server. A browser page cannot make a secure decision or enforce an action. This preview makes no network requests.</div>
      <div className="two-column section-gap">
        <section className="panel"><div className="panel-heading"><div><h2>Sample application setup</h2><p>Metadata from the local adapter</p></div><SampleLabel>Not a health check</SampleLabel></div>
          {data.applications.length ? <div className="stack">{data.applications.map((app) => <div className="switch-row" key={app.id}><div><strong>{app.name}</strong><p className="mono">{app.origins.join(", ")}</p></div><Status tone={app.status === "Ready" ? "success" : "warning"}>{app.status} · sample</Status></div>)}</div> : <p className="muted">Add an application to view sample setup details.</p>}
        </section>
        <section className="panel"><div className="panel-heading"><div><h2>Integration sequence</h2><p>Future trusted-server pattern</p></div><Status tone="signal">Illustrative</Status></div><ol className="evidence-list"><li>Identify the user, session, resource, and action on your server.</li><li>Request a typed evaluation from the future Sentriq server integration.</li><li>Proceed only after your server verifies an allowed result and required proof.</li><li>Record the result and review its event evidence.</li></ol></section>
      </div>
      <section className="panel section-gap"><div className="panel-heading"><div><h2>Typed result contract</h2><p>Illustrative TypeScript based on the Stage A SDK types. It sends no request.</p></div><button className="button" onClick={copy}><Icon name="copy" size={16}/> Copy snippet</button></div><div className="code-panel"><div className="code-panel__title">TypeScript · local sample</div><pre><code>{example}</code></pre></div></section>
      <div className="two-column section-gap"><section className="panel"><h2>Sample environment state</h2><p className="muted">No base URL, key, API secret, or live health probe is configured in this app.</p><Status tone="neutral">Disconnected · expected in this preview</Status></section><section className="panel"><h2>What is not included</h2><ul className="evidence-list"><li>Credential creation or secret display</li><li>Live API requests or backend authorization</li><li>Real session or policy enforcement</li></ul></section></div>
    </>
  );
}

export function SettingsPage() {
  const { t } = useTranslation("console");
  const router = useRouter();
  const { data, saveSettings, reset, notify } = useDemo();
  const [organizationName, setOrganizationName] = useState(data.settings.organizationName);
  const [notifyChanges, setNotifyChanges] = useState(data.settings.notifyPolicyChanges);
  const [requireConfirmation, setRequireConfirmation] = useState(data.settings.requireSampleConfirmation);
  const [pendingReset, setPendingReset] = useState(false);
  const [error, setError] = useState("");

  function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!organizationName.trim()) { setError(t("settings.organizationRequired")); return; }
    saveSettings({ organizationName: organizationName.trim(), notifyPolicyChanges: notifyChanges, requireSampleConfirmation: requireConfirmation });
    setError("");
    notify(t("settings.settingsSaved"));
  }

  function resetSample() {
    reset();
    setPendingReset(false);
    setOrganizationName("Sentriq sample workspace");
    setNotifyChanges(true);
    setRequireConfirmation(true);
  }

  return (
    <>
      <PageHeading title={t("settings.title")} description={t("settings.description")}/>
      <div className="two-column">
        <section className="panel"><div className="panel-heading"><div><h2>{t("settings.profileTitle")}</h2><p>{t("settings.profileDescription")}</p></div><SampleLabel>{t("settings.demoIdentity")}</SampleLabel></div><dl className="kv-list"><dt>{t("settings.name")}</dt><dd>{t("common.sentriqDeveloper")}</dd><dt>{t("settings.email")}</dt><dd>developer@sentriq.test</dd><dt>{t("settings.role")}</dt><dd>{t("settings.roleValue")}</dd><dt>{t("settings.authentication")}</dt><dd>{t("settings.authenticationValue")}</dd></dl></section>
        <section className="panel"><h2>{t("settings.workspaceTitle")}</h2><p className="muted">{t("settings.workspaceDescription")}</p><form className="stack" onSubmit={save} noValidate><div className="field"><label htmlFor="organization-name">{t("settings.organizationName")}</label><input className="input" id="organization-name" value={organizationName} maxLength={100} onChange={(event) => setOrganizationName(event.target.value)}/></div><div className="switch-row"><div><label htmlFor="notify-policy">{t("settings.policyNotices")}</label><p>{t("settings.policyNoticesHint")}</p></div><input id="notify-policy" type="checkbox" checked={notifyChanges} onChange={(event) => setNotifyChanges(event.target.checked)}/></div><div className="switch-row"><div><label htmlFor="sample-confirm">{t("settings.sampleConfirm")}</label><p>{t("settings.sampleConfirmHint")}</p></div><input id="sample-confirm" type="checkbox" checked={requireConfirmation} onChange={(event) => setRequireConfirmation(event.target.checked)}/></div>{error && <p className="field-error" role="alert">{error}</p>}<button className="button button--primary" type="submit">{t("settings.saveLocal")}</button></form></section>
      </div>
      <section className="panel section-gap"><AccessPreferencesPanel /></section>
      <section className="panel section-gap"><div className="panel-heading"><div><h2>{t("settings.browserDataTitle")}</h2><p>{t("settings.browserDataDescription")}</p></div><Status tone="signal">{t("settings.localOnly")}</Status></div><div className="button-row"><button className="button button--danger" onClick={() => setPendingReset(true)}>{t("settings.resetData")}</button><button className="button" onClick={() => router.push("/login")}>{t("settings.endPreview")}</button></div><p className="muted small" style={{ marginTop: 13 }}>{t("settings.resetHelp")}</p></section>
      <Modal open={pendingReset} onClose={() => setPendingReset(false)} title={t("settings.resetDialogTitle")} description={t("settings.resetDialogDescription")} footer={<><button className="button" onClick={() => setPendingReset(false)}>{t("settings.cancel")}</button><button className="button button--danger" onClick={resetSample}>{t("settings.resetLocalData")}</button></>}><p>{t("settings.resetDisclaimer")}</p></Modal>
    </>
  );
}
