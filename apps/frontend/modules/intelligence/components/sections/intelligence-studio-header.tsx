'use client';

export default function IntelligenceStudioHeader({
  entriesCount,
}: {
  entriesCount: number;
}) {
  return (
    <header className="flex flex-wrap items-end justify-between gap-5 border-b border-slate-200 pb-6">
      <div>
        <p className="text-xs font-semibold tracking-wider text-teal-700 uppercase">
          Utomator / Context
        </p>
        <h1 className="mt-3 font-serif text-3xl text-slate-950">
          Intelligence
        </h1>
        <p className="mt-3 max-w-xl text-sm leading-7 text-slate-600">
          One place to review what you told Mator and what Playwright actually
          observed. The two sources remain separate.
        </p>
      </div>
      <span className="rounded-full bg-white px-3 py-2 text-xs text-slate-500">
        {entriesCount} recorded events
      </span>
    </header>
  );
}
