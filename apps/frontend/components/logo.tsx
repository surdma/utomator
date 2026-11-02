'use client';

import Link from 'next/link';

/** Same graphic as the favicon at `/icon.svg`. */
export function AppMark({ className = 'size-10' }: { className?: string }) {
  return (
    // The SVG already includes its rounded tile, so it stays an image, not a restyled icon.
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src="/icon.svg"
      alt=""
      width={64}
      height={64}
      className={`shrink-0 ${className}`}
    />
  );
}

export default function Logo() {
  return (
    <Link
      href="/"
      aria-label="Utomator home"
      className="inline-flex min-h-11 cursor-pointer touch-manipulation items-center gap-3 font-semibold tracking-tight text-slate-900 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-teal-700"
    >
      <AppMark />
      <span>Utomator</span>
    </Link>
  );
}
