'use client';

import { useId, useState } from 'react';
import { AnimatePresence, motion, useReducedMotion } from 'framer-motion';
import {
  AlertCircle,
  ChevronDown,
  CircleCheck,
  LoaderCircle,
} from 'lucide-react';
import { cn } from '@/lib/utils';

export type TaskStep = {
  id: string;
  title: string;
  status?: 'running' | 'done' | 'error';
};

type Props = {
  running?: boolean;
  steps: TaskStep[];
  /** Applied first on the collapsible trigger buffer. */
  className?: string;
};

function taskTitle(steps: TaskStep[]) {
  const failing = steps.find((step) => step.status === 'error');
  const running = steps.find((step) => step.status === 'running');
  if (running) return running.title;
  if (failing) return `Failed: ${failing.title}`;
  return steps[steps.length - 1]?.title ?? 'Working…';
}

/**
 * Run-step trace: steps land as the agent takes them; the container
 * collapses into its latest step once the run settles.
 */
export function Task({ running, steps, className }: Props) {
  const reducedMotion = useReducedMotion();
  const [open, setOpen] = useState(true);
  const contentId = useId();
  const triggerId = useId();
  if (steps.length === 0) return null;

  const hasError = steps.some((step) => step.status === 'error');

  return (
    <div
      data-slot="task"
      data-testid="task-trace"
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
        data-testid="task-trace-trigger"
        onClick={() => setOpen((value) => !value)}
        className="flex w-full cursor-pointer items-center gap-2 px-3 py-2 text-left focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-teal-700"
      >
        {running ? (
          <LoaderCircle
            className="size-3.5 shrink-0 animate-spin text-teal-700"
            aria-hidden="true"
          />
        ) : hasError ? (
          <AlertCircle
            className="size-3.5 shrink-0 text-rose-600"
            aria-hidden="true"
          />
        ) : (
          <CircleCheck
            className="size-3.5 shrink-0 text-teal-700"
            aria-hidden="true"
          />
        )}
        <span className="truncate text-xs font-semibold text-slate-700">
          {taskTitle(steps)}
        </span>
        <span className="ml-auto shrink-0 text-[11px] text-slate-400">
          {steps.length} step{steps.length === 1 ? '' : 's'}
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
            key="task-steps"
            id={contentId}
            role="region"
            aria-labelledby={triggerId}
            initial={reducedMotion ? { opacity: 0 } : { opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: 'auto' }}
            exit={reducedMotion ? { opacity: 0 } : { opacity: 0, height: 0 }}
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
                ) : step.status === 'error' ? (
                  <AlertCircle
                    className="size-3 shrink-0 text-rose-500"
                    aria-hidden="true"
                  />
                ) : (
                  <CircleCheck
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
