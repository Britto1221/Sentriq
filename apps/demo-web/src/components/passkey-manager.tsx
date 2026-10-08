"use client";

import { useCallback, useEffect, useState, type FormEvent } from "react";
import { useAccessPreferences, useTranslation } from "@sentriq/access";
import type { PasskeySummary } from "@sentriq/shared";
import { Button, InlineStatus, Panel } from "@/components/primitives";
import { northstarAuth, northstarProtected } from "@/lib/auth-client";
import { StepUpPrompt } from "@/components/step-up-prompt";

const copy = {
  en: {
    title: "Your passkeys",
    description: "See the passkeys registered to this account. Names are labels you choose; Northstar does not identify a particular phone or computer.",
    loading: "Loading registered passkeys…",
    empty: "No passkeys are currently available for this account.",
    label: "Passkey name",
    save: "Save name",
    added: "Added",
    backup: "Authenticator reports this passkey is backed up",
    noBackup: "Authenticator does not report a backed-up copy",
    remove: "Remove passkey",
    last: "Keep at least one passkey. Connect another device before removing this one.",
    addDevice: "To add another passkey, open Northstar on that device and choose “Approve using my existing device.”",
    removed: "Passkey removed.",
    renamed: "Passkey name saved.",
    failed: "The passkey change could not be completed. Refresh and try again.",
  },
  ta: {
    title: "உங்கள் Passkey-கள்",
    description: "இந்தக் கணக்கில் பதிவு செய்யப்பட்ட Passkey-களைப் பாருங்கள். பெயர்கள் நீங்கள் தேர்ந்தெடுக்கும் அடையாளங்கள்; குறிப்பிட்ட கைபேசி அல்லது கணினியை Northstar அடையாளம் காணாது.",
    loading: "பதிவு செய்யப்பட்ட Passkey-கள் ஏற்றப்படுகின்றன…",
    empty: "இந்தக் கணக்கில் தற்போது Passkey இல்லை.",
    label: "Passkey பெயர்",
    save: "பெயரைச் சேமி",
    added: "சேர்க்கப்பட்ட நாள்",
    backup: "இந்த Passkey-க்கு காப்பு நகல் இருப்பதாக அங்கீகரிப்பான் தெரிவிக்கிறது",
    noBackup: "காப்பு நகல் இருப்பதாக அங்கீகரிப்பான் தெரிவிக்கவில்லை",
    remove: "Passkey-ஐ அகற்று",
    last: "குறைந்தது ஒரு Passkey-ஐ வைத்திருக்கவும். இதை அகற்றும் முன் மற்றொரு சாதனத்தை இணைக்கவும்.",
    addDevice: "மற்றொரு Passkey சேர்க்க, அந்தச் சாதனத்தில் Northstar-ஐத் திறந்து “ஏற்கனவே உள்ள சாதனத்தைப் பயன்படுத்தி ஒப்புதல்” என்பதைத் தேர்ந்தெடுக்கவும்.",
    removed: "Passkey அகற்றப்பட்டது.",
    renamed: "Passkey பெயர் சேமிக்கப்பட்டது.",
    failed: "Passkey மாற்றத்தை முடிக்க முடியவில்லை. மீண்டும் ஏற்றி முயற்சிக்கவும்.",
  },
} as const;

