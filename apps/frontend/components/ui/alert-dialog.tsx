'use client';

import { useEffect, useId, useRef, type ReactNode } from 'react';

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  children: ReactNode;
  confirmLabel?: string;
  cancelLabel?: string;
};

/**
 * Destructive-action confirmation. Escape and cancel are equivalent-safe:
 * both keep the protected action untouched until Cancel is chosen.
 */
export function AlertDialog({
  open,
  onOpenChange,
  title,
  children,
  confirmLabel = 'Reject',
  cancelLabel = 'Cancel',
}: Props) {
  const ref = useRef<HTMLDialogElement>(null);
  const titleId = useId();
  const bodyId = useId();

  useEffect(() => {
    const dialog = ref.current;
    if (!dialog) return;
    if (open && !dialog.open) dialog.showModal();
    if (!open && dialog.open) dialog.close();
  }, [open]);

  return (
    <dialog
      ref={ref}
      aria-labelledby={titleId}
      aria-describedby={bodyId}
      onCancel={(event) => {
        event.preventDefault();
        onOpenChange(false);
      }}
      onClick={(event) => {
        if (event.target === event.currentTarget) onOpenChange(false);
      }}
      className="fixed inset-0 m-auto h-fit max-w-sm rounded-2xl border border-slate-200 bg-white p-5 text-slate-900 shadow-2xl backdrop:bg-slate-950/55 backdrop:backdrop-blur-md"
    >
      <h2 id={titleId} className="text-base font-bold text-slate-950">
        {title}
      </h2>
      <div id={bodyId} className="mt-2 text-sm leading-5 text-slate-600">
        {children}
      </div>
      <div className="mt-4 flex justify-end gap-2">
        <button
          type="button"
          data-testid="alert-cancel"
          onClick={() => onOpenChange(false)}
          className="min-h-10 rounded-xl border border-slate-200 bg-white px-3 text-sm font-semibold text-slate-800 hover:bg-slate-100 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-teal-700"
        >
          {cancelLabel}
        </button>
        <button
          type="button"
          data-testid="alert-confirm"
          onClick={() => onOpenChange(true)}
          className="min-h-10 rounded-xl bg-rose-700 px-3 text-sm font-semibold text-white hover:bg-rose-600 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-rose-700"
        >
          {confirmLabel}
        </button>
      </div>
    </dialog>
  );
}
