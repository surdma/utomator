"use client";

import { useEffect, useState } from "react";
import { ArrowRight, FileCode2, ShieldCheck } from "lucide-react";

type ProfileProgram = {
  id: string; title: string; objective: string; limitation: string;
  requirements: Array<{ id: string; text: string }>;
  coverage: Array<{ id: string; label: string; status: "requires-independent-evidence" }>;
  pipelines: Array<{ id: string; action: string; title: string; stepCount: number;
    source: "registered-workflow-plan"; requiresConnectedAccount: true }>;
};
/** Selects existing registered pipelines. All execution goes through /runs. */
export default function GrowthProfilePipelines({
  platform, selectedAction, busy, onSelectAction,
}: {
  platform: "linkedin" | "x"; selectedAction: string; busy: boolean;
  onSelectAction: (action: string) => void;
}) {
  const [program, setProgram] = useState<ProfileProgram | null>(null);
  const [error, setError] = useState("");
  useEffect(() => {
    if (platform !== "linkedin") return;
    const controller = new AbortController();
    void fetch("/api/growth/workflows/profile", { cache: "no-store", signal: controller.signal })
      .then(async response => {
        if (!response.ok) throw Error("Profile program could not be loaded");
        return response.json() as Promise<ProfileProgram>;
      })
      .then(setProgram)
      .catch((reason: unknown) => {
        if (!controller.signal.aborted)
          setError(reason instanceof Error ? reason.message : "Profile program unavailable");
      });
    return () => controller.abort();
  }, [platform]);
  if (platform !== "linkedin") return null;
  return (
    <section aria-labelledby="profile-program-title" data-testid="growth-profile-program"
      className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm sm:p-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="text-[11px] font-semibold uppercase tracking-widest text-teal-800">Growth / LinkedIn</p>
          <h2 id="profile-program-title" className="mt-2 text-lg font-semibold text-slate-950">
            {program?.title ?? "Profile auditing & section optimization"}
          </h2>
          <p className="mt-1 max-w-3xl text-xs leading-5 text-slate-600">
            {program?.objective ?? "Loading the YAML-backed Growth profile program"}
          </p>
        </div>
        <a className="inline-flex min-h-10 items-center gap-2 text-xs font-semibold text-teal-800 underline underline-offset-4"
          href="/api/growth/workflows/profile/yaml" target="_blank" rel="noopener noreferrer">
          <FileCode2 className="size-4" />View YAML
        </a>
      </div>
      {error && <p role="alert" className="mt-4 text-xs text-rose-700">{error}</p>}
      {program && <>
        <div className="mt-4 rounded-xl border border-amber-200 bg-amber-50 p-3 text-xs leading-5 text-amber-950">
          <ShieldCheck className="mr-2 inline size-4" />{program.limitation}
        </div>
        <div className="mt-4 grid gap-2 sm:grid-cols-2 xl:grid-cols-3">
          {program.pipelines.map(item => <button key={item.id} type="button"
            disabled={busy} onClick={() => onSelectAction(item.action)}
            className={"flex min-h-24 flex-col rounded-xl border p-3 text-left transition focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-teal-600 disabled:opacity-50 " +
              (selectedAction === item.action ? "border-teal-600 bg-teal-50" : "border-slate-200 hover:border-teal-400 hover:bg-slate-50")}
            aria-pressed={selectedAction === item.action}>
            <span className="text-sm font-semibold text-slate-900">{item.title}</span>
            <span className="mt-auto flex items-center justify-between gap-2 pt-3 text-xs text-slate-600">
              <span>{item.stepCount} registered steps</span>
              <span className="inline-flex items-center gap-1 font-semibold text-teal-800">
                Open pipeline <ArrowRight className="size-3.5" />
              </span>
            </span>
          </button>)}
        </div>
        <div className="mt-4 grid gap-3 lg:grid-cols-2">
          <details className="rounded-xl border border-slate-200 p-3">
            <summary className="cursor-pointer text-sm font-semibold text-slate-900">9 capability requirements</summary>
            <ol className="mt-3 list-decimal space-y-2 pl-5 text-xs leading-5 text-slate-600">
              {program.requirements.map(item => <li key={item.id}>{item.text}</li>)}
            </ol>
          </details>
          <details className="rounded-xl border border-slate-200 p-3">
            <summary className="cursor-pointer text-sm font-semibold text-slate-900">
              20 sections awaiting independent evidence
            </summary>
            <p className="mt-2 text-xs leading-5 text-slate-500">
              Coverage targets, not completed audits or available field extractors.
            </p>
            <ul className="mt-3 grid grid-cols-1 gap-2 sm:grid-cols-2">
              {program.coverage.map(item =>
                <li key={item.id} className="rounded-lg bg-slate-50 px-3 py-2 text-xs text-slate-700">
                  {item.label}
                </li>)}
            </ul>
          </details>
        </div>
      </>}
    </section>
  );
}
