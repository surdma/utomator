'use client';

import { Info } from 'lucide-react';
import { useEffect, useId, useRef, useState } from 'react';

export function Hint({ label, children }: { label: string; children: string }) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const panelId = useId();

  useEffect(() => {
    if (!open) return;
    const close = (event: MouseEvent) => {
      if (!ref.current?.contains(event.target as Node)) setOpen(false);
    };
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setOpen(false);
    };
    document.addEventListener('mousedown', close);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', close);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        aria-expanded={open}
        aria-controls={panelId}
        aria-label={label}
        onClick={() => setOpen((value) => !value)}
        className="inline-flex size-11 cursor-pointer items-center justify-center rounded-full text-current/80 transition duration-200 hover:bg-white/10 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-teal-300 motion-reduce:transition-none"
      >
        <Info className="size-4" aria-hidden="true" />
      </button>
      {open ? (
        <p
          id={panelId}
          role="note"
          className="absolute top-12 right-0 z-20 w-[min(18rem,calc(100vw-3rem))] rounded-2xl border border-slate-200 bg-white p-4 text-sm leading-6 text-slate-700 shadow-xl"
        >
          {children}
        </p>
      ) : null}
    </div>
  );
}
