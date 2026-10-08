"use client";

import Link from "next/link";
import { Panel, WorkspaceFrame } from "@/components/primitives";

const settingsItems = [
  { href: "/settings/security", title: "Passkeys and recovery", description: "Register a passkey and create one-use recovery codes." },
  { href: "/settings/sessions", title: "Sessions", description: "Review persisted sessions and revoke another session with fresh verification." },
  { href: "/settings/export", title: "Export account data", description: "Download your account details after a server-verified passkey check." },
  { href: "/settings/delete-account", title: "Delete account", description: "Delete this account after a server-verified passkey check." },
  { href: "/security-activity", title: "Security activity", description: "Review security events recorded by the Sentriq API." },
];

export function SettingsHomePage() {
  return <WorkspaceFrame title="Settings" description="Manage passkeys, recovery, sessions, and protected account operations.">
    <Panel className="settings-directory-panel"><p className="panel-kicker">Account management</p><h2>Choose a setting</h2>
      <nav className="settings-directory" aria-label="Account settings">
        {settingsItems.map((item) => <Link href={item.href} className="settings-directory-item" key={item.href}>
          <span><strong>{item.title}</strong><small>{item.description}</small></span><span className="directory-chevron" aria-hidden="true">›</span>
        </Link>)}
      </nav>
    </Panel>
  </WorkspaceFrame>;
}
