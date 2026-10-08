"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useRef, useState, type ReactNode } from "react";
import { useTranslation } from "@sentriq/access";
import { useAccessPreferences, useSentriqTheme } from "@sentriq/access";
import { useDemo } from "@/lib/demo-context";
import { Brand, DemoNotice, Icon, Modal, SampleLabel, Toast } from "@/components/ui";

const groups = [
  {
    labelKey: "common.workspace",
    links: [
      { href: "/console/overview", labelKey: "common.overview", icon: "grid" as const },
      { href: "/console/applications", labelKey: "common.applications", icon: "apps" as const },
      { href: "/console/api-keys", labelKey: "common.apiKeys", icon: "key" as const },
      { href: "/console/protected-actions", labelKey: "common.protectedActions", icon: "shield" as const },
      { href: "/console/policies", labelKey: "common.policies", icon: "sliders" as const },
    ],
  },
  {
    labelKey: "common.evidence",
    links: [
      { href: "/console/sessions", labelKey: "common.sessions", icon: "users" as const },
      { href: "/console/events", labelKey: "common.events", icon: "events" as const },
      { href: "/console/investigate", labelKey: "common.investigate", icon: "search" as const },
    ],
  },
  {
    labelKey: "common.setup",
    links: [
      { href: "/console/integrations", labelKey: "common.integrations", icon: "link" as const },
      { href: "/console/access", labelKey: "common.sentriqAccess", icon: "shield" as const },
      { href: "/console/settings", labelKey: "common.settings", icon: "settings" as const },
    ],
  },
];

function Navigation({ pathname, closeMenu }: { pathname: string; closeMenu?: () => void }) {
  const { t } = useTranslation("console");
  return (
    <nav className="console-nav" aria-label={t("common.consoleNavigation")}>
      {groups.map((group) => (
        <div key={group.labelKey}>
          <p className="nav-label">{t(group.labelKey)}</p>
          {group.links.map((item) => {
            const active = pathname === item.href || (item.href === "/console/applications" && pathname.startsWith("/console/applications/"));
            return <Link key={item.href} href={item.href} aria-current={active ? "page" : undefined} onClick={closeMenu}><Icon name={item.icon} size={17}/><span>{t(item.labelKey)}</span></Link>;
          })}
        </div>
      ))}
    </nav>
  );
}

export function ConsoleShell({ children }: { children: ReactNode }) {
  const { t } = useTranslation("console");
  const { preferences } = useAccessPreferences();
  const theme = useSentriqTheme();
  const pathname = usePathname();
  const router = useRouter();
  const [confirmSignOut, setConfirmSignOut] = useState(false);
  const mobileNavigation = useRef<HTMLDetailsElement>(null);

  useEffect(() => {
    document.getElementById("main")?.focus({ preventScroll: true });
    if (mobileNavigation.current) mobileNavigation.current.open = false;
  }, [pathname]);

  function signOutPreview() {
    setConfirmSignOut(false);
    router.push("/login");
  }

  return (
    <div className="console-app" data-access-theme={theme.id} data-access-high-contrast={String(preferences.highContrast)} data-access-larger-text={String(preferences.largerText)} data-access-reduced-motion={String(preferences.reducedMotion)}>
      <a className="skip-link" href="#main">{t("common.skipToContent")}</a>
      <aside className="console-sidebar" aria-label={t("common.consoleNavigation")}>
        <Brand href="/console/overview"/>
        <div className="sidebar-context">
          <strong>{t("common.developerWorkspace")}</strong>
          <span>{t("common.sampleOrganization")}</span>
          <SampleLabel>{t("common.developmentDemo")}</SampleLabel>
        </div>
        <Navigation pathname={pathname}/>
        <div className="console-sidebar__bottom">
          <p>{t("common.developmentPreview")} · {t("common.localBrowserState")}</p>
          <span>{t("common.noLiveApi")}</span>
        </div>
      </aside>
      <div className="console-main">
        <header className="mobile-console-bar">
          <Brand href="/console/overview"/>
          <details ref={mobileNavigation}>
            <summary aria-label={t("common.consoleNavigation")}><Icon name="menu" size={18}/> {t("common.consoleNavigation")}</summary>
            <Navigation pathname={pathname} closeMenu={() => { if (mobileNavigation.current) mobileNavigation.current.open = false; }}/>
          </details>
        </header>
        <header className="console-topbar">
          <span className="console-topbar__name">{t("common.developmentConsole")} / <span className="muted">{t("common.sampleOrganization")}</span></span>
          <div className="console-topbar__user">
            <SampleLabel>{t("common.developmentDemo")}</SampleLabel>
            <details className="top-user-menu">
              <summary><Icon name="users" size={17}/><span className="topbar-user">Developer</span></summary>
              <div className="top-user-menu__panel">
                <strong>{t("common.sentriqDeveloper")}</strong>
                <p>developer@sentriq.test</p>
                <button className="button button--quiet" onClick={() => setConfirmSignOut(true)}>{t("common.endPreview")}</button>
              </div>
            </details>
          </div>
        </header>
        <main id="main" className="console-content" tabIndex={-1}>
          <DemoNotice/>
          {children}
        </main>
      </div>
      <Modal
        open={confirmSignOut}
        onClose={() => setConfirmSignOut(false)}
        title={t("common.endPreviewTitle")}
        description={t("common.endPreviewDescription")}
        footer={<><button className="button" onClick={() => setConfirmSignOut(false)}>{t("common.stayHere")}</button><button className="button button--primary" onClick={signOutPreview}>{t("common.continueToSignIn")}</button></>}
      >
        <p className="muted">{t("common.sampleRecordsRemain")}</p>
      </Modal>
      <Toast/>
    </div>
  );
}
