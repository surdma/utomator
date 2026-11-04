'use client';

export function SwitchRow({
  checked,
  disabled,
  label,
  hint,
  testId,
  onChange,
}: {
  checked: boolean;
  disabled: boolean;
  label: string;
  hint: string;
  testId?: string;
  onChange: (next: boolean) => void;
}) {
  return (
    <div className="flex items-center justify-between gap-6 border-b border-slate-200 py-6 last:border-b-0">
      <div className="min-w-0">
        <p className="text-base font-semibold text-[#111a25]">{label}</p>
        <p className="mt-1 max-w-md text-sm leading-6 text-slate-600">{hint}</p>
      </div>
      <button
        type="button"
        role="switch"
        aria-checked={checked}
        aria-label={label}
        data-testid={testId}
        disabled={disabled}
        onClick={() => onChange(!checked)}
        className="inline-flex min-h-11 min-w-16 cursor-pointer items-center justify-center rounded-full focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-teal-700 disabled:cursor-not-allowed disabled:opacity-40"
      >
        <span
          className={
            'inline-flex h-8 w-14 items-center rounded-full p-1 transition duration-200 motion-reduce:transition-none ' +
            (checked ? 'bg-teal-700' : 'bg-slate-300')
          }
        >
          <span
            className={
              'size-6 rounded-full bg-white shadow transition duration-200 motion-reduce:transition-none ' +
              (checked ? 'translate-x-6' : 'translate-x-0')
            }
          />
        </span>
      </button>
    </div>
  );
}
