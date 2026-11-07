'use client';

type Content = {
  goal: string;
  pillar: string;
  body: string;
  sourceUrls: string[];
  researchRunId: string | null;
};

export default function EditorialDraftList<
  T extends { id: string; version: number; status: string; content: Content },
>({ drafts, choose }: { drafts: T[]; choose: (draft: T) => void }) {
  return (
    <section className="rounded-2xl border border-slate-200 bg-white p-5">
      <div className="flex items-center justify-between gap-3">
        <h2 className="text-sm font-bold">Saved drafts</h2>
        <span className="text-xs text-slate-500">
          {drafts.length} private items
        </span>
      </div>
      {drafts.length === 0 ? (
        <p className="mt-4 text-sm text-slate-600">
          No saved drafts. Create a post above or use research evidence to start
          one.
        </p>
      ) : (
        <div className="mt-4 grid gap-2">
          {drafts.map((item) => (
            <button
              key={item.id}
              type="button"
              onClick={() => choose(item)}
              className="flex min-h-14 flex-wrap items-center justify-between gap-2 rounded-xl border border-slate-200 p-3 text-left hover:border-teal-500"
            >
              <span className="min-w-0">
                <span className="block text-xs font-bold">
                  {item.content.pillar} · {item.content.goal}
                </span>
                <span className="mt-1 block truncate text-xs text-slate-600">
                  {item.content.body.slice(0, 160)}
                </span>
              </span>
              <span className="text-xs text-teal-800 capitalize">
                {item.status} · v{item.version}
              </span>
            </button>
          ))}
        </div>
      )}
    </section>
  );
}
