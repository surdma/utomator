"use client";
import Link from "next/link";
import { Workflow } from "lucide-react";
export default function Logo() {
  return (
    <Link href="/" aria-label="Utomator home" className="inline-flex items-center gap-3 font-semibold tracking-tight" style={{color:"var(--text-primary)"}}>
      <span className="flex size-10 items-center justify-center rounded-xl border border-cyan-500/30 bg-cyan-500/10"><Workflow aria-hidden="true" className="size-5 text-cyan-600" /></span>
      <span>Utomator</span>
    </Link>
  );
}
