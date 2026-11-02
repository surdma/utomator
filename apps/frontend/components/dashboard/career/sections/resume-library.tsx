'use client';

import { ArrowRight, FileText, Plus, Search } from 'lucide-react';
import type { CareerState, Resume } from '../types';
import { classInput, classButton } from '../styles';

export default function ResumeLibrary({
  state,
  versions,
  search,
  setSearch,
  saving,
  create,
  go,
}: {
  state: CareerState;
  versions: Resume[];
  search: string;
  setSearch: (value: string) => void;
  saving: boolean;
  create: () => void;
  go: (path: string) => void;
}) {
  return (
    <section className="flex flex-col gap-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h2 className="font-serif text-2xl">Saved versions</h2>
          <p className="mt-2 text-sm text-slate-500">
            {state.resumes.length} saved résumé(s), each independent.
          </p>
        </div>
        <button
          className={classButton + ' bg-teal-700 text-white hover:bg-teal-800'}
          disabled={
            saving ||
            !state.profile.name.trim() ||
            !state.profile.headline.trim()
          }
          onClick={() => void create()}
        >
          <Plus className="size-4" />
          New résumé
        </button>
      </div>
      <label className="block">
        <span className="sr-only">Search résumés</span>
        <span className="relative block">
          <Search className="absolute top-3.5 left-4 size-4 text-slate-400" />
          <input
            className={classInput + ' pl-11'}
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search by role, company or version"
          />
        </span>
      </label>
      <div className="grid gap-5 md:grid-cols-2">
        {versions.map((r) => (
          <button
            type="button"
            key={r.id}
            onClick={() => go('/dashboard/resumes/' + r.id)}
            className="group rounded-3xl border border-slate-200 bg-white p-7 text-left shadow-sm transition hover:border-teal-300 hover:shadow-lg"
          >
            <div className="flex items-start justify-between gap-4">
              <FileText className="size-6 text-teal-700" />
              <ArrowRight className="size-4 text-slate-400 group-hover:text-teal-700" />
            </div>
            <h3 className="mt-6 font-serif text-xl text-slate-900">
              {r.label}
            </h3>
            <p className="mt-2 text-sm text-slate-600">
              {r.targetRole || 'General résumé'}
              {r.targetCompany ? ' · ' + r.targetCompany : ''}
            </p>
            <div className="mt-6 flex flex-wrap gap-2 text-xs text-slate-500">
              <span className="rounded-full bg-slate-100 px-3 py-1">
                {r.template} template
              </span>
              <span>Updated {new Date(r.updatedAt).toLocaleDateString()}</span>
            </div>
          </button>
        ))}
      </div>
      {versions.length === 0 && (
        <p className="rounded-2xl bg-white p-10 text-center text-sm text-slate-600">
          {state.resumes.length === 0
            ? 'No résumés yet. Add your name and professional headline in Career source, then create a résumé.'
            : 'No matching résumés. Try another search or create a new version.'}
        </p>
      )}
    </section>
  );
}
