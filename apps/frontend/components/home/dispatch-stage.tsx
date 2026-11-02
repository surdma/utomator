'use client';

import { useEffect, useRef, useState } from 'react';
import { motion } from 'framer-motion';
import { Check } from 'lucide-react';

type Phase = 'inspect' | 'hold' | 'approve' | 'verify';

const NEXT: Record<Phase, Phase> = {
  inspect: 'hold',
  hold: 'approve',
  approve: 'verify',
  verify: 'inspect',
};

const DURATIONS: Record<Phase, number> = {
  inspect: 3000,
  hold: 2400,
  approve: 1100,
  verify: 4200,
};

const STATUS: Record<Phase, string> = {
  inspect: 'Reading',
  hold: 'Held',
  approve: 'Released',
  verify: 'Checked',
};

const FIELDS = [
  { label: 'Photo', kind: 'photo' },
  { label: 'Headline', kind: 'line' },
  { label: 'About', kind: 'block' },
] as const;

const STEPS = ['Inspect', 'Approve', 'Verify'] as const;

function activeIndex(phase: Phase) {
  if (phase === 'inspect') return 0;
  if (phase === 'verify') return 2;
  return 1;
}

function useCalmMotion() {
  const [calm, setCalm] = useState(false);
  useEffect(() => {
    const media = window.matchMedia('(prefers-reduced-motion: reduce)');
    const apply = () => setCalm(media.matches);
    apply();
    media.addEventListener('change', apply);
    return () => media.removeEventListener('change', apply);
  }, []);
  return calm;
}

