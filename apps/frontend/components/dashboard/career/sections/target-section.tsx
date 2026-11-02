'use client';

import type { Resume } from '../types';
import SectionField from './section-field';

export default function TargetSection({
  value,
  onMeta,
}: {
  value: Resume;
  onMeta: (
    key: 'label' | 'targetRole' | 'targetCompany' | 'jobDescription',
    value: string
  ) => void;
}) {
  return (
    <div className="flex flex-col gap-4">
      <SectionField
        label="Résumé name"
        value={value.label}
        maxLength={120}
        onChange={(v) => onMeta('label', v)}
      />
      <SectionField
        label="Target position"
        value={value.targetRole}
        maxLength={180}
        onChange={(v) => onMeta('targetRole', v)}
      />
      <SectionField
        label="Company (optional)"
        value={value.targetCompany}
        maxLength={180}
        onChange={(v) => onMeta('targetCompany', v)}
      />
      <SectionField
        label="Job description (private notes, never printed)"
        value={value.jobDescription}
        maxLength={12000}
        multiline
        onChange={(v) => onMeta('jobDescription', v)}
      />
    </div>
  );
}
