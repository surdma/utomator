'use client';

import { cn } from '@/lib/utils';

type Suggestion = { label: string; prompt: string };

type Props = {
  suggestions: Suggestion[];
  onSelect: (prompt: string) => void;
  disabled?: boolean;
  className?: string;
};

export function Suggestion({
  suggestions,
  onSelect,
  disabled,
  className,
}: Props) {
  if (suggestions.length === 0) return null;
  return (
    <div
      className={cn('flex flex-wrap gap-1.5 pb-1', className)}
      data-testid="mator-suggestions"
    >
      {suggestions.map((suggestion) => (
        <button
          key={suggestion.label}
          type="button"
          disabled={disabled}
          onClick={() => onSelect(suggestion.prompt)}
          className="min-h-9 cursor-pointer rounded-full border border-slate-200 bg-white px-3 text-xs font-medium text-slate-600 transition-colors hover:border-teal-400 hover:bg-teal-50/60 hover:text-teal-800 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-teal-700 disabled:cursor-not-allowed disabled:opacity-40"
        >
          {suggestion.label}
        </button>
      ))}
    </div>
  );
}
