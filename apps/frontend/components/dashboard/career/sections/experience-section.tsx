'use client';

import { Plus, Trash2 } from 'lucide-react';
import type { CareerDocument, Role } from '../types';
import { classButton } from '../styles';
import SectionField from './section-field';

export default function ExperienceSection({
  value,
  update,
  roleUpdate,
}: {
  value: CareerDocument;
  update: <K extends keyof CareerDocument>(
    key: K,
    next: CareerDocument[K]
  ) => void;
  roleUpdate: (i: number, next: Role) => void;
}) {
  return (
    <>
      {value.experience.map((r, i) => (
        <div
          key={i}
          className="flex flex-col gap-4 rounded-xl border border-slate-200 bg-slate-50 p-4"
        >
          <div className="flex items-center justify-between gap-2">
            <strong className="text-sm">Position {i + 1}</strong>
            <button
              type="button"
              aria-label={`Remove position ${i + 1}`}
              className={classButton + ' text-rose-700'}
              onClick={() =>
                update(
                  'experience',
                  value.experience.filter((_, j) => i !== j)
                )
              }
            >
              <Trash2 className="size-4" />
              Remove
            </button>
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <SectionField
              label="Job title"
              maxLength={180}
              value={r.role}
              onChange={(v) => roleUpdate(i, { ...r, role: v })}
            />
            <SectionField
              label="Company"
              maxLength={180}
              value={r.company}
              onChange={(v) => roleUpdate(i, { ...r, company: v })}
            />
            <SectionField
              label="Period"
              maxLength={110}
              value={r.period}
              onChange={(v) => roleUpdate(i, { ...r, period: v })}
            />
            <SectionField
              label="Location"
              maxLength={180}
              value={r.location}
              onChange={(v) => roleUpdate(i, { ...r, location: v })}
            />
          </div>
          <SectionField
            label="Achievements, one per line"
            maxLength={12000}
            multiline
            value={r.bullets.join('\n')}
            onChange={(v) =>
              roleUpdate(i, { ...r, bullets: v.split('\n').slice(0, 20) })
            }
          />
        </div>
      ))}
      <button
        type="button"
        disabled={value.experience.length >= 35}
        className={
          classButton + ' self-start border border-dashed border-teal-400'
        }
        onClick={() =>
          update('experience', [
            ...value.experience,
            {
              company: '',
              role: '',
              period: '',
              location: '',
              bullets: [],
            },
          ])
        }
      >
        <Plus className="size-4" />
        Add experience
      </button>
    </>
  );
}
