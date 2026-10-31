'use client';

import { useId, useState } from 'react';
import { AnimatePresence, motion, useReducedMotion } from 'framer-motion';
import { ChevronDown, CircleCheck, Workflow } from 'lucide-react';
import { cn } from '@/lib/utils';

type Props = {
  title: string;
  content: string;
  defaultOpen?: boolean;
  onSpeak?: () => void;
  speakLabel?: string;
  className?: string;
};

/**
 * Trace-style collapsible line for Mator's guided "How" reply:
 * the line reads done; the guidance expands on demand.
 */
export function Reasoning({
  title,
  content,
  defaultOpen = false,
  onSpeak,
  speakLabel = 'Read this guidance aloud',
  className,
}: Props) {
  const reducedMotion = useReducedMotion();
  const [open, setOpen] = useState(defaultOpen);
  const contentId = useId();
  const triggerId = useId();

  return (
    <div
      data-slot="reasoning"
      className={cn(
        'min-w-0 rounded-xl border border-slate-200 bg-white/70',
        className
      )}
    >
      <div className="flex items-center justify-between gap-2 px-3 py-2">
        <button
          type="button"
          id={triggerId}
          aria-controls={contentId}
          aria-expanded={open}
          onClick={() => setOpen((value) => !value)}
          className="flex min-w-0 cursor-pointer items-center gap-2 rounded-lg py-0.5 text-left focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-teal-700"
        >
          <CircleCheck
            className="size-3.5 shrink-0 text-teal-700"
            aria-hidden="true"
          />
          <span className="truncate text-xs font-semibold text-slate-700">
            {title}
          </span>
          <ChevronDown
            aria-hidden="true"
            className={cn(
              'size-3.5 shrink-0 text-slate-400 transition-transform',
              open && 'rotate-180'
            )}
          />
        </button>
        {onSpeak && (
          <button
            type="button"
            onClick={onSpeak}
            aria-label={speakLabel}
            className="inline-flex size-7 shrink-0 cursor-pointer items-center justify-center rounded-lg text-slate-500 hover:bg-slate-100 hover:text-slate-800 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-teal-700"
          >
            <Workflow className="size-3.5" aria-hidden="true" />
            <span className="sr-only">{speakLabel}</span>
          </button>
        )}
      </div>
      <AnimatePresence initial={false}>
        {open && (
          <motion.div
            key="reasoning-content"
            id={contentId}
            role="region"
            aria-labelledby={triggerId}
            initial={reducedMotion ? { opacity: 0 } : { opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: 'auto' }}
            exit={reducedMotion ? { opacity: 0 } : { opacity: 0, height: 0 }}
            transition={{ duration: 0.2, ease: 'easeOut' }}
            className="overflow-hidden border-t border-slate-100 px-3 pt-2 pb-2.5"
          >
            <div className="text-[13px] leading-relaxed whitespace-pre-wrap text-slate-700">
              {content}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
