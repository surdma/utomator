'use client';
import { usePathname } from 'next/navigation';
import Link from 'next/link';

export default function Footer() {
  if (usePathname() !== '/') return null;
  return (
    <footer className="border-t border-slate-200 bg-white">
      <div className="mx-auto flex max-w-7xl flex-col justify-between gap-3 px-6 py-5 text-sm text-slate-600 sm:flex-row sm:items-center md:px-8">
        <p>
          <strong className="font-semibold text-slate-900">Utomator</strong>
          <span className="ml-3">
            Your browser workflows, under your control.
          </span>
        </p>
        <div className="flex items-center gap-5">
          <Link
            href="/dashboard/workspace"
            className="inline-flex min-h-11 cursor-pointer touch-manipulation items-center font-medium text-slate-900 underline-offset-4 hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-teal-700"
          >
            Workspace
          </Link>
          <span>© {new Date().getFullYear()} Utomator</span>
        </div>
      </div>
    </footer>
  );
}
