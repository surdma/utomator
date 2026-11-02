'use client';

import { motion, useReducedMotion } from 'framer-motion';

export default function PageTransition() {
  const reduce = useReducedMotion();
  if (reduce) return null;

  return (
    <motion.div
      aria-hidden="true"
      className="pointer-events-none fixed inset-y-0 right-full z-30 w-screen bg-[#24302A]"
      style={{ transformOrigin: 'right' }}
      initial={{ x: '100%', scaleX: 1 }}
      animate={{ x: '0%', scaleX: 0 }}
      transition={{ duration: 0.45, ease: [0.22, 1, 0.36, 1] }}
    />
  );
}
