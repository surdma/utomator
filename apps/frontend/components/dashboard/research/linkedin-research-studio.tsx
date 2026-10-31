'use client';

import { useEffect, useState, type FormEvent } from 'react';
import {
  ArrowRight,
  ExternalLink,
  Plus,
  ShieldCheck,
  Trash2,
} from 'lucide-react';

type Post = { url: string; text: string };
type Creator = {
  name: string;
  profileUrl: string;
  headline: string;
  posts: Post[];
};
type Research = {
  id: string;
  createdAt: string;
  input: { niche: string; objective: string };
  stages: Array<{
    id: string;
    operation: string;
    inputSchema: string;
    outputSchema: string;
    outputDigest: string;
  }>;
  output: {
    profiles: Array<{
      name: string;
      topics: Array<{ word: string; mentions: number; sources: string[] }>;
    }>;
    gaps: Array<{ topic: string; observedIn: string[]; examples: string[] }>;
    experiments: Array<{
      hypothesis: string;
      evidenceUrls: string[];
      measure: string;
    }>;
    limitation: string;
  };
};
const blank = (): Creator => ({
  name: '',
  profileUrl: '',
  headline: '',
  posts: [{ url: '', text: '' }],
});
const field =
  'min-h-11 w-full rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm text-slate-950 outline-teal-700';
