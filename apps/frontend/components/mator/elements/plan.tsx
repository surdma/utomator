'use client';

import { useId, useState } from 'react';
import { AnimatePresence, motion, useReducedMotion } from 'framer-motion';
import { ChevronDown, Circle, CircleCheck, LoaderCircle } from 'lucide-react';
import { cn } from '@/lib/utils';

export type PlanStep = {
  id: string;
  title: string;
  status: 'pending' | 'running' | 'done';
};

type Props = {
  goal: string;
  steps: PlanStep[];
  className?: string;
};

/**
 * Pre-declared steps visible before execution begins.
 * Distinct from Task: steps are known up front, pending steps shown.
 */
export function Plan({ goal, steps, className }: Props) {
  const reducedMotion = useReducedMotion();
  const [open, setOpen] = useState(true);
  const contentId = useId();
  const triggerId = useId();
  if (steps.length === 0) return null;
  const done = steps.filter((step) => step.status === 'done').length;

  return (
    <div
      data-slot="plan"
      data-testid="plan-trace"
      className={cn(
        'min-w-0 rounded-xl border border-slate-200 bg-white/80',
        className
      )}
    >
      <button
        type="button"
        id={triggerId}
        aria-controls={contentId}
        aria-expanded={open}
        onClick={() => setOpen((value) => !value)}
        className="flex min-h-11 w-full cursor-pointer items-center gap-2 px-3 py-2 text-left focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-teal-700"
      >
        <span className="truncate text-xs font-semibold text-slate-700">
          {goal}
        </span>
        <span className="ml-auto shrink-0 text-[11px] text-slate-400">
          {done} of {steps.length} done
        </span>
        <ChevronDown
          aria-hidden="true"
          className={cn(
            'size-3.5 shrink-0 text-slate-400 transition-transform',
            open && 'rotate-180'
          )}
        />
      </button>
      <AnimatePresence initial={false}>
        {open && (
          <motion.ul
            key="plan-steps"
            id={contentId}
            role="region"
            aria-labelledby={triggerId}
            initial={reducedMotion ? { opacity: 0 } : { opacity: 0, y: -4 }}
            animate={{ opacity: 1, y: 0 }}
            exit={reducedMotion ? { opacity: 0 } : { opacity: 0, y: -4 }}
            transition={{ duration: 0.2, ease: 'easeOut' }}
            className="overflow-hidden border-t border-slate-100 px-3 py-2"
          >
            {steps.map((step) => (
              <li
                key={step.id}
                className="flex items-center gap-2 py-0.5 text-[12px] text-slate-600"
              >
                {step.status === 'running' ? (
                  <LoaderCircle
                    className="size-3 shrink-0 animate-spin text-teal-700"
                    aria-hidden="true"
                  />
                ) : step.status === 'done' ? (
                  <CircleCheck
                    className="size-3 shrink-0 text-teal-700"
                    aria-hidden="true"
                  />
                ) : (
                  <Circle
                    className="size-3 shrink-0 text-slate-300"
                    aria-hidden="true"
                  />
                )}
                <span className="truncate">{step.title}</span>
              </li>
            ))}
          </motion.ul>
        )}
      </AnimatePresence>
    </div>
  );
}
