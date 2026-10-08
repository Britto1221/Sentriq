"use client";

import { useCallback } from "react";
import { SecurityEventList } from "@/components/security-event-list";
import { ErrorState, LoadingState, Panel, WorkspaceFrame } from "@/components/primitives";
import { useDemo } from "@/components/demo-provider";
import { useAsyncQuery } from "@/lib/use-async-query";
import { northstarAuth } from "@/lib/auth-client";

export function SecurityActivityPage() {
  const { authenticatedUser, authenticationLoading } = useDemo();
  const load = useCallback(() => northstarAuth.events(), []);
  const query = useAsyncQuery(load, !authenticationLoading && Boolean(authenticatedUser));
  return <WorkspaceFrame title="Security activity" description="Review security events recorded for this authenticated account.">
    {query.status === "loading" ? <Panel><LoadingState label="Loading recorded security activity" /></Panel> : null}
    {query.status === "error" ? <Panel><ErrorState message="Security activity could not be loaded." onRetry={query.reload} /></Panel> : null}
    {query.data ? <Panel className="activity-panel"><p className="panel-kicker">Sentriq audit events</p><h2>Account activity</h2>
      <SecurityEventList events={query.data} full />
    </Panel> : null}
  </WorkspaceFrame>;
}
