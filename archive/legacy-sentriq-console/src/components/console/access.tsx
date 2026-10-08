"use client";

import { useEffect, useMemo, useState } from "react";
import {
  isAccessConfigurationSnapshot,
  type AccessConfigurationMethod,
  type AccessConfigurationSnapshot,
  useTranslation,
} from "@sentriq/access";
import { PageHeading, SampleLabel, Status } from "@/components/ui";
import { createLocalAccessConfigurationAdapter } from "@/lib/access-configuration-adapter";

type PreviewState =
  | { kind: "loading" }
  | { kind: "error" }
  | { kind: "ready"; snapshot: AccessConfigurationSnapshot };

const methodContent: Record<AccessConfigurationMethod, { title: string; description: string }> = {
  password: { title: "access.passwordTitle", description: "access.passwordDescription" },
  passkey: { title: "access.passkeyTitle", description: "access.passkeyDescription" },
  "recovery-codes": { title: "access.recoveryTitle", description: "access.recoveryDescription" },
};

export function SentriqAccessPage() {
  const { t } = useTranslation("console");
  const adapter = useMemo(createLocalAccessConfigurationAdapter, []);
  const [refreshCount, setRefreshCount] = useState(0);
  const [state, setState] = useState<PreviewState>({ kind: "loading" });

  useEffect(() => {
    let active = true;
    setState({ kind: "loading" });
    void adapter.loadPreview().then((snapshot) => {
      if (!isAccessConfigurationSnapshot(snapshot)) throw new Error("Invalid local preview snapshot");
      if (active) setState({ kind: "ready", snapshot });
    }).catch(() => {
      if (active) setState({ kind: "error" });
    });
    return () => { active = false; };
  }, [adapter, refreshCount]);

  return (
    <>
      <PageHeading title={t("access.title")} description={t("access.description")} action={<SampleLabel>{t("access.sampleLabel")}</SampleLabel>} />
      <div className="callout callout--warning access-boundary" role="note">
        <strong>{t("access.boundaryTitle")}</strong> {t("access.boundaryDescription")}
      </div>

      <section className="panel section-gap">
        <div className="panel-heading">
          <div><h2>{t("access.previewTitle")}</h2><p>{t("access.previewDescription")}</p></div>
          <button className="button" type="button" onClick={() => setRefreshCount((count) => count + 1)}>{t("access.refreshPreview")}</button>
        </div>

        {state.kind === "loading" && <p className="access-loading" role="status" aria-live="polite">{t("access.loading")}</p>}
        {state.kind === "error" && <div className="empty-state" role="alert"><h3>{t("access.loadErrorTitle")}</h3><p>{t("access.loadErrorDescription")}</p></div>}
        {state.kind === "ready" && (
          <dl className="access-config-grid">
            <div><dt>{t("access.applicationLabel")}</dt><dd>{state.snapshot.applicationName}</dd></div>
            <div><dt>{t("access.environmentLabel")}</dt><dd>{t("access.environmentValue")}</dd></div>
            <div><dt>{t("access.stateLabel")}</dt><dd><Status tone="neutral">{t("access.stateValue")}</Status></dd></div>
            <div><dt>{t("access.sourceLabel")}</dt><dd>{t("access.sourceValue")}</dd></div>
          </dl>
        )}
      </section>

      <section className="access-contract section-gap" aria-labelledby="access-contract-title">
        <div className="panel-heading"><div><h2 id="access-contract-title">{t("access.capabilitiesTitle")}</h2><p>{t("access.capabilitiesDescription")}</p></div><Status tone="signal">{t("common.sampleOnly")}</Status></div>
        <div className="three-column">
          {state.kind === "ready" && state.snapshot.methods.map((method) => (
            <article className="panel access-method-card" key={method}>
              <Status tone="neutral">{t("common.sampleOnly")}</Status>
              <h3>{t(methodContent[method].title)}</h3>
              <p>{t(methodContent[method].description)}</p>
            </article>
          ))}
        </div>
      </section>

      <section className="panel access-adapter section-gap">
        <div className="panel-heading"><div><h2>{t("access.adapterTitle")}</h2><p>{t("access.adapterDescription")}</p></div><Status tone="warning">{t("common.localOnly")}</Status></div>
        <div className="access-adapter__detail"><span>{t("access.sourceLabel")}</span><code>AccessConfigurationAdapter.loadPreview()</code></div>
      </section>
    </>
  );
}
