"use client";

import { useState } from "react";
import { useTranslation } from "@sentriq/access";
import { StepUpPrompt } from "@/components/step-up-prompt";
import { Button, InlineStatus, Panel, WorkspaceFrame } from "@/components/primitives";
import { northstarProtected, NorthstarAuthError } from "@/lib/auth-client";

export function ExportPage() {
  const { t } = useTranslation("console");
  const [format, setFormat] = useState<"json" | "csv">("json");
  const [challengeId, setChallengeId] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState<{ kind: "success" | "error"; text: string } | null>(null);

  async function requestExport() {
    setBusy(true); setStatus(null);
    try {
      const result = await northstarProtected.exportData(format);
      if (result.kind === "step-up") {
        setChallengeId(result.challengeId);
        return;
      }
      setChallengeId(null);
      const url = URL.createObjectURL(result.file);
      const anchor = document.createElement("a");
      anchor.href = url;
      anchor.download = `northstar-account-export.${format}`;
      document.body.append(anchor); anchor.click(); anchor.remove();
      window.setTimeout(() => URL.revokeObjectURL(url), 1000);
      setStatus({ kind: "success", text: t("auth.live.exportSuccess") });
    } catch (error) {
      setChallengeId(null);
      const message = error instanceof NorthstarAuthError && error.code === "RATE_LIMITED" ? t("auth.live.rateLimited")
        : error instanceof NorthstarAuthError && error.code === "NETWORK_UNAVAILABLE" ? t("auth.live.networkError")
          : error instanceof NorthstarAuthError && error.code === "POLICY_DENIED" ? t("auth.live.policyDenied")
            : t("auth.live.genericFailure");
      setStatus({ kind: "error", text: message });
    } finally { setBusy(false); }
  }

  return <WorkspaceFrame title={t("auth.live.exportTitle")} description={t("auth.live.exportDescription")}>
    <div className="settings-content-grid">
      <Panel className="form-panel">
        <p className="panel-kicker">{t("common.security")}</p>
        <h2>{t("auth.live.exportTitle")}</h2>
        <fieldset className="format-options">
          <legend>{t("auth.live.exportFormat")}</legend>
          <label className={`format-option${format === "json" ? " format-option-selected" : ""}`}>
            <input type="radio" name="format" value="json" checked={format === "json"} disabled={busy} onChange={() => setFormat("json")} />
            <span><strong>JSON</strong><small>{t("auth.live.jsonFormatHint")}</small></span>
          </label>
          <label className={`format-option${format === "csv" ? " format-option-selected" : ""}`}>
            <input type="radio" name="format" value="csv" checked={format === "csv"} disabled={busy} onChange={() => setFormat("csv")} />
            <span><strong>CSV</strong><small>{t("auth.live.csvFormatHint")}</small></span>
          </label>
        </fieldset>
        {status ? <InlineStatus kind={status.kind}>{status.text}</InlineStatus> : null}
        <Button type="button" disabled={busy} onClick={() => void requestExport()}>
          {busy ? t("auth.live.working") : t("auth.live.requestExport")}
        </Button>
        {challengeId ? <StepUpPrompt challengeId={challengeId} actionId="data.export" onVerified={requestExport} /> : null}
      </Panel>
      <aside className="settings-aside">
        <Panel><p className="panel-kicker">{t("auth.live.stepUpTitle")}</p><h2>{t("auth.live.stepUpTitle")}</h2><p className="body-copy">{t("auth.live.stepUpIntro")}</p></Panel>
      </aside>
    </div>
  </WorkspaceFrame>;
}
