"use client";

import { useTranslation } from "@sentriq/access";
import { DeviceLinkApprovalInbox } from "@/components/device-link-approval-inbox";
import { AccessPreferencesPanel } from "@sentriq/access";
import { Panel, WorkspaceFrame } from "@/components/primitives";
import { PasskeyManager } from "@/components/passkey-manager";

export function SecuritySettingsPage() {
  const { t } = useTranslation("console");

  return <WorkspaceFrame title={t("common.security")} description={t("settings.preferenceDescription")}>
    <div className="security-settings-stack">
      <Panel>
        <AccessPreferencesPanel />
      </Panel>

      <PasskeyManager />

      <DeviceLinkApprovalInbox />

      <Panel>
        <p className="panel-kicker">Sentriq Reclaim</p>
        <h2>{t("auth.live.recoveryManagementTitle")}</h2>
        <p className="body-copy">{t("auth.live.recoveryManagementDescription")}</p>
        <p className="field-help">{t("auth.live.recoveryCodesNotice")}</p>
      </Panel>
    </div>
  </WorkspaceFrame>;
}
