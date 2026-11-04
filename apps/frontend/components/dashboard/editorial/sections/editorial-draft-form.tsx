'use client';

import { CheckCircle2, FileText, Plus, RotateCcw, Trash2 } from 'lucide-react';
import type { Dispatch, FormEvent, SetStateAction } from 'react';

type Account = { id: string; platform: string; label: string; handle: string };
type Research = {
  id: string;
  input: { niche: string };
};
type Content = {
  goal: string;
  pillar: string;
  body: string;
  sourceUrls: string[];
  researchRunId: string | null;
};
type Draft = {
  id: string;
  accountId: string;
  version: number;
  status:
    | 'draft'
    | 'approved'
    | 'archived'
    | 'deleted'
    | 'publishing'
    | 'published'
    | 'publish-failed'
    | 'publication-uncertain';
  publication?: { status: string; postUrn?: string };
  content: Content;
  history: Array<{ version: number; event: string; timestamp: string }>;
  updatedAt: string;
};

const input =
  'w-full rounded-xl border border-slate-300 bg-white px-3 py-2.5 text-sm text-slate-900 outline-offset-2 focus-visible:outline-teal-700';
const button =
  'inline-flex min-h-11 items-center justify-center gap-2 rounded-xl border border-slate-300 px-4 text-xs font-bold hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-40';

