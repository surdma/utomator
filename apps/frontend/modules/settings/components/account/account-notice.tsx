'use client';

export function Notice({
  tone,
  children,
  onDismiss,
}: {
  tone: 'ok' | 'warn';
  children: string;
  onDismiss: () => void;
}) {
  return (
    <div
      role={tone === 'warn' ? 'alert' : 'status'}
      className={
        'flex items-start justify-between gap-4 rounded-2xl px-5 py-4 text-sm leading-6 ' +
        (tone === 'warn'
          ? 'border border-rose-200 bg-rose-50 text-rose-900'
          : 'border border-teal-200 bg-teal-50 text-teal-950')
      }
    >
      <p>{children}</p>
      <button
        type="button"
        onClick={onDismiss}
        className="min-h-11 shrink-0 cursor-pointer rounded-lg px-3 font-semibold focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-teal-700"
      >
        Dismiss
      </button>
    </div>
  );
}
