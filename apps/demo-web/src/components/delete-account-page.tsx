"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { ConfirmationDialog } from "@/components/confirmation-dialog";
import { StepUpPrompt } from "@/components/step-up-prompt";
import { useDemo } from "@/components/demo-provider";
import { Button, InlineStatus, Panel, WorkspaceFrame } from "@/components/primitives";
import { northstarProtected, NorthstarAuthError } from "@/lib/auth-client";
import { useTranslation } from "@sentriq/access";

export function DeleteAccountPage() {
  const router = useRouter();
  const { t } = useTranslation("console");
  const { refreshSession } = useDemo();
  const [challengeId, setChallengeId] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState<{ kind: "success" | "error"; text: string } | null>(null);

  async function requestDeletion(): Promise<void> {
    setBusy(true); setStatus(null);
    try {
      const result = await northstarProtected.deleteAccount();
      if (result.kind === "step-up") {
        setChallengeId(result.challengeId);
        return;
      }
      setChallengeId(null);
      await refreshSession();
      router.replace("/login");
    } catch (error) {
      setChallengeId(null);
      const text = error instanceof NorthstarAuthError && error.code === "RATE_LIMITED" ? t("auth.live.rateLimited")
        : error instanceof NorthstarAuthError && error.code === "NETWORK_UNAVAILABLE" ? t("auth.live.networkError")
          : error instanceof NorthstarAuthError && error.code === "POLICY_DENIED" ? t("auth.live.policyDenied")
            : t("auth.live.genericFailure");
      setStatus({ kind: "error", text });
      throw new Error(text);
    } finally { setBusy(false); }
  }

  async function confirmDeletion(): Promise<boolean> {
    await requestDeletion();
    return true;
  }

  return <WorkspaceFrame title={t("auth.live.deleteTitle")} description={t("auth.live.deleteDescription")}>
    <div className="danger-layout">
      <Panel className="danger-panel">
        <p className="panel-kicker">{t("common.security")}</p>
        <h2>{t("auth.live.deleteTitle")}</h2>
        <p className="body-copy">{t("auth.live.deletePrompt")}</p>
        <ul className="consequence-list">
          <li>{t("auth.live.deleteDescription")}</li>
          <li>{t("auth.live.stepUpIntro")}</li>
        </ul>
        {status ? <InlineStatus kind={status.kind}>{status.text}</InlineStatus> : null}
        <div className="danger-actions">
          <ConfirmationDialog
            trigger={(open) => <Button type="button" variant="danger" disabled={busy} onClick={open}>{t("auth.live.deleteTitle")}</Button>}
            title={t("auth.live.deleteTitle")}
            description={t("auth.live.deleteDescription")}
            content={<p className="body-copy">{t("auth.live.deletePrompt")}</p>}
            confirmLabel={busy ? t("auth.live.working") : t("auth.live.deleteConfirmLabel")}
            onConfirm={confirmDeletion}
          />
        </div>
      </Panel>
      <aside className="danger-aside">
        <Panel><p className="panel-kicker">{t("auth.live.stepUpTitle")}</p><h2>{t("auth.live.recoveryManagementTitle")}</h2>
          <p className="body-copy">{t("auth.live.recoveryManagementDescription")}</p></Panel>
      </aside>
    </div>
    {challengeId ? <StepUpPrompt challengeId={challengeId} actionId="account.delete" onVerified={requestDeletion} /> : null}
  </WorkspaceFrame>;
}
