'use client';

import { useId } from 'react';
import { cn } from '@/lib/utils';

type SliderProps = {
  value: number;
  onValueChange: (value: number) => void;
  min?: number;
  max?: number;
  step?: number;
  disabled?: boolean;
  'aria-label': string;
  className?: string;
  /** Optional labels under the track, one per stop. */
  stops?: readonly string[];
};

export function Slider({
  value,
  onValueChange,
  min = 0,
  max = 2,
  step = 1,
  disabled,
  'aria-label': ariaLabel,
  className,
  stops,
}: SliderProps) {
  const id = useId();
  return (
    <div className={cn('w-full', className)}>
      <input
        id={id}
        type="range"
        value={value}
        min={min}
        max={max}
        step={step}
        disabled={disabled}
        aria-label={ariaLabel}
        onChange={(event) => onValueChange(Number(event.target.value))}
        className="h-2 w-full cursor-pointer appearance-none rounded-full bg-slate-200 accent-teal-700 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-teal-700 disabled:cursor-not-allowed disabled:opacity-40"
      />
      {stops && stops.length > 0 && (
        <div
          aria-hidden="true"
          className="mt-1 flex justify-between text-[10px] font-medium text-slate-500"
        >
          {stops.map((label, index) => (
            <span key={label} data-active={value === index ? 'true' : 'false'}>
              {label}
            </span>
          ))}
        </div>
      )}
    </div>
  );
}
