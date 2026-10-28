"use client";
import {usePathname} from "next/navigation";
import Link from "next/link";
export default function Footer(){
  if(usePathname()!=="/")return null;
  return <footer className="border-t" style={{borderColor:"var(--border)"}}>
    <div className="mx-auto flex max-w-7xl flex-col justify-between gap-4 px-6 py-6 text-sm sm:flex-row md:px-8" style={{color:"var(--text-secondary)"}}>
      <div><strong style={{color:"var(--text-primary)"}}>Utomator</strong><span className="ml-3">Your browser workflows, under your control.</span></div>
      <div className="flex items-center gap-5"><Link href="/dashboard/pipeline">Pipeline</Link><span>© {new Date().getFullYear()} Utomator</span></div>
    </div>
  </footer>;
}
