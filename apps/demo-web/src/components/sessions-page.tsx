"use client";

import { useCallback, useState } from "react";
import { useDemo } from "@/components/demo-provider";
import { StepUpPrompt } from "@/components/step-up-prompt";
import { Button, ErrorState, InlineStatus, LoadingState, Panel, WorkspaceFrame } from "@/components/primitives";
import { useAsyncQuery } from "@/lib/use-async-query";
import { northstarAuth, northstarProtected, NorthstarAuthError } from "@/lib/auth-client";
import type { SessionSummary } from "@sentriq/shared";

export function SessionsPage() {
  const { authenticationLoading } = useDemo();
  const load = useCallback(() => northstarAuth.sessions(), []);
  const query = useAsyncQuery(load, !authenticationLoading);
  const [challenge, setChallenge] = useState<{ id: string; sessionId: string } | null>(null);
  const [busySession, setBusySession] = useState<string | null>(null);
  const [status, setStatus] = useState<{ kind: "success" | "error"; text: string } | null>(null);

  async function revoke(sessionId: string): Promise<void> {
    setBusySession(sessionId); setStatus(null);
    try {
      const result = await northstarProtected.revokeSession(sessionId);
      if (result.kind === "step-up") { setChallenge({ id: result.challengeId, sessionId }); return; }
      setChallenge(null);
      setStatus({ kind: "success", text: "That session has been revoked. Its next request will be rejected." });
      query.reload();
    } catch (error) {
      setChallenge(null);
      const text = error instanceof NorthstarAuthError && error.code === "RATE_LIMITED" ? "Too many requests. Wait and try again."
        : error instanceof NorthstarAuthError && error.code === "POLICY_DENIED" ? "The security policy did not approve this change."
          : "The session could not be revoked. Try again.";
      setStatus({ kind: "error", text });
    } finally { setBusySession(null); }
  }

  const formatDate = (value: string) => new Intl.DateTimeFormat(undefined, { dateStyle: "medium", timeStyle: "short" }).format(new Date(value));

  return <WorkspaceFrame title="Sessions" description="Review sessions authenticated by the Sentriq Security API. Revocation is enforced on subsequent server requests.">
    {status ? <InlineStatus kind={status.kind}>{status.text}</InlineStatus> : null}
    {query.status === "loading" ? <Panel><LoadingState label="Loading authenticated sessions" /></Panel> : null}
    {query.status === "error" ? <Panel><ErrorState message="Sessions could not be loaded." onRetry={query.reload} /></Panel> : null}
    {query.status === "ready" && query.data ? query.data.length ? <ul className="session-list">
      {query.data.map((session: SessionSummary) => <li className="session-card" key={session.id}>
        <div className="session-card-main">
          <div className="session-heading"><span className="session-device-mark" aria-hidden="true" />
            <div><h2>{session.current ? "This session" : "Signed-in session"}</h2><p>{session.current ? "Current browser" : "Another authenticated session"}</p></div>
          </div>
          <span className={`status-pill status-pill-${session.status}`}>{session.status}</span>
        </div>
        <dl className="session-details">
          <div><dt>Started</dt><dd>{formatDate(session.createdAt)}</dd></div>
          <div><dt>Expires</dt><dd>{formatDate(session.expiresAt)}</dd></div>
          {session.revokedAt ? <div><dt>Revoked</dt><dd>{formatDate(session.revokedAt)}</dd></div> : null}
        </dl>
        {session.current ? <p className="session-current-note">This session cannot revoke itself. Use Sign out to end it.</p>
          : session.status === "active" ? <Button type="button" variant="secondary" disabled={busySession !== null} onClick={() => void revoke(session.id)}>
            {busySession === session.id ? "Checking security policy…" : "Revoke this session"}
          </Button> : <p className="session-current-note">This session is no longer active.</p>}
        {challenge?.sessionId === session.id ? <StepUpPrompt challengeId={challenge.id} actionId="session.revoke" onVerified={() => revoke(session.id)} /> : null}
      </li>)}
    </ul> : <Panel><p className="empty-state">There are no sessions to display.</p></Panel> : null}
  </WorkspaceFrame>;
}
