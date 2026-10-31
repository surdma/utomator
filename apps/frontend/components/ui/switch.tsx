'use client';

import { cn } from '@/lib/utils';

type SwitchProps = {
  checked: boolean;
  onCheckedChange: (checked: boolean) => void;
  disabled?: boolean;
  'aria-label': string;
  className?: string;
  id?: string;
};

export function Switch({
  checked,
  onCheckedChange,
  disabled,
  'aria-label': ariaLabel,
  className,
  id,
}: SwitchProps) {
  return (
    <button
      id={id}
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={ariaLabel}
      disabled={disabled}
      data-state={checked ? 'checked' : 'unchecked'}
      data-testid="mator-switch"
      onClick={() => onCheckedChange(!checked)}
      className={cn(
        'relative inline-flex h-6 w-10 shrink-0 cursor-pointer items-center rounded-full border transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-teal-700 disabled:cursor-not-allowed disabled:opacity-40',
        checked
          ? 'border-teal-700 bg-teal-700'
          : 'border-slate-300 bg-slate-200',
        className
      )}
    >
      <span
        aria-hidden="true"
        data-slot="switch-thumb"
        className={cn(
          'pointer-events-none block size-4 translate-x-1 rounded-full bg-white shadow-sm transition-transform',
          checked && 'translate-x-5'
        )}
      />
    </button>
  );
}
