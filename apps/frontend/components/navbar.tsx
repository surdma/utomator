"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";
import Logo from "./logo";
const links = [{ label: "Home", href: "/" }, { label: "Dashboard", href: "/dashboard" }, { label: "Growth", href: "/growth" }, { label: "Editorial", href: "/editorial" }];
export default function Navbar() {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  if (pathname !== "/") return null;
  return (
    <header className="relative z-40 border-b border-slate-200/70 bg-white/85 backdrop-blur-md">
      <div className="mx-auto flex h-16 max-w-7xl items-center justify-between px-6 md:h-20 md:px-8">
        <Logo />
        <nav aria-label="Primary navigation" className="hidden items-center gap-2 md:flex">
          {links.map(({ label, href }) => <Link key={href} href={href} className="rounded-xl px-4 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-100 focus-visible:outline focus-visible:outline-2 focus-visible:outline-cyan-600">{label}</Link>)}
        </nav>
        <button type="button" aria-label="Toggle menu" aria-expanded={open} onClick={() => setOpen(!open)} className="rounded-lg border border-slate-200 px-3 py-2 text-sm md:hidden">Menu</button>
      </div>
      {open && <nav aria-label="Mobile navigation" className="flex flex-col gap-1 border-t border-slate-200 bg-white px-6 py-3 md:hidden">
        {links.map(({ label, href }) => <Link key={href} onClick={() => setOpen(false)} href={href} className="rounded-lg px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-100">{label}</Link>)}
      </nav>}
    </header>
  );
}
