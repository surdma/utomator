'use client';

import { useState } from 'react';
import type { Program, Run } from '../growth-profile-types';
import { request } from '../../../lib/growth-profile-client';

type Props = {
  run: Run;
  program: Program | null;
  endpoint: string;
  working: boolean;
  mutate: (operation: () => Promise<unknown>) => Promise<void>;
};

export default function GrowthEvidenceForm({
  run,
  program,
  endpoint,
  working,
  mutate,
}: Props) {
  const [evidenceSection, setEvidenceSection] = useState('');
  const [evidenceText, setEvidenceText] = useState('');
  const active = run.currentStage;
  const selectedSections =
    program?.coverage.filter((section) =>
      active?.sectionIds.includes(section.id)
    ) ?? [];
  const currentEvidence = run.coverage.find(
    (item) => item.id === evidenceSection
  );
  return (
    <form
      className="rounded-xl border border-slate-200 p-4"
      onSubmit={(event) => {
        event.preventDefault();
        if (!evidenceSection) return;
        void mutate(async () => {
          await request(endpoint + '/runs/' + run.id + '/evidence', 'POST', {
            sectionId: evidenceSection,
            text: evidenceText,
          });
          setEvidenceText('');
        });
      }}
    >
      <h3 className="text-sm font-semibold text-slate-950">
        Record independent section evidence
      </h3>
      <p className="mt-1 text-xs leading-5 text-slate-500">
        Owner observations are stored as unverified input, never represented as
        a verified LinkedIn extraction.
      </p>
      <label className="mt-3 block text-xs font-semibold text-slate-800">
        Coverage section
        <select
          aria-label="Coverage section"
          required
          value={evidenceSection}
          onChange={(event) => {
            setEvidenceSection(event.target.value);
            setEvidenceText('');
          }}
          className="mt-1 min-h-10 w-full rounded-lg border border-slate-300 bg-white px-3"
        >
          <option value="">Choose a section in the current stage</option>
          {selectedSections.map((section) => (
            <option key={section.id} value={section.id}>
              {section.label}
            </option>
          ))}
        </select>
      </label>
      <label className="mt-3 block text-xs font-semibold text-slate-800">
        Real owner-supplied observation (10–1500 characters)
        <textarea
          value={evidenceText}
          onChange={(event) => setEvidenceText(event.target.value)}
          aria-label="Section observation"
          required
          minLength={10}
          maxLength={1500}
          className="mt-1 min-h-24 w-full rounded-lg border border-slate-300 p-3 text-sm"
        />
      </label>
      {currentEvidence?.evidence && (
        <p className="mt-2 text-xs text-slate-500">
          Previously submitted on{' '}
          {new Date(currentEvidence.evidence.capturedAt).toLocaleString()}; this
          remains owner-supplied, not independently verified.
        </p>
      )}
      <button
        type="submit"
        disabled={
          working || evidenceText.trim().length < 10 || !evidenceSection
        }
        className="mt-3 min-h-10 rounded-lg bg-slate-950 px-4 text-xs font-semibold text-white disabled:opacity-50"
      >
        Save source-labelled evidence
      </button>
    </form>
  );
}