export default function EditorialDraftForm({
  save,
  selected,
  choose,
  accounts,
  accountId,
  setAccountId,
  research,
  content,
  setContent,
  sourcesText,
  setSourcesText,
  selectResearchEvidence,
  busy,
  unsaved,
  oauth,
  publish,
  transition,
}: {
  save: (e: FormEvent<HTMLFormElement>) => void;
  selected: Draft | null;
  choose: (draft: Draft | null) => void;
  accounts: Account[];
  accountId: string;
  setAccountId: (id: string) => void;
  research: Research[];
  content: Content;
  setContent: Dispatch<SetStateAction<Content>>;
  sourcesText: string;
  setSourcesText: (value: string) => void;
  selectResearchEvidence: (id: string) => void;
  busy: boolean;
  unsaved: boolean;
  oauth: { connected: boolean; configured: boolean } | null;
  publish: () => void;
  transition: (
    action: 'approve' | 'reopen' | 'archive' | 'delete' | 'restore',
  ) => void;
}) {
  return (
    <form
      aria-label="LinkedIn editorial draft"
      onSubmit={(e) => void save(e)}
      className="space-y-4 rounded-2xl border border-slate-200 bg-white p-5"
    >
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 className="text-sm font-bold">
          {selected
            ? `Edit draft v${selected.version}`
            : 'New evidence-backed post'}
        </h2>
        <button type="button" className={button} onClick={() => choose(null)}>
          <Plus className="size-4" />
          New draft
        </button>
      </div>
      <div className="grid gap-4 sm:grid-cols-2">
        <label className="space-y-1 text-xs font-bold">
          Saved LinkedIn account
          <select
            className={input}
            required
            disabled={Boolean(selected)}
            value={accountId}
            onChange={(e) => setAccountId(e.target.value)}
          >
            <option value="">Select account</option>
            {accounts.map((account) => (
              <option key={account.id} value={account.id}>
                {account.label} (@{account.handle})
              </option>
            ))}
          </select>
        </label>
        <label className="space-y-1 text-xs font-bold">
          Evidence from Creator Research (optional)
          <select
            className={input}
            disabled={selected?.status === 'archived'}
            value={content.researchRunId ?? ''}
            onChange={(e) => selectResearchEvidence(e.target.value)}
          >
            <option value="">No linked research</option>
            {research.map((item) => (
              <option key={item.id} value={item.id}>
                {item.input.niche} · {item.id.slice(0, 8)}
              </option>
            ))}
          </select>
        </label>
        <label className="space-y-1 text-xs font-bold">
          Post goal
          <input
            className={input}
            minLength={8}
            maxLength={220}
            required
            value={content.goal}
            onChange={(e) =>
              setContent((old) => ({ ...old, goal: e.target.value }))
            }
          />
        </label>
        <label className="space-y-1 text-xs font-bold">
          Content pillar
          <input
            className={input}
            minLength={3}
            maxLength={100}
            required
            value={content.pillar}
            onChange={(e) =>
              setContent((old) => ({ ...old, pillar: e.target.value }))
            }
          />
        </label>
      </div>
      <label className="block space-y-1 text-xs font-bold">
        Post draft
        <textarea
          rows={8}
          className={`${input} resize-y leading-6`}
          minLength={20}
          maxLength={3000}
          required
          value={content.body}
          onChange={(e) =>
            setContent((old) => ({ ...old, body: e.target.value }))
          }
          placeholder="Write an original, factual LinkedIn post. Confirm your claims and dates."
        />
        <span className="block text-right text-[11px] font-normal text-slate-500">
          {content.body.length}/3000
        </span>
      </label>
      <label className="block space-y-1 text-xs font-bold">
        Evidence links (one clean HTTPS URL per line; up to eight)
        <textarea
          rows={3}
          className={`${input} resize-y`}
          value={sourcesText}
          onChange={(e) => setSourcesText(e.target.value)}
        />
      </label>
      <div className="flex flex-wrap items-center gap-2">
        <button
          type="submit"
          disabled={
            busy ||
            !accountId ||
            Boolean(
              selected &&
                !['draft', 'approved', 'publish-failed'].includes(
                  selected.status,
                ),
            )
          }
          className={`${button} border-teal-700 bg-teal-700 text-white hover:bg-teal-800`}
        >
          <FileText className="size-4" />
          {busy
            ? 'Saving…'
            : selected
              ? 'Save revision'
              : 'Create private draft'}
        </button>
        {selected?.status === 'approved' && (
          <button
            type="button"
            disabled={busy || unsaved || !oauth?.connected}
            className={
              button +
              ' border-teal-700 bg-teal-700 text-white hover:bg-teal-800'
            }
            onClick={() => void publish()}
          >
            Publish approved post to LinkedIn
          </button>
        )}
        {selected?.status === 'draft' && (
          <button
            type="button"
            disabled={busy || unsaved}
            title={
              unsaved ? 'Save the revised draft before approving' : undefined
            }
            className={button}
            onClick={() => void transition('approve')}
          >
            <CheckCircle2 className="size-4" />
            Approve reviewed draft
          </button>
        )}
        {selected?.status === 'draft' && unsaved && (
          <span role="status" className="text-xs text-amber-700">
            Save your edits before approving this revision.
          </span>
        )}
        {selected?.status === 'approved' && (
          <button
            type="button"
            disabled={busy || unsaved}
            className={button}
            onClick={() => void transition('reopen')}
          >
            <RotateCcw className="size-4" />
            Reopen for edits
          </button>
        )}
        {selected?.status === 'archived' && (
          <button
            type="button"
            disabled={busy}
            className={button}
            onClick={() => void transition('restore')}
          >
            Restore draft
          </button>
        )}
        {selected &&
          ['draft', 'approved', 'publish-failed'].includes(selected.status) && (
            <button
              type="button"
              disabled={busy}
              className={button}
              onClick={() => void transition('archive')}
            >
              Archive
            </button>
          )}
        {selected &&
          ['draft', 'approved', 'archived', 'publish-failed'].includes(
            selected.status,
          ) && (
            <button
              type="button"
              disabled={busy}
              className={`${button} border-rose-300 text-rose-700`}
              onClick={() => void transition('delete')}
            >
              <Trash2 className="size-4" />
              Remove
            </button>
          )}
      </div>
      {selected && (
        <div className="rounded-xl bg-slate-50 p-3 text-xs text-slate-700">
          <p>
            Status: <strong className="capitalize">{selected.status}</strong> ·
            Revision {selected.version} · {selected.history.length} persisted
            events
          </p>
          {selected.publication?.postUrn && (
            <a
              className="mt-2 block text-teal-800 underline"
              target="_blank"
              rel="noopener noreferrer"
              href={
                'https://www.linkedin.com/feed/update/' +
                selected.publication.postUrn +
                '/'
              }
            >
              View published LinkedIn post
            </a>
          )}
          {selected.status === 'publication-uncertain' && (
            <p className="mt-2 text-rose-700">
              Publication outcome unknown. Check LinkedIn before taking any
              further action; automatic resubmission is blocked.
            </p>
          )}
        </div>
      )}
    </form>
  );
}
