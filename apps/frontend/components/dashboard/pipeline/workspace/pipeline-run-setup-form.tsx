'use client';

import { type Dispatch, type SetStateAction } from 'react';
import { motion } from 'framer-motion';
import { Crosshair, Focus } from 'lucide-react';
import { workflows, type Platform, type Workflow } from '../workflow-catalog';

type Props = {
  reduceMotion: boolean;
  runFormError: string;
  action: string;
  platform: Platform;
  chooseAction: (action: string) => void;
  scopeSection: string;
  setScopeSection: Dispatch<SetStateAction<string>>;
  pageOptions: string[];
  selectedPage: string;
  profilePage: string;
  setSelectedNode: Dispatch<SetStateAction<string>>;
  selected: Workflow;
  form: Record<string, string>;
  setForm: Dispatch<SetStateAction<Record<string, string>>>;
  platformLabel: string;
};

export default function PipelineRunSetupForm({
  reduceMotion,
  runFormError,
  action,
  platform,
  chooseAction,
  scopeSection,
  setScopeSection,
  pageOptions,
  selectedPage,
  profilePage,
  setSelectedNode,
  selected,
  form,
  setForm,
  platformLabel,
}: Props) {
  return (
    <motion.form
      className="space-y-6 rounded-2xl border border-slate-200/80 bg-slate-50/70 p-4 sm:p-5"
      onSubmit={(event) => event.preventDefault()}
      initial={reduceMotion ? false : { opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={
        reduceMotion
          ? { duration: 0 }
          : { type: 'spring', stiffness: 380, damping: 32 }
      }
    >
      <div className="space-y-1">
        <h3 className="text-sm font-semibold tracking-tight text-slate-950">
          Run setup
        </h3>
        <p className="text-xs leading-5 text-slate-500">
          Choose the action and page, then start from the dock. Mator stages
          pipeline edits in the chat beside this board.
        </p>
      </div>
      {runFormError && (
        <p
          role="alert"
          className="rounded-xl border border-rose-200 bg-rose-50 p-3 text-xs text-rose-800"
        >
          {runFormError}
        </p>
      )}
      <label htmlFor="workflowSelect" className="block text-xs font-semibold">
        Workflow action
        <select
          id="workflowSelect"
          className="mt-2 min-h-11 w-full rounded-xl border border-slate-200 bg-white px-3 text-sm"
          value={action}
          onChange={(event) => chooseAction(event.target.value)}
        >
          {workflows[platform].map((item) => (
            <option key={item.id} value={item.id}>
              {item.title}
            </option>
          ))}
        </select>
      </label>
      <div
        data-testid="page-scope"
        className="rounded-xl border border-teal-200 bg-teal-50 p-3"
      >
        <p className="flex items-center gap-2 text-xs font-bold text-teal-900">
          <Focus className="size-4" />
          Isolate one page
        </p>
        <label className="mt-2 block text-xs font-semibold" htmlFor="pageScope">
          Page section
        </label>
        <select
          id="pageScope"
          className="mt-1.5 min-h-10 w-full rounded-lg border border-slate-200 bg-white px-3 text-sm"
          value={scopeSection}
          onChange={(e) => setScopeSection(e.target.value)}
        >
          {pageOptions.map((part) => (
            <option key={part} value={part}>
              {part === 'profile'
                ? 'Main profile'
                : part[0].toUpperCase() + part.slice(1)}
            </option>
          ))}
        </select>
        <p className="mt-2 font-mono text-[10px] break-all text-teal-800">
          {selectedPage ||
            'Select a saved social profile to set the inspection target.'}
        </p>
        <button
          type="button"
          disabled={!profilePage}
          onClick={() => {
            chooseAction('audit-page');
            setSelectedNode('inspect');
          }}
          className="mt-2 inline-flex items-center gap-2 text-xs font-bold text-teal-900 hover:underline"
        >
          <Crosshair className="size-4" />
          Inspect this page before editing
        </button>
      </div>
      {selected.fields.length > 0 && (
        <div className="grid gap-3">
          {selected.fields.map((field) => (
            <div key={field.key}>
              <label
                className="mb-1 block text-xs font-semibold"
                htmlFor={'automation-' + field.key}
              >
                {field.label}
                {field.required && (
                  <span className="ml-1 text-rose-500">*</span>
                )}
              </label>
              {field.multiline ? (
                <textarea
                  id={'automation-' + field.key}
                  className="min-h-24 w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2.5 text-sm outline-teal-600"
                  maxLength={field.max || 3000}
                  required={field.required}
                  value={form[field.key] || ''}
                  onChange={(event) =>
                    setForm((prev) => ({
                      ...prev,
                      [field.key]: event.target.value,
                    }))
                  }
                />
              ) : (
                <input
                  id={'automation-' + field.key}
                  className="min-h-11 w-full rounded-xl border border-slate-200 bg-white px-3 text-sm outline-teal-600"
                  maxLength={field.max || 500}
                  placeholder={field.placeholder}
                  required={field.required}
                  value={form[field.key] || ''}
                  onChange={(event) =>
                    setForm((prev) => ({
                      ...prev,
                      [field.key]: event.target.value,
                    }))
                  }
                />
              )}
            </div>
          ))}
        </div>
      )}
      {platform === 'linkedin' && action === 'edit-profile' && (
        <p className="text-xs leading-5 text-slate-500">
          Use details reviewed for this LinkedIn account. Content from another
          identity is not auto-filled.
        </p>
      )}
      <p className="rounded-xl bg-white p-3 text-xs leading-6 text-slate-500">
        Authentication is managed by the selected connection. Use the{' '}
        {platformLabel} icon in the floating toolbar to connect, verify, or sync
        an expired session.
      </p>
    </motion.form>
  );
}
