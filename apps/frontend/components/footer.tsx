"use client";
import { usePathname } from "next/navigation";
import Link from "next/link";
export default function Footer() {
  if (usePathname() !== "/") return null;
  return <footer className="border-t border-slate-200 bg-white/60">
    <div className="mx-auto flex max-w-7xl flex-col gap-3 px-6 py-5 text-sm text-slate-600 md:flex-row md:items-center md:justify-between md:px-8">
      <p><strong className="text-slate-900">Utomator</strong> · Local-first, approval-driven workflows.</p>
      <div className="flex items-center gap-5"><Link href="/dashboard" className="hover:text-slate-900">Dashboard</Link><span>© {new Date().getFullYear()} Utomator</span></div>
    </div>
  </footer>;
}
