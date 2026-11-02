'use client';
import { usePathname } from 'next/navigation';
import Link from 'next/link';

export default function Footer() {
  if (usePathname() !== '/') return null;
  return (
    <footer className="border-t border-[#1A211C]/15">
      <div className="mx-auto flex max-w-6xl flex-col justify-between gap-3 px-6 py-5 text-sm text-[#3D4942] sm:flex-row sm:items-center md:px-8">
        <p>
          <strong className="font-semibold text-[#1A211C]">Utomator</strong>
          <span className="ml-3">On this machine.</span>
        </p>
        <div className="flex items-center gap-5">
          <Link
            href="/dashboard/workspace"
            className="inline-flex min-h-11 cursor-pointer touch-manipulation items-center font-medium text-[#1A211C] underline-offset-4 hover:underline focus-visible:outline focus-visible:outline-[3px] focus-visible:outline-offset-[3px] focus-visible:outline-[#1A211C]"
          >
            Workspace
          </Link>
          <span>© {new Date().getFullYear()} Utomator</span>
        </div>
      </div>
    </footer>
  );
}
