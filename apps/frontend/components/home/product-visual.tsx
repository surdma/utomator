"use client";
import { motion, useReducedMotion } from "framer-motion";
import { Workflow, ShieldCheck, Layers3, PlayCircle } from "lucide-react";

export default function ProductVisual() {
  const reducedMotion = useReducedMotion();
  return (
    <motion.div
      initial={reducedMotion ? false : { opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.55 }}
      className="relative mx-auto w-full max-w-[22rem] rounded-[2rem] border border-slate-200 bg-white p-5 shadow-[0_24px_65px_rgba(15,23,42,0.09)]"
      aria-label="Utomator workflow preview"
    >
      <div className="absolute -inset-3 -z-10 rounded-[2.5rem] bg-gradient-to-tr from-cyan-100/70 via-white to-violet-100/70 blur-xl" />
      <div className="mb-5 flex items-center justify-between">
        <div className="flex items-center gap-2 font-semibold text-slate-900"><Workflow className="h-5 w-5 text-cyan-600" /> Utomator</div>
        <span className="rounded-full bg-emerald-50 px-3 py-1 text-xs text-emerald-700">Local first</span>
      </div>
      <div className="space-y-3">
        <div className="flex items-center gap-3 rounded-2xl border border-slate-100 bg-slate-50 p-3">
          <Layers3 className="h-5 w-5 text-cyan-600" />
          <div><p className="text-sm font-semibold text-slate-900">Plan a workflow</p><p className="text-xs text-slate-500">Choose the next step</p></div>
        </div>
        <div className="ml-6 h-5 w-px bg-slate-200" />
        <div className="flex items-center gap-3 rounded-2xl border border-slate-100 bg-slate-50 p-3">
          <ShieldCheck className="h-5 w-5 text-violet-600" />
          <div><p className="text-sm font-semibold text-slate-900">Review before action</p><p className="text-xs text-slate-500">Explicit approval checkpoints</p></div>
        </div>
        <div className="ml-6 h-5 w-px bg-slate-200" />
        <div className="flex items-center gap-3 rounded-2xl border border-slate-100 bg-slate-50 p-3">
          <PlayCircle className="h-5 w-5 text-emerald-600" />
          <div><p className="text-sm font-semibold text-slate-900">Run and inspect</p><p className="text-xs text-slate-500">Logs, evidence and history</p></div>
        </div>
      </div>
    </motion.div>
  );
}