export default function LinkedInResearchStudio() {
  const [niche, setNiche] = useState(''),
    [objective, setObjective] = useState('');
  const [ownerHeadline, setOwnerHeadline] = useState('');
  const [creators, setCreators] = useState<Creator[]>([blank()]);
  const [history, setHistory] = useState<Research[]>([]);
  const [active, setActive] = useState<Research | null>(null);
  const [error, setError] = useState(''),
    [saving, setSaving] = useState(false);
  useEffect(() => {
    let mounted = true;
    void fetch('/api/linkedin/research', { cache: 'no-store' })
      .then(async (response) => {
        if (!response.ok) throw Error('Research history unavailable');
        const rows = (await response.json()) as Research[];
        if (mounted) {
          setHistory(rows);
          setActive(rows[0] ?? null);
        }
      })
      .catch((e) => {
        if (mounted)
          setError(e instanceof Error ? e.message : 'Unable to load research');
      });
    return () => {
      mounted = false;
    };
  }, []);
  const updateCreator = (index: number, patch: Partial<Creator>) =>
    setCreators((rows) =>
      rows.map((creator, i) =>
        index === i ? { ...creator, ...patch } : creator
      )
    );
  const updatePost = (
    index: number,
    p: number,
    key: keyof Post,
    value: string
  ) =>
    setCreators((rows) =>
      rows.map((creator, i) =>
        index !== i
          ? creator
          : {
              ...creator,
              posts: creator.posts.map((post, j) =>
                p === j ? { ...post, [key]: value } : post
              ),
            }
      )
    );
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError('');
    setSaving(true);
    try {
      const response = await fetch('/api/linkedin/research', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ niche, objective, ownerHeadline, creators }),
      });
      const result = (await response.json()) as Research & { error?: string };
      if (!response.ok) throw Error(result.error || 'Research pipeline failed');
      setActive(result);
      setHistory((previous) => [result, ...previous]);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Research failed');
    } finally {
      setSaving(false);
    }
  }
  return (
    <div
      data-testid="linkedin-creator-research"
      className="mx-auto max-w-5xl space-y-5 pb-12"
    >
      <header className="rounded-3xl bg-[#111e2b] px-6 py-7 text-white">
        <p className="text-xs font-bold tracking-widest text-teal-300 uppercase">
          LinkedIn / Research pipeline
        </p>
        <h1 className="mt-3 font-serif text-3xl">
          Creator and niche intelligence
        </h1>
        <p className="mt-3 max-w-2xl text-sm leading-6 text-slate-300">
          Compare documented examples you supply. Utomator checks source scope,
          extracts recurring topics, compares positioning, and proposes small
          experiments. It does not scrape profiles or invent growth metrics.
        </p>
      </header>
      <form
        aria-label="Creator research inputs"
        onSubmit={(e) => void submit(e)}
        className="space-y-4"
      >
        <section className="grid gap-3 rounded-2xl border border-slate-200 bg-white p-5 sm:grid-cols-2">
          <label className="space-y-1 text-xs font-semibold">
            Your niche
            <input
              required
              minLength={3}
              maxLength={100}
              className={field}
              value={niche}
              onChange={(e) => setNiche(e.target.value)}
              placeholder="Software education"
            />
          </label>
          <label className="space-y-1 text-xs font-semibold">
            Research objective
            <input
              required
              minLength={8}
              maxLength={400}
              className={field}
              value={objective}
              onChange={(e) => setObjective(e.target.value)}
              placeholder="Build a more relevant audience"
            />
          </label>
          <label className="space-y-1 text-xs font-semibold sm:col-span-2">
            Your current LinkedIn headline
            <input
              required
              minLength={5}
              maxLength={300}
              className={field}
              value={ownerHeadline}
              onChange={(e) => setOwnerHeadline(e.target.value)}
            />
          </label>
        </section>
        {creators.map((creator, i) => (
          <section
            key={i}
            className="space-y-3 rounded-2xl border border-slate-200 bg-white p-5"
          >
            <div className="flex items-center justify-between gap-2">
              <h2 className="text-sm font-bold">
                Creator {i + 1}: observed source
              </h2>
              {creators.length > 1 && (
                <button
                  type="button"
                  aria-label={'Remove creator ' + (i + 1)}
                  onClick={() =>
                    setCreators((rows) =>
                      rows.filter((_, index) => index !== i)
                    )
                  }
                  className="inline-flex items-center gap-1 text-xs text-rose-700"
                >
                  <Trash2 className="size-4" />
                  Remove
                </button>
              )}
            </div>
            <div className="grid gap-3 sm:grid-cols-2">
              <label className="space-y-1 text-xs font-semibold">
                Creator name
                <input
                  required
                  minLength={2}
                  maxLength={120}
                  className={field}
                  value={creator.name}
                  onChange={(e) => updateCreator(i, { name: e.target.value })}
                />
              </label>
              <label className="space-y-1 text-xs font-semibold">
                LinkedIn profile URL
                <input
                  required
                  type="url"
                  className={field}
                  value={creator.profileUrl}
                  onChange={(e) =>
                    updateCreator(i, { profileUrl: e.target.value })
                  }
                  placeholder="https://www.linkedin.com/in/..."
                />
              </label>
              <label className="space-y-1 text-xs font-semibold sm:col-span-2">
                Observed headline
                <input
                  required
                  minLength={5}
                  maxLength={300}
                  className={field}
                  value={creator.headline}
                  onChange={(e) =>
                    updateCreator(i, { headline: e.target.value })
                  }
                />
              </label>
            </div>
            {creator.posts.map((post, j) => (
              <div key={j} className="space-y-2 rounded-xl bg-slate-50 p-3">
                <div className="flex justify-between gap-3">
                  <p className="text-xs font-bold">Post example {j + 1}</p>
                  {creator.posts.length > 1 && (
                    <button
                      type="button"
                      aria-label={'Remove post ' + (j + 1)}
                      onClick={() =>
                        updateCreator(i, {
                          posts: creator.posts.filter((_, k) => k !== j),
                        })
                      }
                      className="text-xs text-rose-700"
                    >
                      Remove
                    </button>
                  )}
                </div>
                <label className="block space-y-1 text-xs font-semibold">
                  Post permalink
                  <input
                    required
                    type="url"
                    className={field}
                    value={post.url}
                    onChange={(e) => updatePost(i, j, 'url', e.target.value)}
                    placeholder="https://www.linkedin.com/posts/..."
                  />
                </label>
                <label className="block space-y-1 text-xs font-semibold">
                  Exact post excerpt
                  <textarea
                    required
                    minLength={20}
                    maxLength={3000}
                    rows={3}
                    className={field + ' resize-y'}
                    value={post.text}
                    onChange={(e) => updatePost(i, j, 'text', e.target.value)}
                  />
                </label>
              </div>
            ))}
            {creator.posts.length < 5 && (
              <button
                type="button"
                onClick={() =>
                  updateCreator(i, {
                    posts: [...creator.posts, { url: '', text: '' }],
                  })
                }
                className="inline-flex min-h-10 items-center gap-1 text-xs font-bold text-teal-800"
              >
                <Plus className="size-4" />
                Add evidenced post
              </button>
            )}
          </section>
        ))}
        <div className="flex flex-wrap items-center justify-between gap-3">
          <button
            type="button"
            disabled={creators.length >= 5}
            onClick={() => setCreators((current) => [...current, blank()])}
            className="inline-flex min-h-11 items-center gap-2 rounded-xl border border-slate-300 bg-white px-4 text-xs font-bold disabled:opacity-40"
          >
            <Plus className="size-4" />
            Add creator
          </button>
          <button
            type="submit"
            disabled={saving}
            className="inline-flex min-h-11 items-center gap-2 rounded-xl bg-teal-700 px-5 text-xs font-bold text-white disabled:opacity-50"
          >
            {saving ? 'Analyzing…' : 'Run evidenced comparison'}
            <ArrowRight className="size-4" />
          </button>
        </div>
      </form>
      {error && (
        <p
          role="alert"
          className="rounded-xl border border-rose-200 bg-rose-50 p-4 text-sm text-rose-800"
        >
          {error}
        </p>
      )}
      {active && (
        <section
          data-testid="creator-research-report"
          className="space-y-4 rounded-2xl border border-slate-200 bg-white p-5"
        >
          <div>
            <p className="text-xs font-bold text-teal-800">
              Completed read-only research
            </p>
            <h2 className="mt-1 font-serif text-2xl">
              Evidence-linked results
            </h2>
          </div>
          <p className="text-sm text-slate-600">
            Objective: {active.input.objective}
          </p>
          <p className="text-sm text-slate-600">
            {active.output.profiles.length} profiles · {active.stages.length}{' '}
            executed pipeline steps · {active.output.gaps.length} possible
            topics
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
                <li
                  key={gap.topic}
                  className="rounded-xl bg-slate-50 p-3 text-sm"
                >
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
                <p className="mt-1 text-xs text-slate-600">
                  {experiment.measure}
                </p>
              </li>
            ))}
          </ol>
          <p className="flex items-start gap-2 text-xs leading-6 text-slate-600">
            <ShieldCheck className="mt-1 size-4 shrink-0 text-teal-700" />
            {active.output.limitation}
          </p>
        </section>
      )}
      {history.length > 0 && (
        <section className="rounded-2xl border border-slate-200 bg-white p-5">
          <h2 className="text-sm font-bold">Saved research reports</h2>
          <div className="mt-3 space-y-2">
            {history.map((run) => (
              <button
                type="button"
                key={run.id}
                onClick={() => setActive(run)}
                className="flex min-h-11 w-full justify-between gap-3 rounded-xl border border-slate-200 p-3 text-left text-xs hover:bg-slate-50"
              >
                <span>
                  {run.input.niche} · {new Date(run.createdAt).toLocaleString()}
                </span>
                <ArrowRight className="size-4" />
              </button>
            ))}
          </div>
        </section>
      )}
    </div>
  );
}
