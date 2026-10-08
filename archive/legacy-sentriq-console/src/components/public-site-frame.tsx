"use client";

import type { ReactNode } from "react";
import Link from "next/link";
import { useTranslation } from "@sentriq/access";
import { Brand, Icon } from "@/components/ui";

export function PublicSiteFrame({ children, activePath = "" }: { children: ReactNode; activePath?: string }) {
  const { t } = useTranslation("console");
  const publicLinks = [
    { href: "/features", label: t("common.features") },
    { href: "/developers", label: t("common.developers") },
    { href: "/security", label: t("common.security") },
    { href: "/pricing", label: t("common.pricing") },
  ];
  return (
    <div className="public-site">
      <a className="skip-link" href="#main">{t("common.skipToContent")}</a>
      <header className="public-header">
        <Brand/>
        <nav className="public-nav" aria-label={t("common.mainNavigation")}>
          {publicLinks.map((item) => <Link key={item.href} href={item.href} aria-current={activePath === item.href ? "page" : undefined}>{item.label}</Link>)}
        </nav>
        <div className="public-nav__actions">
          <Link className="button button--quiet" href="/login">{t("common.signIn")}</Link>
          <Link className="button button--quiet" href="/signup">{t("common.signUp")}</Link>
          <Link className="button button--primary" href="/console/overview">{t("common.openDemo")}</Link>
        </div>
        <details className="mobile-menu">
          <summary aria-label={t("common.mainNavigation")}><Icon name="menu" size={19}/></summary>
          <div className="mobile-menu__panel">
            {publicLinks.map((item) => <Link key={item.href} href={item.href} aria-current={activePath === item.href ? "page" : undefined}>{item.label}</Link>)}
            <Link href="/login">{t("common.signIn")}</Link>
            <Link href="/signup">{t("common.signUp")}</Link>
            <Link href="/console/overview">{t("common.openDevelopmentDemo")}</Link>
          </div>
        </details>
      </header>
      <main id="main" className="public-main" tabIndex={-1}>{children}</main>
      <footer className="public-footer">
        <div><Brand/><p style={{ margin: "7px 0 0" }}>{t("common.tagline")}</p></div>
        <nav className="footer-links" aria-label={t("common.footerNavigation")}>
          <Link href="/developers">{t("common.developerDocs")}</Link>
          <Link href="/security">{t("common.security")}</Link>
          <Link href="/pricing">{t("common.pricingPreview")}</Link>
          <Link href="/signup">{t("common.signupPreview")}</Link>
          <Link href="/console/overview">{t("common.developmentConsole")}</Link>
        </nav>
      </footer>
    </div>
  );
}
