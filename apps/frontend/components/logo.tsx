'use client';
import Link from 'next/link';

export default function Logo() {
  return (
    <Link
      href="/"
      aria-label="Utomator home"
      className="inline-flex min-h-11 cursor-pointer touch-manipulation items-center gap-3 font-semibold tracking-tight text-[#1A211C] focus-visible:outline focus-visible:outline-[3px] focus-visible:outline-offset-[3px] focus-visible:outline-[#1A211C]"
    >
      <span className="flex size-9 items-center justify-center bg-[#24302A]">
        <span className="h-1 w-4 bg-[#E07A2F]" />
      </span>
      <span>Utomator</span>
    </Link>
  );
}
