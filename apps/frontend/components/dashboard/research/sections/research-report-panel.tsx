'use client';

import { ExternalLink, ShieldCheck } from 'lucide-react';

type Research = {
  input: { objective: string };
  stages: Array<{ id: string }>;
  output: {
    profiles: Array<{ name: string }>;
    gaps: Array<{
      topic: string;
      observedIn: string[];
      examples: string[];
    }>;
    experiments: Array<{
      hypothesis: string;
      measure: string;
    }>;
    limitation: string;
  };
};

export default function ResearchReportPanel({ active }: { active: Research }) {
  return (
    <section
      data-testid="creator-research-report"
      className="space-y-4 rounded-2xl border border-slate-200 bg-white p-5"
    >
      <div>
        <p className="text-xs font-bold text-teal-800">
          Completed read-only research
        </p>
        <h2 className="mt-1 font-serif text-2xl">Evidence-linked results</h2>
      </div>
      <p className="text-sm text-slate-600">
        Objective: {active.input.objective}
      </p>
      <p className="text-sm text-slate-600">
        {active.output.profiles.length} profiles · {active.stages.length}{' '}
        executed pipeline steps · {active.output.gaps.length} possible topics
      </p>
      <h3 className="text-sm font-bold">
        Potential topics not present in your headline
      </h3>
      {active.output.gaps.length === 0 ? (
        <p className="text-sm text-slate-500">
          No difference found in supplied excerpts.
        </p>
      ) : (
        <ul className="space-y-3">
          {active.output.gaps.map((gap) => (
            <li key={gap.topic} className="rounded-xl bg-slate-50 p-3 text-sm">
              <p className="font-bold capitalize">{gap.topic}</p>
              <p className="mt-1 text-xs text-slate-600">
                Observed in {gap.observedIn.join(', ')}
              </p>
              <div className="mt-2 flex flex-wrap gap-3">
                {gap.examples.map((url) => (
                  <a
                    key={url}
                    href={url}
                    rel="noopener noreferrer"
                    target="_blank"
                    className="inline-flex items-center gap-1 text-xs text-teal-800 underline"
                  >
                    Evidence post
                    <ExternalLink className="size-3" />
                  </a>
                ))}
              </div>
            </li>
          ))}
        </ul>
      )}
      <h3 className="text-sm font-bold">Experiments to evaluate</h3>
      <ol className="space-y-2">
        {active.output.experiments.map((experiment, index) => (
          <li
            key={index}
            className="rounded-xl border border-slate-200 p-3 text-sm"
          >
            <strong>
              {index + 1}. {experiment.hypothesis}
            </strong>
            <p className="mt-1 text-xs text-slate-600">{experiment.measure}</p>
          </li>
        ))}
      </ol>
      <p className="flex items-start gap-2 text-xs leading-6 text-slate-600">
        <ShieldCheck className="mt-1 size-4 shrink-0 text-teal-700" />
        {active.output.limitation}
      </p>
    </section>
  );
}
