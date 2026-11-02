'use client';

import { Plus } from 'lucide-react';
import type { CareerDocument } from '../types';
import { classButton } from '../styles';
import SectionField from './section-field';

export default function ProjectsSection({
  value,
  update,
}: {
  value: CareerDocument;
  update: <K extends keyof CareerDocument>(
    key: K,
    next: CareerDocument[K]
  ) => void;
}) {
  return (
    <>
      {value.projects.map((p, i) => (
        <div
          key={i}
          className="flex flex-col gap-4 rounded-xl border border-slate-200 p-4"
        >
          <div className="flex items-center justify-between">
            <strong className="text-sm">Project {i + 1}</strong>
            <button
              type="button"
              className={classButton + ' text-rose-700'}
              onClick={() =>
                update(
                  'projects',
                  value.projects.filter((_, j) => i !== j)
                )
              }
            >
              Remove
            </button>
          </div>
          <SectionField
            label="Project name"
            maxLength={180}
            value={p.title}
            onChange={(v) =>
              update(
                'projects',
                value.projects.map((x, j) => (i === j ? { ...x, title: v } : x))
              )
            }
          />
          <SectionField
            label="Contribution and outcome"
            multiline
            maxLength={650}
            value={p.outcome}
            onChange={(v) =>
              update(
                'projects',
                value.projects.map((x, j) =>
                  i === j ? { ...x, outcome: v } : x
                )
              )
            }
          />
        </div>
      ))}
      <button
        type="button"
        disabled={value.projects.length >= 30}
        className={classButton + ' self-start'}
        onClick={() =>
          update('projects', [...value.projects, { title: '', outcome: '' }])
        }
      >
        <Plus className="size-4" />
        Add project
      </button>
    </>
  );
}
