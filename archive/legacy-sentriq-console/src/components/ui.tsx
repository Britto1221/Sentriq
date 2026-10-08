"use client";

import { useEffect, useId, useRef, type ReactNode } from "react";
import Link from "next/link";
import { useTranslation } from "@sentriq/access";
import { useDemo } from "@/lib/demo-context";

export type IconName = "mark" | "grid" | "apps" | "key" | "shield" | "sliders" | "users" | "events" | "search" | "link" | "settings" | "menu" | "arrow" | "close" | "copy" | "spark" | "check" | "info";

const iconPaths: Record<Exclude<IconName, "mark">, ReactNode> = {
  grid: <><rect x="3" y="3" width="7" height="7" rx="1"/><rect x="14" y="3" width="7" height="7" rx="1"/><rect x="3" y="14" width="7" height="7" rx="1"/><rect x="14" y="14" width="7" height="7" rx="1"/></>,
  apps: <><rect x="4" y="4" width="16" height="16" rx="2"/><path d="M8 8h8M8 12h8M8 16h5"/></>,
  key: <><circle cx="8" cy="15" r="4"/><path d="m11 12 8-8 2 2-2 2 2 2-3 3-2-2-3 3"/></>,
  shield: <><path d="M12 3 20 6v5c0 5-3.5 8-8 10-4.5-2-8-5-8-10V6l8-3Z"/><path d="m9 12 2 2 4-4"/></>,
  sliders: <><path d="M4 6h16M4 12h16M4 18h16"/><circle cx="9" cy="6" r="2"/><circle cx="15" cy="12" r="2"/><circle cx="8" cy="18" r="2"/></>,
  users: <><circle cx="9" cy="8" r="3"/><path d="M3.5 20c.3-3.3 2.1-5 5.5-5s5.2 1.7 5.5 5M16 5.5a3 3 0 0 1 0 5.8M17 15c2.1.3 3.3 1.8 3.5 4"/></>,
  events: <><path d="M5 4v16M5 6h13l-2 4 2 4H5"/><circle cx="5" cy="20" r="1"/></>,
  search: <><circle cx="10.5" cy="10.5" r="6.5"/><path d="m16 16 4.5 4.5"/></>,
  link: <><path d="M10 13a5 5 0 0 0 7.1 0l2-2a5 5 0 0 0-7.1-7.1l-1.2 1.2"/><path d="M14 11a5 5 0 0 0-7.1 0l-2 2A5 5 0 0 0 12 20l1.2-1.2"/></>,
  settings: <><circle cx="12" cy="12" r="3"/><path d="m19.4 15 .1.1 1.1 1.9-2 3.5-2.2-.5a8 8 0 0 1-1.8 1l-.4 2.2h-4l-.4-2.2a8 8 0 0 1-1.8-1l-2.2.5-2-3.5 1.1-1.9a8 8 0 0 1 0-2.1L3.8 11l2-3.5L8 8a8 8 0 0 1 1.8-1l.4-2.2h4l.4 2.2a8 8 0 0 1 1.8 1l2.2-.5 2 3.5-1.1 1.9a8 8 0 0 1-.1 2.1Z" transform="translate(-1 -1) scale(.95)"/></>,
  menu: <><path d="M4 6h16M4 12h16M4 18h16"/></>,
  arrow: <><path d="M5 12h14M13 6l6 6-6 6"/></>,
  close: <><path d="m6 6 12 12M18 6 6 18"/></>,
  copy: <><rect x="8" y="8" width="12" height="12" rx="2"/><path d="M16 8V5a2 2 0 0 0-2-2H5a2 2 0 0 0-2 2v9a2 2 0 0 0 2 2h3"/></>,
  spark: <><path d="m12 3 1.8 5.2L19 10l-5.2 1.8L12 17l-1.8-5.2L5 10l5.2-1.8L12 3Z"/><path d="m19 16 .8 2.2L22 19l-2.2.8L19 22l-.8-2.2L16 19l2.2-.8L19 16Z"/></>,
  check: <><path d="m5 12 4 4L19 6"/></>,
  info: <><circle cx="12" cy="12" r="9"/><path d="M12 11v5M12 8h.01"/></>,
};

