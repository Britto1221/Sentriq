"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import type { ButtonHTMLAttributes, ReactNode } from "react";

export function PageIntro({ title, description, action }: { title: string; description: string; action?: ReactNode }) {
  return (
    <header className="page-intro">
      <div>
        <p className="page-kicker">Development sample</p>
        <h1 tabIndex={-1}>{title}</h1>
        <p className="page-description">{description}</p>
      </div>
      {action ? <div className="page-intro-action">{action}</div> : null}
    </header>
  );
}

export function Panel({ children, className = "" }: { children: ReactNode; className?: string }) {
  return <section className={`panel ${className}`.trim()}>{children}</section>;
}

export function LoadingState({ label = "Loading sample data" }: { label?: string }) {
  return <div className="state-box" role="status" aria-live="polite" aria-busy="true"><span className="loading-mark" aria-hidden="true" />{label}…</div>;
}

export function ErrorState({ message, onRetry }: { message: string; onRetry: () => void }) {
  return (
    <div className="state-box state-error" role="alert">
      <p>{message}</p>
      <button className="button button-small button-secondary" type="button" onClick={onRetry}>Try again</button>
    </div>
  );
}

export function InlineStatus({ kind, children, role }: { kind: "success" | "error" | "info"; children: ReactNode; role?: "alert" | "status" }) {
  const resolvedRole = role ?? (kind === "error" ? "alert" : "status");
  return <p className={`inline-status inline-status-${kind}`} role={resolvedRole} aria-live={resolvedRole === "alert" ? "assertive" : "polite"} aria-atomic="true">{children}</p>;
}

export function WorkspaceFrame({ children, title, description, action }: { children: ReactNode; title: string; description: string; action?: ReactNode }) {
  const pathname = usePathname();
  const workspaceLinks = [
    { href: "/dashboard", label: "Overview" },
    { href: "/profile", label: "Profile" },
  ];
  const settingsLinks = [
    { href: "/settings", label: "Settings" },
    { href: "/settings/security", label: "Security" },
    { href: "/settings/sessions", label: "Sessions" },
    { href: "/settings/export", label: "Data export" },
    { href: "/settings/delete-account", label: "Delete account" },
    { href: "/security-activity", label: "Security activity" },
  ];

  const renderLinks = (items: typeof workspaceLinks) => items.map((item) => (
    <Link key={item.href} href={item.href} className="side-nav-link" aria-current={pathname === item.href ? "page" : undefined}>
      <span className="side-nav-indicator" aria-hidden="true" />
      {item.label}
    </Link>
  ));

  return (
    <div className="workspace-frame page-container">
      <aside className="workspace-sidebar" aria-label="Workspace navigation">
        <div className="sidebar-section">
          <p className="sidebar-heading">Workspace</p>
          <nav aria-label="Workspace pages">{renderLinks(workspaceLinks)}</nav>
        </div>
        <div className="sidebar-section">
          <p className="sidebar-heading">Account settings</p>
          <nav aria-label="Account settings">{renderLinks(settingsLinks)}</nav>
        </div>
        <div className="sidebar-note">
          <span className="small-status-dot" aria-hidden="true" />
          <p>Sentriq authentication<br /><strong>Workspace data is synthetic</strong></p>
        </div>
      </aside>
      <main id="main-content" className="workspace-main">
        <PageIntro title={title} description={description} action={action} />
        {children}
      </main>
    </div>
  );
}

export function LinkButton({ href, children, variant = "primary", className = "" }: { href: string; children: ReactNode; variant?: "primary" | "secondary" | "text" | "danger"; className?: string }) {
  return <Link className={`button button-${variant} ${className}`.trim()} href={href}>{children}</Link>;
}

export function Button({ children, variant = "primary", className = "", ...props }: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: "primary" | "secondary" | "text" | "danger" }) {
  return <button className={`button button-${variant} ${className}`.trim()} {...props}>{children}</button>;
}