export function PasskeyManager() {
  const { t } = useTranslation("console");
  const { preferences } = useAccessPreferences();
  const text = copy[preferences.language === "ta" ? "ta" : "en"];
  const [credentials, setCredentials] = useState<PasskeySummary[]>([]);
  const [drafts, setDrafts] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [status, setStatus] = useState<{ kind: "success" | "error"; message: string } | null>(null);
  const [pending, setPending] = useState<{ credentialId: string; challengeId: string } | null>(null);

  const refresh = useCallback(async () => {
    try {
      const next = await northstarAuth.credentials();
      setCredentials(next);
      setDrafts(Object.fromEntries(next.map((credential) => [credential.id, credential.displayName])));
    } catch {
      setStatus({ kind: "error", message: text.failed });
    } finally {
      setLoading(false);
    }
  }, [text.failed]);

  useEffect(() => { void refresh(); }, [refresh]);

  async function rename(event: FormEvent<HTMLFormElement>, credential: PasskeySummary) {
    event.preventDefault();
    const displayName = (drafts[credential.id] ?? "").trim();
    if (!displayName || displayName.length > 60) return;
    setBusyId(credential.id);
    setStatus(null);
    try {
      const updated = await northstarAuth.renameCredential({ credentialId: credential.id, displayName });
      setCredentials((items) => items.map((item) => item.id === updated.id ? updated : item));
      setStatus({ kind: "success", message: text.renamed });
    } catch {
      setStatus({ kind: "error", message: text.failed });
    } finally {
      setBusyId(null);
    }
  }

  async function remove(credentialId: string) {
    setBusyId(credentialId);
    setStatus(null);
    try {
      const result = await northstarProtected.revokePasskey(credentialId);
      if (result.kind === "step-up") {
        setPending({ credentialId, challengeId: result.challengeId });
      } else {
        setPending(null);
        setCredentials((items) => items.filter((item) => item.id !== credentialId));
        setStatus({ kind: "success", message: text.removed });
      }
    } catch {
      setStatus({ kind: "error", message: text.failed });
    } finally {
      setBusyId(null);
    }
  }

  async function completeRemoval() {
    if (!pending) return;
    const credentialId = pending.credentialId;
    setBusyId(credentialId);
    try {
      const result = await northstarProtected.revokePasskey(credentialId);
      if (result.kind === "step-up") {
        setPending({ credentialId, challengeId: result.challengeId });
        return;
      }
      setPending(null);
      setCredentials((items) => items.filter((item) => item.id !== credentialId));
      setStatus({ kind: "success", message: text.removed });
    } catch {
      setPending(null);
      setStatus({ kind: "error", message: text.failed });
      await refresh();
    } finally {
      setBusyId(null);
    }
  }

  return <Panel className="passkey-manager">
    <p className="panel-kicker">Sentriq Auth</p>
    <h2>{text.title}</h2>
    <p className="body-copy">{text.description}</p>
    {status ? <InlineStatus kind={status.kind}>{status.message}</InlineStatus> : null}
    {loading ? <p role="status" aria-live="polite">{text.loading}</p> : credentials.length === 0
      ? <p className="empty-state" role="status">{text.empty}</p>
      : <ul className="passkey-list" aria-label={text.title}>
        {credentials.map((credential) => <li className="passkey-card" key={credential.id}>
          <form className="passkey-name-form" onSubmit={(event) => void rename(event, credential)}>
            <label htmlFor={`passkey-name-${credential.id}`}>{text.label}</label>
            <input id={`passkey-name-${credential.id}`} value={drafts[credential.id] ?? credential.displayName} maxLength={60} required
              onChange={(event) => setDrafts((current) => ({ ...current, [credential.id]: event.target.value }))} />
            <Button type="submit" variant="secondary" disabled={busyId !== null || (drafts[credential.id] ?? credential.displayName).trim() === credential.displayName}>{text.save}</Button>
          </form>
          <p className="passkey-metadata">{text.added} {new Intl.DateTimeFormat(preferences.language, { dateStyle: "medium" }).format(new Date(credential.createdAt))}</p>
          <p className="passkey-metadata" role="status">{credential.backedUp ? text.backup : text.noBackup}</p>
          <Button type="button" variant="danger" disabled={busyId !== null || credentials.length < 2} onClick={() => void remove(credential.id)}>
            {busyId === credential.id ? t("auth.live.working") : text.remove}
          </Button>
        </li>)}
      </ul>}
    {credentials.length === 1 ? <p className="field-help">{text.last}</p> : null}
    <p className="field-help">{text.addDevice}</p>
    {pending ? <StepUpPrompt challengeId={pending.challengeId} actionId="passkey.remove" onVerified={completeRemoval} /> : null}
  </Panel>;
}
