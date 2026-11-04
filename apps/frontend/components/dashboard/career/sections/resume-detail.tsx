'use client';

import {
  Copy,
  LayoutTemplate,
  Pencil,
  Plus,
  Printer,
  Save,
  ShieldCheck,
  Trash2,
} from 'lucide-react';
import ResumePaper from '../resume-paper';
import { classButton } from '../styles';
import type { CareerDocument, CareerState, Resume, SectionKey } from '../types';

export default function ResumeDetail({
  sourceView,
  draft,
  dirty,
  saving,
  tab,
  setTab,
  sections,
  currentTemplate,
  state,
  detailId,
  save,
  setSection,
  setShowAdd,
  setShowTemplate,
  create,
  remove,
}: {
  sourceView: boolean;
  draft: CareerDocument;
  dirty: boolean;
  saving: boolean;
  tab: 'sections' | 'preview';
  setTab: (tab: 'sections' | 'preview') => void;
  sections: { key: SectionKey; title: string; detail: string }[];
  currentTemplate: Resume['template'];
  state: CareerState;
  detailId: string | null;
  save: () => Promise<boolean>;
  setSection: (key: SectionKey | null) => void;
  setShowAdd: (open: boolean) => void;
  setShowTemplate: (open: boolean) => void;
  create: (fromId?: string) => void;
  remove: () => void;
}) {
  return (
    <section className="flex flex-col gap-6">
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-slate-200 bg-white p-5">
        <div>
          <h2 className="font-serif text-xl text-slate-900">
            {sourceView ? 'Master career source' : (draft as Resume).label}
          </h2>
          <p className="mt-2 text-sm text-slate-500">
            {dirty ? 'Unsaved changes' : 'All changes saved'} ·{' '}
            {sourceView
              ? 'Used when creating new résumés'
              : (draft as Resume).targetRole || 'General résumé'}
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <button
            className={`${classButton} bg-teal-700 text-white hover:bg-teal-800`}
            disabled={saving || !dirty}
            onClick={() => void save()}
          >
            <Save className="size-4" />
            {saving ? 'Saving…' : 'Save'}
          </button>
          {!sourceView && (
            <button
              className={classButton}
              onClick={() => setTab(tab === 'preview' ? 'sections' : 'preview')}
            >
              {tab === 'preview' ? 'Edit sections' : 'Preview document'}
            </button>
          )}
        </div>
      </div>
      {!sourceView && (
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl bg-teal-50 p-5">
          <div>
            <p className="text-xs font-bold tracking-wide text-teal-800 uppercase">
              Application target
            </p>
            <p className="mt-1 text-sm text-slate-800">
              {(draft as Resume).targetRole || 'Not specified'}
              {(draft as Resume).targetCompany
                ? ` at ${(draft as Resume).targetCompany}`
                : ''}
            </p>
          </div>
          <button className={classButton} onClick={() => setSection('target')}>
            Edit target
          </button>
        </div>
      )}
      {tab === 'sections' && (
        <>
          <div className="grid gap-4 md:grid-cols-2">
            {sections.map((s) => (
              <article
                key={s.key}
                className="rounded-2xl border border-slate-200 bg-white p-6"
              >
                <h3 className="font-serif text-xl text-slate-900">{s.title}</h3>
                <p className="mt-3 min-h-12 text-sm leading-6 text-slate-600">
                  {s.detail}
                </p>
                <button
                  type="button"
                  onClick={() => setSection(s.key)}
                  className={`${classButton} mt-4`}
                >
                  <Pencil className="size-4" />
                  Edit section
                </button>
              </article>
            ))}
          </div>
          <div className="flex flex-wrap gap-3">
            {draft.customSections.length < 12 && (
              <button
                className={`${classButton} border-dashed border-teal-500`}
                onClick={() => setShowAdd(true)}
              >
                <Plus className="size-4" />
                Add custom section
              </button>
            )}
            {!sourceView && (
              <button
                className={classButton}
                onClick={() => setShowTemplate(true)}
              >
                <LayoutTemplate className="size-4" />
                Choose template · {currentTemplate}
              </button>
            )}
          </div>
          {!sourceView && (
            <div className="flex flex-wrap gap-2">
              <button
                className={classButton}
                disabled={saving}
                onClick={() => void create(detailId || undefined)}
              >
                <Copy className="size-4" />
                Duplicate
              </button>
              <button
                className={`${classButton} text-rose-700`}
                disabled={saving || state.resumes.length <= 1}
                onClick={() => void remove()}
              >
                <Trash2 className="size-4" />
                Delete version
              </button>
            </div>
          )}
        </>
      )}
      {!sourceView && tab === 'preview' && (
        <div className="mx-auto w-full max-w-[850px]">
          <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
            <h2 className="font-serif text-xl">Live résumé preview</h2>
            <div className="flex flex-wrap gap-2">
              <button
                className={classButton}
                onClick={() => setShowTemplate(true)}
              >
                <LayoutTemplate className="size-4" />
                Change template
              </button>
              <button className={classButton} onClick={() => window.print()}>
                <Printer className="size-4" />
                Print / PDF
              </button>
            </div>
          </div>
          <div className="career-preview-panel">
            <ResumePaper value={draft} template={currentTemplate} />
          </div>
          <p className="mt-4 text-xs leading-6 text-slate-500">
            The preview uses your actual edited content. Use Print / PDF for a
            document export. Nothing is submitted to employers automatically.
          </p>
        </div>
      )}
      {sourceView && (
        <p className="rounded-2xl bg-white p-5 text-sm leading-6 text-slate-600">
          <ShieldCheck className="mr-2 inline size-4 text-teal-700" />
          Editing the career source does not modify an existing tailored résumé
          or your Utomator owner profile.
        </p>
      )}
      {!sourceView && tab === 'sections' && (
        <div className="career-print-standby">
          <ResumePaper value={draft} template={currentTemplate} />
        </div>
      )}
    </section>
  );
}
