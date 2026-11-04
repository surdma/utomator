'use client';

import { Plus } from 'lucide-react';
import { classButton } from '../styles';
import type { CareerDocument } from '../types';
import SectionField from './section-field';

export default function EducationSection({
  value,
  update,
}: {
  value: CareerDocument;
  update: <K extends keyof CareerDocument>(
    key: K,
    next: CareerDocument[K],
  ) => void;
}) {
  return (
    <>
      {value.education.map((e, i) => (
        <div
          key={i}
          className="flex flex-col gap-4 rounded-xl border border-slate-200 p-4"
        >
          <div className="flex items-center justify-between">
            <strong className="text-sm">Qualification {i + 1}</strong>
            <button
              type="button"
              className={`${classButton} text-rose-700`}
              onClick={() =>
                update(
                  'education',
                  value.education.filter((_, j) => i !== j),
                )
              }
            >
              Remove
            </button>
          </div>
          <SectionField
            label="Institution"
            maxLength={180}
            value={e.institution}
            onChange={(v) =>
              update(
                'education',
                value.education.map((x, j) =>
                  i === j ? { ...x, institution: v } : x,
                ),
              )
            }
          />
          <SectionField
            label="Degree or qualification"
            maxLength={240}
            value={e.degree}
            onChange={(v) =>
              update(
                'education',
                value.education.map((x, j) =>
                  i === j ? { ...x, degree: v } : x,
                ),
              )
            }
          />
        </div>
      ))}
      <button
        type="button"
        disabled={value.education.length >= 12}
        className={`${classButton} self-start`}
        onClick={() =>
          update('education', [
            ...value.education,
            { institution: '', degree: '' },
          ])
        }
      >
        <Plus className="size-4" />
        Add education
      </button>
    </>
  );
}
