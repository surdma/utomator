'use client';

import { classInput } from '../styles';
import type { CareerDocument } from '../types';

export default function SkillsSection({
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
    <label className="text-sm font-semibold">
      Skills, one per line
      <textarea
        className={`${classInput} mt-2 resize-y leading-6`}
        rows={7}
        maxLength={10000}
        value={value.skills.join('\n')}
        onChange={(e) =>
          update('skills', e.target.value.split('\n').slice(0, 80))
        }
      />
    </label>
  );
}
