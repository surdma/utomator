'use client';

import { Trash2 } from 'lucide-react';
import type { CareerDocument } from '../types';
import { classButton, classInput } from '../styles';
import SectionField from './section-field';

export default function CustomSection({
  value,
  customId,
  update,
}: {
  value: CareerDocument;
  customId: string;
  update: <K extends keyof CareerDocument>(
    key: K,
    next: CareerDocument[K]
  ) => void;
}) {
  const custom = value.customSections.find((x) => x.id === customId);
  if (!custom) return null;
  return (
    <div className="flex flex-col gap-4">
      <SectionField
        label="Section heading"
        maxLength={100}
        value={custom.title}
        onChange={(v) =>
          update(
            'customSections',
            value.customSections.map((s) =>
              s.id === customId ? { ...s, title: v } : s
            )
          )
        }
      />
      <label className="text-sm font-semibold">
        Entries, one per line
        <textarea
          className={classInput + ' mt-2 resize-y'}
          rows={7}
          maxLength={10500}
          value={custom.items.join('\n')}
          onChange={(e) =>
            update(
              'customSections',
              value.customSections.map((s) =>
                s.id === customId
                  ? { ...s, items: e.target.value.split('\n').slice(0, 30) }
                  : s
              )
            )
          }
        />
      </label>
      <button
        type="button"
        className={classButton + ' self-start text-rose-700'}
        onClick={() => {
          if (window.confirm('Remove this custom section?'))
            update(
              'customSections',
              value.customSections.filter((s) => s.id !== customId)
            );
        }}
      >
        <Trash2 className="size-4" />
        Remove section
      </button>
    </div>
  );
}
