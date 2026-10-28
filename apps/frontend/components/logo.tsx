import Link from "next/link";
import { Workflow } from "lucide-react";
export default function Logo() {
  return <Link href="/" aria-label="Utomator home" className="inline-flex items-center gap-3 font-bold text-slate-900">
    <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-slate-900 text-white"><Workflow className="h-6 w-6" /></span>
    <span className="text-lg">Utomator</span>
  </Link>;
}
