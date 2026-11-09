'use client';

import { AnimatePresence, motion, useReducedMotion } from 'framer-motion';
import {
  createContext,
  type ReactNode,
  useCallback,
  useContext,
  useRef,
  useState,
} from 'react';
import { cn } from '@/lib/utils';

type ToastTone = 'default' | 'success' | 'error';
type Toast = { id: number; message: string; tone: ToastTone };

const ToastContext = createContext<(message: string, tone?: ToastTone) => void>(
  () => undefined,
);

export function useToast() {
  return useContext(ToastContext);
}

export function ToastProvider({ children }: { children: ReactNode }) {
  const reducedMotion = useReducedMotion();
  const [toasts, setToasts] = useState<Toast[]>([]);
  const nextId = useRef(0);

  const push = useCallback((message: string, tone: ToastTone = 'default') => {
    const id = nextId.current++;
    setToasts((current) => [...current, { id, message, tone }]);
    window.setTimeout(() => {
      setToasts((current) => current.filter((item) => item.id !== id));
    }, 3500);
  }, []);

  return (
    <ToastContext.Provider value={push}>
      {children}
      <div
        aria-live="polite"
        className="pointer-events-none fixed bottom-6 left-1/2 z-[60] flex w-fit max-w-[90vw] -translate-x-1/2 flex-col items-center gap-2"
      >
        <AnimatePresence initial={false}>
          {toasts.map((toast) => (
            <motion.div
              key={toast.id}
              role="status"
              data-testid="toast"
              initial={reducedMotion ? { opacity: 1 } : { opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              exit={reducedMotion ? { opacity: 1 } : { opacity: 0, y: 4 }}
              transition={{ duration: 0.18, ease: 'easeOut' }}
              className={cn(
                'pointer-events-auto rounded-full border px-4 py-2 text-xs font-semibold shadow-lg',
                toast.tone === 'success'
                  ? 'border-emerald-200 bg-emerald-50 text-emerald-800'
                  : toast.tone === 'error'
                    ? 'border-rose-200 bg-rose-50 text-rose-700'
                    : 'border-slate-700 bg-slate-900 text-white',
              )}
            >
              {toast.message}
            </motion.div>
          ))}
        </AnimatePresence>
      </div>
    </ToastContext.Provider>
  );
}
