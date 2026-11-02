'use client';

import { type ReactNode } from 'react';
import { motion, useReducedMotion } from 'framer-motion';
import { MessageScrollerItem } from '@/components/ui/message-scroller';

/** Mount-in-place row: transform/opacity only; disabled under reduced motion. */
export function ThreadRow({
  id,
  anchor = false,
  side = 'start',
  children,
}: {
  id: string;
  anchor?: boolean;
  side?: 'start' | 'end';
  children: ReactNode;
}) {
  const reduceMotion = useReducedMotion();
  return (
    <MessageScrollerItem messageId={id} scrollAnchor={anchor}>
      <motion.div
        initial={reduceMotion ? false : { opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.22, ease: 'easeOut' }}
        data-message-side={side}
        className={
          side === 'end' ? 'flex w-full min-w-0 justify-end' : 'w-full min-w-0'
        }
      >
        {children}
      </motion.div>
    </MessageScrollerItem>
  );
}