export default function DispatchStage() {
  const calm = useCalmMotion();
  const [phase, setPhase] = useState<Phase>('inspect');
  const [seenTick, setSeenTick] = useState(0);
  const frameRef = useRef<HTMLDivElement>(null);
  const [scanTravel, setScanTravel] = useState(160);
  const [hidden, setHidden] = useState(false);
  const shown = calm ? 'verify' : phase;

  useEffect(() => {
    const frame = frameRef.current;
    if (!frame) return;
    const measure = () => setScanTravel(Math.max(0, frame.clientHeight - 4));
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(frame);
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    const onHide = () => setHidden(document.hidden);
    document.addEventListener('visibilitychange', onHide);
    return () => document.removeEventListener('visibilitychange', onHide);
  }, []);

  useEffect(() => {
    if (calm || hidden) return;
    const timer = window.setTimeout(
      () => setPhase((current) => NEXT[current]),
      DURATIONS[phase]
    );
    return () => window.clearTimeout(timer);
  }, [phase, calm, hidden]);

  useEffect(() => {
    if (calm || phase !== 'inspect') return;
    const timers = [0, 1, 2, 3].map((count) =>
      window.setTimeout(() => setSeenTick(count), count === 0 ? 0 : 750 * count)
    );
    return () => timers.forEach((timer) => window.clearTimeout(timer));
  }, [phase, calm]);

  const seen = calm || phase !== 'inspect' ? FIELDS.length : seenTick;
  const step = activeIndex(shown);

  return (
    <div className="relative">
      <style>{`
        .utomator-frame { position: relative; }
        @keyframes utomator-scan {
          0% { transform: translate3d(0, 0, 0); opacity: 0; }
          12% { opacity: 1; }
          100% { transform: translate3d(0, var(--scan-travel), 0); opacity: 0; }
        }
        .utomator-scan {
          animation: utomator-scan 2.5s cubic-bezier(0.22, 1, 0.36, 1) both;
          box-shadow: 0 0 16px #e07a2f;
        }
        @media (prefers-reduced-motion: reduce) {
          .utomator-scan { display: none; }
        }
      `}</style>

      <span
        aria-hidden="true"
        className="pointer-events-none absolute -top-2 -left-2 size-3 border-t border-l border-[#5C675F]"
      />
      <span
        aria-hidden="true"
        className="pointer-events-none absolute -top-2 -right-2 size-3 border-t border-r border-[#5C675F]"
      />
      <span
        aria-hidden="true"
        className="pointer-events-none absolute -bottom-2 -left-2 size-3 border-b border-l border-[#5C675F]"
      />
      <span
        aria-hidden="true"
        className="pointer-events-none absolute -right-2 -bottom-2 size-3 border-r border-b border-[#5C675F]"
      />

      <div className="bg-[#24302A] p-2 text-[#E7E1D4] shadow-[0_22px_40px_rgba(26,33,28,0.16)] sm:p-3">
        <div className="utomator-frame relative overflow-hidden border border-white/10">
          <div className="flex items-center justify-between border-b border-white/10 px-3 py-2 font-mono text-xs tracking-[0.16em] uppercase">
            <span>Live page</span>
            <span aria-hidden="true">{STATUS[shown]}</span>
          </div>
          <div ref={frameRef} className="relative">
            <ul className="space-y-3 px-3 py-4">
              {FIELDS.map((field, index) => (
                <li
                  key={field.label}
                  className="grid grid-cols-[4.75rem_minmax(0,1fr)_3rem] items-center gap-3"
                >
                  <span className="font-mono text-xs tracking-[0.14em] uppercase">
                    {field.label}
                  </span>
                  {field.kind === 'photo' ? (
                    <span className="size-10 bg-[#314039]" />
                  ) : field.kind === 'line' ? (
                    <span className="block h-2 w-[78%] bg-[#314039]" />
                  ) : (
                    <span className="flex flex-col gap-1.5">
                      <span className="block h-2 w-full bg-[#314039]" />
                      <span className="block h-2 w-[62%] bg-[#314039]" />
                    </span>
                  )}
                  <span className="text-right font-mono text-xs tracking-wide uppercase">
                    {seen > index ? 'Seen' : ''}
                  </span>
                </li>
              ))}
            </ul>
            <motion.div
              aria-hidden={shown !== 'hold'}
              className="absolute inset-x-3 top-1/2 z-10 flex h-11 items-center justify-center bg-[#E07A2F] text-sm font-semibold tracking-[0.14em] text-[#1A211C] uppercase"
              initial={false}
              animate={{
                y: shown === 'hold' ? '-50%' : '-230%',
                opacity: shown === 'hold' ? 1 : 0,
              }}
              transition={
                calm
                  ? { duration: 0 }
                  : shown === 'hold'
                    ? {
                        type: 'spring',
                        stiffness: 520,
                        damping: 32,
                        opacity: { duration: 0.12 },
                      }
                    : { duration: 0.22, ease: 'easeIn' }
              }
            >
              Held
            </motion.div>
            {shown === 'inspect' && !calm ? (
              <div
                aria-hidden="true"
                className="utomator-scan pointer-events-none absolute inset-x-0 top-0 h-1 bg-[#E07A2F]"
                style={{ ['--scan-travel' as string]: `${scanTravel}px` }}
              />
            ) : null}
          </div>
          <div className="relative mx-3 mb-3 h-[5.5rem] overflow-hidden border border-white/10">
            <p className="absolute top-2 left-3 font-mono text-xs tracking-[0.16em] uppercase">
              Evidence
            </p>
            <motion.article
              aria-hidden={shown !== 'verify'}
              className="absolute inset-0 flex items-center gap-3 bg-[#F4EFE4] px-3 text-[#1A211C]"
              initial={false}
              animate={{ y: shown === 'verify' ? '0%' : '105%' }}
              transition={
                calm
                  ? { duration: 0 }
                  : shown === 'verify'
                    ? { type: 'spring', stiffness: 320, damping: 28 }
                    : { duration: 0.18, ease: 'easeIn' }
              }
            >
              <motion.span
                aria-hidden="true"
                className="flex size-8 shrink-0 items-center justify-center rounded-full border-2 border-[#1F6B52] text-[#1F6B52]"
                initial={false}
                animate={{
                  scale: shown === 'verify' ? 1 : 0.7,
                  opacity: shown === 'verify' ? 1 : 0,
                }}
                transition={
                  calm
                    ? { duration: 0 }
                    : {
                        delay: shown === 'verify' ? 0.18 : 0,
                        duration: 0.2,
                      }
                }
              >
                <Check className="size-4" strokeWidth={2.5} />
              </motion.span>
              <div>
                <p className="text-sm font-semibold text-[#1F6B52]">Checked</p>
                <p className="text-sm leading-snug">Live page re-read</p>
              </div>
            </motion.article>
          </div>
        </div>
      </div>

      <div className="mt-5">
        <ol className="grid grid-cols-3">
          {STEPS.map((label, index) => (
            <li
              key={label}
              className={`text-center font-mono text-xs tracking-[0.16em] uppercase ${
                index === step
                  ? 'font-semibold text-[#1A211C]'
                  : 'text-[#3D4942]'
              }`}
            >
              {label}
            </li>
          ))}
        </ol>
        <div className="relative mt-2 h-0.5 bg-[#1A211C]/15">
          <motion.div
            className="absolute top-0 left-0 h-0.5 w-1/3 bg-[#1A211C]"
            initial={false}
            animate={{ x: `${step * 100}%` }}
            transition={
              calm
                ? { duration: 0 }
                : { duration: 0.4, ease: [0.22, 1, 0.36, 1] }
            }
          />
        </div>
      </div>
      <p className="sr-only">
        The run reads the live page, holds until you approve it, then re-reads
        the page and keeps the evidence. Now: {STATUS[shown]}.
      </p>
    </div>
  );
}
