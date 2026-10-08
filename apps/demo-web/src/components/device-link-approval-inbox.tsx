"use client";

import { useCallback, useEffect, useState } from "react";
import { startAuthentication } from "@sentriq/browser";
import { useTranslation } from "@sentriq/access";
import { Button, InlineStatus, Panel } from "@/components/primitives";
import { northstarAuth, type DeviceLinkRequest } from "@/lib/auth-client";

export function DeviceLinkApprovalInbox() {
  const { t } = useTranslation("console");
  const [requests, setRequests] = useState<DeviceLinkRequest[]>([]);
  const [checked, setChecked] = useState<Record<string, boolean>>({});
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [status, setStatus] = useState<{ kind: "success" | "error"; message: string } | null>(null);

  const refresh = useCallback(async () => {
    try {
      const next = await northstarAuth.deviceLinkInbox();
      setRequests(next);
      setChecked((current) => Object.fromEntries(next.map((request) => [request.requestId, current[request.requestId] ?? false])));
    } catch {
      setStatus({ kind: "error", message: t("auth.live.genericFailure") });
    } finally {
      setLoading(false);
    }
  }, [t]);

  useEffect(() => {
    void refresh();
    const timer = setInterval(() => void refresh(), 5_000);
    return () => clearInterval(timer);
  }, [refresh]);

  async function approve(requestId: string) {
    setBusyId(requestId);
    setStatus(null);
    try {
      const ceremony = await northstarAuth.deviceLinkApprovalOptions(requestId);
      const response = await startAuthentication({ optionsJSON: ceremony.options as Parameters<typeof startAuthentication>[0]["optionsJSON"] });
      await northstarAuth.deviceLinkApprove({ requestId, challengeId: ceremony.challengeId, response });
      setStatus({ kind: "success", message: t("auth.live.deviceApprovalComplete") });
      await refresh();
    } catch {
      setStatus({ kind: "error", message: t("auth.live.passkeyFailure") });
    } finally {
      setBusyId(null);
    }
  }

  async function reject(requestId: string) {
    setBusyId(requestId);
    setStatus(null);
    try {
      await northstarAuth.deviceLinkReject(requestId);
      setStatus({ kind: "success", message: t("auth.live.deviceLinkRejected") });
      await refresh();
    } catch {
      setStatus({ kind: "error", message: t("auth.live.genericFailure") });
    } finally {
      setBusyId(null);
    }
  }

  return (
    <Panel className="device-approval-panel">
      <p className="panel-kicker">Sentriq Device Link</p>
      <h2>{t("auth.live.deviceApprovalTitle")}</h2>
      <p className="body-copy">{t("auth.live.deviceApprovalDescription")}</p>
      {status ? <InlineStatus kind={status.kind} role={status.kind === "error" ? "alert" : "status"}>{status.message}</InlineStatus> : null}
      {loading ? <p role="status" aria-live="polite">{t("auth.live.working")}</p>
        : requests.length === 0 ? <p className="empty-state" role="status">{t("auth.live.deviceApprovalEmpty")}</p>
          : <ul className="device-approval-list">
            {requests.map((request) => <li className="device-approval-request" key={request.requestId}>
              <p className="device-link-code-label">{t("auth.live.deviceLinkComparisonLabel")}</p>
              <p className="device-link-code">{request.comparisonCode}</p>
              <p>{t("auth.live.deviceApprovalPrompt")}</p>
              <p className="field-help">{new Date(request.createdAt).toLocaleString()}</p>
              <label className="check-row" htmlFor={`device-link-confirm-${request.requestId}`}>
                <input id={`device-link-confirm-${request.requestId}`} type="checkbox" checked={checked[request.requestId] ?? false}
                  onChange={(event) => setChecked((current) => ({ ...current, [request.requestId]: event.target.checked }))} />
                <span>{t("auth.live.deviceApprovalConfirmation")}</span>
              </label>
              <div className="auth-voice-actions">
                <Button type="button" disabled={busyId !== null || !checked[request.requestId]} onClick={() => void approve(request.requestId)}>
                  {busyId === request.requestId ? t("auth.live.working") : t("auth.live.deviceApprovalApprove")}
                </Button>
                <Button type="button" variant="secondary" disabled={busyId !== null} onClick={() => void reject(request.requestId)}>{t("auth.live.deviceApprovalReject")}</Button>
              </div>
            </li>)}
          </ul>}
      <Button type="button" variant="secondary" disabled={busyId !== null} onClick={() => void refresh()}>{t("auth.live.deviceApprovalRefresh")}</Button>
    </Panel>
  );
}
