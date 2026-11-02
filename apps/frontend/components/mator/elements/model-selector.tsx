'use client';

import { useState } from 'react';
import { AnimatePresence, motion, useReducedMotion } from 'framer-motion';
import { Check, ChevronDown, Sparkles } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Popover } from '@/components/ui/popover';
import type { MatorModelOption } from '@/components/dashboard/pipeline/mator-api';
import { cn } from '@/lib/utils';

type Props = {
  models: MatorModelOption[];
  currentId: string | null;
  onSelect: (modelId: string) => void;
  disabled?: boolean;
  compact?: boolean;
  className?: string;
};

/** Chat-model picker (role-filtered by the caller), registry-style popover. */
export function ModelSelector({
  models,
  currentId,
  onSelect,
  disabled,
  compact,
  className,
}: Props) {
  const [open, setOpen] = useState(false);
  const reducedMotion = useReducedMotion();
  const current = models.find((model) => model.id === currentId);

  return (
    <Popover
      open={open}
      onOpenChange={setOpen}
      side="top"
      align="end"
      aria-label="Select chat model"
      className={className}
      trigger={
        <button
          type="button"
          aria-haspopup="dialog"
          aria-expanded={open}
          disabled={disabled}
          onClick={() => setOpen((value) => !value)}
          data-testid="mator-model-selector"
          aria-label={current ? `Chat model: ${current.label}` : 'Choose chat model'}
          className={cn(
            'inline-flex min-h-9 cursor-pointer items-center gap-1.5 rounded-full border border-slate-200 bg-white px-2.5 text-[11px] font-semibold text-slate-600 transition-colors hover:border-slate-300 hover:bg-slate-50 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-teal-700 disabled:cursor-not-allowed disabled:opacity-40',
            compact && 'min-h-11 px-2'
          )}
        >
          <Sparkles className="size-3 text-teal-700" aria-hidden="true" />
          <span className={cn('max-w-28 truncate', compact && 'hidden')}>
            {current?.label ?? 'Model'}
          </span>
          <ChevronDown aria-hidden="true" className="size-3 text-slate-400" />
        </button>
      }
    >
      <AnimatePresence>
        {open && (
          <motion.ul
            key="model-list"
            initial={reducedMotion ? { opacity: 1 } : { opacity: 0, y: 4 }}
            animate={{ opacity: 1, y: 0 }}
            exit={reducedMotion ? { opacity: 1 } : { opacity: 0, y: 2 }}
            transition={{ duration: 0.15, ease: 'easeOut' }}
            role="listbox"
            aria-label="Chat models"
            className="max-h-64 overflow-y-auto p-1"
          >
            {models.map((model) => {
              const selected = model.id === currentId;
              return (
                <li key={model.id}>
                  <button
                    type="button"
                    role="option"
                    aria-selected={selected}
                    onClick={() => {
                      onSelect(model.id);
                      setOpen(false);
                    }}
                    className={cn(
                      'flex w-full cursor-pointer items-start gap-2 rounded-xl px-2.5 py-2 text-left transition-colors hover:bg-slate-50 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-teal-700',
                      selected && 'bg-slate-50'
                    )}
                  >
                    <span className="min-w-0 flex-1">
                      <span className="flex items-center gap-1.5">
                        <span className="truncate text-xs font-semibold text-slate-800">
                          {model.label}
                        </span>
                        <Badge
                          tone={model.tier === 'paid' ? 'teal' : 'default'}
                          size="xs"
                        >
                          {model.tier}
                        </Badge>
                      </span>
                      <span className="block truncate text-[11px] text-slate-400">
                        {model.price} · {model.name}
                      </span>
                    </span>
                    {selected && (
                      <Check
                        className="mt-0.5 size-3.5 shrink-0 text-teal-700"
                        aria-hidden="true"
                      />
                    )}
                  </button>
                </li>
              );
            })}
          </motion.ul>
        )}
      </AnimatePresence>
    </Popover>
  );
}
