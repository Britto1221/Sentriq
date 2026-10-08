"use client";

import Link from "next/link";
import { useState, type FormEvent } from "react";
import { useAccessPreferences, useTranslation } from "@sentriq/access";
import { guideRecovery, type RecoveryGuideReply } from "@/lib/recovery-guide";

const replyCatalogKey = {
  lostDevice: "recoveryGuideLostDevice",
  anotherPasskey: "recoveryGuideAnotherPasskey",
  hasRecoveryCode: "recoveryGuideHasCode",
  recoveryUnavailable: "recoveryGuideUnavailable",
  authenticator: "recoveryGuideAuthenticator",
  secretSafety: "recoveryGuideSecretSafety",
  general: "recoveryGuideGeneral",
} as const;

export function RecoveryAssistant() {
  const { t } = useTranslation("console");
  const { preferences } = useAccessPreferences();
  const [question, setQuestion] = useState("");
  const [replies, setReplies] = useState<RecoveryGuideReply[]>([]);

  function ask(value: string) {
    const prompt = value.trim();
    if (!prompt) return;
    const reply = guideRecovery(prompt, preferences.language);
    // Only a fixed, localized response key is retained. User text is never rendered,
    // sent to a server, persisted, or included in telemetry.
    setReplies((current) => [...current, reply]);
    setQuestion("");
  }

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    ask(question);
  }

  return (
    <section className="recovery-guide" aria-labelledby="recovery-guide-title">
      <p className="page-kicker">Sentriq Access</p>
      <h2 id="recovery-guide-title">{t("auth.live.recoveryGuideLabel")}</h2>
      <p className="recovery-guide-disclosure">{t("auth.live.recoveryGuideDisclosure")}</p>
      <form className="recovery-guide-form" onSubmit={submit}>
        <label htmlFor="recovery-guide-question">{t("auth.live.recoveryGuideInputLabel")}</label>
        <textarea id="recovery-guide-question" rows={3} maxLength={500} autoComplete="off" value={question}
          placeholder={t("auth.live.recoveryGuideInputPlaceholder")} onChange={(event) => setQuestion(event.target.value)} />
        <button className="button button-secondary" type="submit" disabled={!question.trim()}>{t("auth.live.recoveryGuideSend")}</button>
      </form>
      {replies.length ? <div className="recovery-guide-replies" role="log" aria-live="polite" aria-relevant="additions" aria-label={t("auth.live.recoveryGuideResponseLabel")}>
        {replies.map((reply, index) => <article className="recovery-guide-reply" key={`${index}-${reply.messageKey}`}>
          <p>{t(`auth.live.${replyCatalogKey[reply.messageKey]}`)}</p>
          {reply.destination ? <Link className="button button-small button-text" href={reply.destination}>
            {t(reply.destination === "/login" ? "auth.live.recoveryGuideDestinationLogin" : "auth.live.recoveryGuideDestinationRecovery")}
          </Link> : null}
        </article>)}
      </div> : null}
    </section>
  );
}
