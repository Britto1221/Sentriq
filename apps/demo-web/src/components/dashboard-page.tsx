"use client";

import Link from "next/link";
import { useCallback } from "react";
import { useDemo } from "@/components/demo-provider";
import { SecurityEventList } from "@/components/security-event-list";
import { ErrorState, LoadingState, Panel, WorkspaceFrame } from "@/components/primitives";
import { useAsyncQuery } from "@/lib/use-async-query";
import { northstarAuth } from "@/lib/auth-client";

export function DashboardPage() {
  const { authenticatedUser, authenticationLoading } = useDemo();
  const load = useCallback(async () => Promise.all([northstarAuth.sessions(), northstarAuth.events()]), []);
  const query = useAsyncQuery(load, !authenticationLoading && Boolean(authenticatedUser));

  return <WorkspaceFrame title="Your workspace" description="Review the account and security activity returned by the Sentriq Security API.">
    {query.status === "loading" ? <Panel><LoadingState label="Loading your account" /></Panel> : null}
    {query.status === "error" ? <Panel><ErrorState message="Account details could not be loaded." onRetry={query.reload} /></Panel> : null}
    {query.data && authenticatedUser ? <div className="dashboard-layout">
      <div className="dashboard-primary">
        <section className="welcome-panel" aria-labelledby="welcome-title">
          <div><p className="page-kicker">Authenticated account</p><h2 id="welcome-title">Welcome, {authenticatedUser.displayName}.</h2>
            <p>Your identity and session were validated by the configured Sentriq API.</p></div>
          <span className="avatar avatar-large" aria-hidden="true">{authenticatedUser.displayName.slice(0, 1).toUpperCase()}</span>
        </section>
        <Panel className="activity-panel">
          <div className="panel-heading-row"><div><p className="panel-kicker">Persisted by Sentriq</p><h2>Recent security activity</h2></div><Link href="/security-activity">View all activity</Link></div>
          <SecurityEventList events={query.data[1]} limit={4} />
        </Panel>
      </div>
      <aside className="dashboard-secondary" aria-label="Account details and shortcuts">
        <Panel className="account-summary"><div className="panel-heading-row"><div><p className="panel-kicker">Account</p><h2>Account details</h2></div><Link href="/profile">View profile</Link></div>
          <dl className="summary-list"><div><dt>Name</dt><dd>{authenticatedUser.displayName}</dd></div><div><dt>Email</dt><dd>{authenticatedUser.email}</dd></div>
            <div><dt>Active sessions</dt><dd>{query.data[0].filter((session) => session.status === "active").length}</dd></div></dl>
        </Panel>
        <Panel className="shortcut-panel"><p className="panel-kicker">Account security</p><h2>Manage your account</h2>
          <nav className="shortcut-list" aria-label="Account shortcuts">
            <Link href="/settings/security"><span><strong>Passkeys and recovery</strong><small>Manage authenticators and one-use recovery codes</small></span><span aria-hidden="true">›</span></Link>
            <Link href="/settings/sessions"><span><strong>Sessions</strong><small>Review and revoke other sessions</small></span><span aria-hidden="true">›</span></Link>
            <Link href="/settings/export"><span><strong>Export account data</strong><small>Require a fresh passkey check before download</small></span><span aria-hidden="true">›</span></Link>
          </nav>
        </Panel>
      </aside>
    </div> : null}
  </WorkspaceFrame>;
}
