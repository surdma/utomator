import type { Program, Run } from './growth-profile-types';

export default function GrowthCoverageList({
  run,
  program,
}: {
  run: Run;
  program: Program | null;
}) {
  const labels = new Map(
    program?.coverage.map((section) => [section.id, section.label]) ?? []
  );
  return (
    <details className="rounded-xl border border-slate-200 p-4">
      <summary className="cursor-pointer text-sm font-semibold">
        All {run.counts.total} independent coverage records
      </summary>
      <ul className="mt-3 grid gap-2 sm:grid-cols-2">
        {run.coverage.map((item) => (
          <li
            key={item.id}
            className="flex justify-between gap-2 rounded-lg bg-slate-50 p-3 text-xs text-slate-700"
          >
            <span>{labels.get(item.id) ?? item.id}</span>
            <span className="shrink-0 font-semibold">
              {item.status === 'missing' ? 'Missing' : 'Owner reported'}
            </span>
          </li>
        ))}
      </ul>
    </details>
  );
}
