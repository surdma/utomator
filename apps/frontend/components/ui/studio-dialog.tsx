"use client";

import { useEffect, useId, useRef, type ReactNode, type MouseEvent } from "react";
import { X } from "lucide-react";

type Props = {
  open: boolean;
  title: string;
  description?: string;
  children: ReactNode;
  onDismiss: () => void;
  dismissible?: boolean;
  size?: "default" | "wide";
  testId?: string;
  scrollMode?: "page" | "contained";
};

export default function StudioDialog({
  open, title, description, children, onDismiss, dismissible = true,
  size = "default", testId, scrollMode = "page",
}: Props) {
  const ref = useRef<HTMLDialogElement>(null);
  const titleId = useId();
  const descriptionId = useId();

  useEffect(() => {
    const dialog = ref.current;
    if (!dialog) return;
    if (open && !dialog.open) dialog.showModal();
    if (!open && dialog.open) dialog.close();
  }, [open]);

  function backdropClick(event: MouseEvent<HTMLDialogElement>) {
    if (!dismissible || event.target !== event.currentTarget) return;
    const bounds = event.currentTarget.getBoundingClientRect();
    if (event.clientX < bounds.left || event.clientX > bounds.right ||
      event.clientY < bounds.top || event.clientY > bounds.bottom) onDismiss();
  }

  return (
    <dialog ref={ref} data-testid={testId} aria-labelledby={titleId}
      aria-describedby={description ? descriptionId : undefined}
      onCancel={(event) => { event.preventDefault(); if (dismissible) onDismiss(); }}
      onClick={backdropClick}
      className={"fixed inset-0 m-auto max-h-[min(90dvh,960px)] w-[calc(100%-2rem)] rounded-2xl border border-slate-200 bg-white p-0 text-slate-900 shadow-2xl backdrop:bg-slate-950/55 backdrop:backdrop-blur-md " +
        (scrollMode === "contained" ? "h-[min(90dvh,960px)] open:flex flex-col overflow-hidden " : "overflow-y-auto ") +
        (size === "wide" ? "max-w-5xl" : "max-w-2xl")}>
      <div className="sticky top-0 z-10 flex items-start justify-between gap-4 border-b border-slate-200 bg-white/95 px-5 py-4 backdrop-blur">
        <div className="min-w-0">
          <h2 id={titleId} className="text-base font-extrabold tracking-tight text-slate-950">{title}</h2>
          {description && <p id={descriptionId} className="mt-1 text-xs leading-5 text-slate-500">{description}</p>}
        </div>
        {dismissible && <button type="button" onClick={onDismiss} aria-label={"Close " + title}
          className="flex size-10 shrink-0 items-center justify-center rounded-lg text-slate-600 hover:bg-slate-100 focus-visible:outline-2 focus-visible:outline-teal-600">
          <X className="size-5" />
        </button>}
      </div>
      <div className={scrollMode === "contained" ? "min-h-0 flex-1 overflow-hidden p-3 sm:p-5" : "p-5"}>{children}</div>
    </dialog>
  );
}
