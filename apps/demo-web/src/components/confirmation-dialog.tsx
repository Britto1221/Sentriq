"use client";

import { useEffect, useId, useRef, useState } from "react";
import type { FormEvent, ReactNode } from "react";
import { Button } from "@/components/primitives";

interface ConfirmationDialogProps {
  trigger: (open: () => void) => ReactNode;
  title: string;
  description: string;
  content?: ReactNode;
  confirmLabel: string;
  cancelLabel?: string;
  confirmDisabled?: boolean;
  onConfirm: () => Promise<boolean> | boolean;
}

export function ConfirmationDialog({ trigger, title, description, content, confirmLabel, cancelLabel = "Cancel", confirmDisabled = false, onConfirm }: ConfirmationDialogProps) {
  const id = useId();
  const titleId = `confirmation-title-${id}`;
  const descriptionId = `confirmation-description-${id}`;
  const dialogRef = useRef<HTMLDialogElement>(null);
  const returnFocusRef = useRef<HTMLElement | null>(null);
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;
    if (open && !dialog.open) dialog.showModal();
    if (!open && dialog.open) dialog.close();
  }, [open]);

  function openDialog() {
    setError(null);
    const active = document.activeElement;
    returnFocusRef.current = active instanceof HTMLElement ? active : null;
    setOpen(true);
  }

  function closeDialog() {
    setOpen(false);
    if (dialogRef.current?.open) dialogRef.current.close();
    window.requestAnimationFrame(() => returnFocusRef.current?.focus());
  }

  async function confirm(event?: FormEvent<HTMLFormElement>) {
    event?.preventDefault();
    if (busy || confirmDisabled) return;
    setBusy(true);
    setError(null);
    try {
      const completed = await onConfirm();
      if (completed) closeDialog();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "The sample action could not be completed. Try again.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      {trigger(openDialog)}
      <dialog
        className="confirmation-dialog"
        ref={dialogRef}
        aria-labelledby={titleId}
        aria-describedby={descriptionId}
        onCancel={(event) => { event.preventDefault(); closeDialog(); }}
        onClose={() => { setOpen(false); window.requestAnimationFrame(() => returnFocusRef.current?.focus()); }}
        onClick={(event) => { if (event.target === dialogRef.current) closeDialog(); }}
      >
        <form className="confirmation-form" onSubmit={(event) => { void confirm(event); }}>
          <div className="dialog-heading">
            <p className="panel-kicker">Confirm sample flow</p>
            <h2 id={titleId}>{title}</h2>
            <p id={descriptionId}>{description}</p>
          </div>
          {content ? <div className="dialog-content">{content}</div> : null}
          {error ? <p className="field-error" role="alert">{error}</p> : null}
          <div className="dialog-actions">
            <Button type="button" variant="secondary" onClick={closeDialog} disabled={busy}>{cancelLabel}</Button>
            <Button type="submit" variant="danger" disabled={busy || confirmDisabled}>{busy ? "Working…" : confirmLabel}</Button>
          </div>
        </form>
      </dialog>
    </>
  );
}
