'use client';

import { motion, useReducedMotion } from 'framer-motion';

const layers = [
  { color: '#22d3ee', delay: 0, z: 'z-30' },
  { color: '#f5f7f8', delay: 0.15, z: 'z-20' },
  { color: '#111a25', delay: 0.3, z: 'z-10' },
] as const;

export default function PageTransition() {
  const reduce = useReducedMotion();
  if (reduce) return null;

  return (
    <>
      {layers.map((layer) => (
        <motion.div
          key={layer.color}
          aria-hidden="true"
          className={`pointer-events-none fixed inset-y-0 right-full w-screen ${layer.z}`}
          style={{ transformOrigin: 'right', background: layer.color }}
          initial={{ x: '100%', scaleX: 1 }}
          animate={{ x: '0%', scaleX: 0 }}
          transition={{
            delay: layer.delay,
            duration: 0.6,
            ease: 'easeInOut',
          }}
        />
      ))}
    </>
  );
}
