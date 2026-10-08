"use client";

import { ConsoleShell } from "@/components/console-shell";
import { EventsPage, InvestigatePage, SessionsPage } from "@/components/console/activity";
import { ApplicationDetailPage, ApplicationsPage } from "@/components/console/applications";
import { ApiKeysPage, IntegrationsPage, SettingsPage } from "@/components/console/misc";
import { SentriqAccessPage } from "@/components/console/access";
import { OverviewPage } from "@/components/console/overview";
import { PoliciesPage, ProtectedActionsPage } from "@/components/console/governance";
import { useDemo } from "@/lib/demo-context";
import { EmptyState } from "@/components/ui";

export function ConsoleRoute({ segments }: { segments: string[] }) {
  const { ready } = useDemo();
  const [section, detail] = segments;
  let content;

  if (!section || section === "overview") content = <OverviewPage/>;
  else if (section === "applications" && detail) content = <ApplicationDetailPage applicationId={detail}/>;
  else if (section === "applications") content = <ApplicationsPage/>;
  else if (section === "api-keys") content = <ApiKeysPage/>;
  else if (section === "protected-actions") content = <ProtectedActionsPage/>;
  else if (section === "policies") content = <PoliciesPage/>;
  else if (section === "sessions") content = <SessionsPage/>;
  else if (section === "events") content = <EventsPage/>;
  else if (section === "investigate") content = <InvestigatePage/>;
  else if (section === "integrations") content = <IntegrationsPage/>;
  else if (section === "settings") content = <SettingsPage/>;
  else if (section === "access") content = <SentriqAccessPage/>;
  else content = <EmptyState title="Page not found" description="This route is not part of the Sentriq sample console."/>;

  return <ConsoleShell>{ready ? content : <div className="panel" role="status" aria-live="polite">Loading development sample data…</div>}</ConsoleShell>;
}