export function Icon({ name, size = 18, className }: { name: IconName; size?: number; className?: string }) {
  if (name === "mark") {
    return <svg aria-hidden="true" className={className} width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M12 2.8 20 6v5.3c0 4.9-3.2 8-8 9.9-4.8-1.9-8-5-8-9.9V6l8-3.2Z"/><path d="m8.5 12.2 2.2 2.2 4.8-5"/></svg>;
  }
  return <svg aria-hidden="true" className={className} width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.65" strokeLinecap="round" strokeLinejoin="round">{iconPaths[name]}</svg>;
}

export function Brand({ href = "/" }: { href?: string }) {
  return <Link className="brand" href={href}><span className="brand-mark"><Icon name="mark" size={21}/></span><span>sentriq</span></Link>;
}

export function SampleLabel({ children = "Development sample" }: { children?: ReactNode }) {
  return <span className="sample-label">{children}</span>;
}

export function DemoNotice({ compact = false }: { compact?: boolean }) {
  const { t } = useTranslation("console");
  return (
    <div className={`demo-banner${compact ? " demo-banner--compact" : ""}`} role="note">
      <Icon className="demo-banner__icon" name="info" size={18}/>
      <p><strong>{t("common.previewBoundaryTitle")}</strong> {t("common.previewBoundaryText")}</p>
    </div>
  );
}

export function PageHeading({
  title,
  description,
  action,
  eyebrow,
}: {
  title: string;
  description?: string;
  action?: ReactNode;
  eyebrow?: string;
}) {
  return (
    <div className="page-heading">
      <div>
        {eyebrow && <p className="eyebrow">{eyebrow}</p>}
        <h1>{title}</h1>
        {description && <p>{description}</p>}
      </div>
      {action && <div className="page-heading__actions">{action}</div>}
    </div>
  );
}

export function Status({ tone = "neutral", children }: { tone?: "success" | "warning" | "danger" | "signal" | "neutral"; children: ReactNode }) {
  return <span className={`status status--${tone}`}>{children}</span>;
}

export function Toast() {
  const { t } = useTranslation("console");
  const { notice, dismissNotice } = useDemo();
  if (!notice) return null;
  return (
    <div className={`toast toast--${notice.kind}`} role={notice.kind === "error" ? "alert" : "status"} aria-live={notice.kind === "error" ? "assertive" : "polite"}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12 }}>
        <span>{notice.text}</span>
        <button className="icon-button" aria-label={t("common.dismissMessage")} onClick={dismissNotice}><Icon name="close" size={16}/></button>
      </div>
    </div>
  );
}

export function Modal({
  open,
  onClose,
  title,
  description,
  children,
  footer,
}: {
  open: boolean;
  onClose(): void;
  title: string;
  description?: string;
  children: ReactNode;
  footer?: ReactNode;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  const titleId = `modal-title-${useId().replaceAll(":", "")}`;
  const descriptionId = `${titleId}-description`;

  useEffect(() => {
    const dialog = ref.current;
    if (!dialog) return;
    if (open && !dialog.open) dialog.showModal();
    if (!open && dialog.open) dialog.close();
  }, [open]);

  return (
    <dialog
      className="modal"
      ref={ref}
      aria-labelledby={titleId}
      aria-describedby={description ? descriptionId : undefined}
      onCancel={(event) => { event.preventDefault(); onClose(); }}
      onClick={(event) => { if (event.target === ref.current) onClose(); }}
    >
      <div className="modal__inner">
        <div className="modal__heading">
          <div>
            <h2 id={titleId}>{title}</h2>
            {description && <p id={descriptionId}>{description}</p>}
          </div>
          <button type="button" className="icon-button" aria-label="Cancel" onClick={onClose}><Icon name="close" size={17}/></button>
        </div>
        {children}
        {footer && <div className="modal__footer">{footer}</div>}
      </div>
    </dialog>
  );
}

export function EmptyState({ title, description, action }: { title: string; description: string; action?: ReactNode }) {
  return <div className="empty-state"><h3>{title}</h3><p>{description}</p>{action}</div>;
}

export function formatDate(value?: string | null): string {
  if (!value) return "Never";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "Unknown sample time";
  return new Intl.DateTimeFormat("en", { dateStyle: "medium", timeStyle: "short" }).format(date);
}

export function formatTime(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "--:--";
  return new Intl.DateTimeFormat("en", { hour: "2-digit", minute: "2-digit" }).format(date);
}
