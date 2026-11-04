'use client';

import { AnimatePresence, motion, useReducedMotion } from 'framer-motion';
import { type ReactNode, useEffect, useId, useRef } from 'react';
import { cn } from '@/lib/utils';

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** The in-flow control that toggles `open`. */
  trigger: ReactNode;
  children: ReactNode;
  /** Tailwind classes on the floating card. */
  contentClassName?: string;
  align?: 'start' | 'end';
  side?: 'top' | 'bottom';
  'aria-label'?: string;
  className?: string;
};

/**
 * Soft anchored popover: Esc and outside pointerdown close it, so
 * keyboard and mouse both escape without an explicit close button.
 * The trigger stays in flow; the card floats with a scale+fade motion
 * that flattens under prefers-reduced-motion.
 */
export function Popover({
  open,
  onOpenChange,
  trigger,
  children,
  contentClassName,
  align = 'start',
  side = 'bottom',
  'aria-label': ariaLabel,
  className,
}: Props) {
  const rootRef = useRef<HTMLDivElement>(null);
  const reducedMotion = useReducedMotion();
  const contentId = useId();

  useEffect(() => {
    if (!open) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onOpenChange(false);
    };
    const onPointerDown = (event: PointerEvent) => {
      if (!rootRef.current?.contains(event.target as Node)) onOpenChange(false);
    };
    document.addEventListener('keydown', onKey);
    document.addEventListener('pointerdown', onPointerDown);
    return () => {
      document.removeEventListener('keydown', onKey);
      document.removeEventListener('pointerdown', onPointerDown);
    };
  }, [open, onOpenChange]);

  return (
    <div ref={rootRef} className={cn('relative', className)}>
      {trigger}
      <AnimatePresence initial={false}>
        {open && (
          <motion.div
            key={contentId}
            id={contentId}
            role="dialog"
            aria-label={ariaLabel}
            initial={
              reducedMotion
                ? { opacity: 1 }
                : { opacity: 0, scale: 0.96, y: side === 'top' ? 4 : -4 }
            }
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={reducedMotion ? { opacity: 1 } : { opacity: 0, scale: 0.97 }}
            transition={{ duration: 0.16, ease: 'easeOut' }}
            className={cn(
              'absolute z-50 w-[min(20rem,calc(100vw-2rem))] rounded-2xl border border-slate-200 bg-white p-2 shadow-[0_18px_44px_-18px_rgba(15,23,42,.35)]',
              side === 'top' ? 'bottom-full mb-2' : 'top-full mt-2',
              align === 'end' ? 'right-0' : 'left-0',
              contentClassName,
            )}
          >
            {children}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
