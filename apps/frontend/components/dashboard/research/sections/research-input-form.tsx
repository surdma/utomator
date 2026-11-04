'use client';

import { ArrowRight, Plus, Trash2 } from 'lucide-react';
import type { Dispatch, FormEvent, SetStateAction } from 'react';

type Post = { url: string; text: string };
type Creator = {
  name: string;
  profileUrl: string;
  headline: string;
  posts: Post[];
};

const field =
  'min-h-11 w-full rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm text-slate-950 outline-teal-700';

export default function ResearchInputForm({
  submit,
  niche,
  setNiche,
  objective,
  setObjective,
  ownerHeadline,
  setOwnerHeadline,
  creators,
  setCreators,
  updateCreator,
  updatePost,
  blank,
  saving,
}: {
  submit: (event: FormEvent<HTMLFormElement>) => void;
  niche: string;
  setNiche: (value: string) => void;
  objective: string;
  setObjective: (value: string) => void;
  ownerHeadline: string;
  setOwnerHeadline: (value: string) => void;
  creators: Creator[];
  setCreators: Dispatch<SetStateAction<Creator[]>>;
  updateCreator: (index: number, patch: Partial<Creator>) => void;
  updatePost: (
    index: number,
    p: number,
    key: keyof Post,
    value: string,
  ) => void;
  blank: () => Creator;
  saving: boolean;
}) {
  return (
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
                aria-label={`Remove creator ${i + 1}`}
                onClick={() =>
                  setCreators((rows) => rows.filter((_, index) => index !== i))
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
                onChange={(e) => updateCreator(i, { headline: e.target.value })}
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
                    aria-label={`Remove post ${j + 1}`}
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
                  className={`${field} resize-y`}
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
  );
}
