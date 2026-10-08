"use client";

import Link from "next/link";
import { useDemo } from "@/components/demo-provider";
import { LoadingState, Panel, WorkspaceFrame } from "@/components/primitives";

export function ProfilePage() {
  const { authenticatedUser, authenticationLoading } = useDemo();
  return <WorkspaceFrame title="Profile" description="Identity details from the current authenticated Sentriq session.">
    {authenticationLoading ? <Panel><LoadingState label="Loading account details" /></Panel> : null}
    {!authenticationLoading && authenticatedUser ? <div className="profile-layout">
      <Panel className="profile-card">
        <p className="panel-kicker">Authenticated identity</p><h2>{authenticatedUser.displayName}</h2>
        <dl className="summary-list"><div><dt>Email address</dt><dd>{authenticatedUser.email}</dd></div><div><dt>Account role</dt><dd>{authenticatedUser.role}</dd></div><div><dt>Application</dt><dd>Northstar Workspace</dd></div></dl>
      </Panel>
      <aside className="profile-aside"><Panel><p className="panel-kicker">Security</p><h2>Manage sign-in access</h2><p className="body-copy">Add a passkey and create backup recovery codes from your security settings.</p><Link className="button button-secondary" href="/settings/security">Open security settings</Link></Panel></aside>
    </div> : null}
  </WorkspaceFrame>;
}
