'use client';

import type { CareerDocument } from '../types';
import SectionField from './section-field';

export default function IdentitySection({
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
    <div className="flex flex-col gap-4">
      <SectionField
        label="Full name"
        maxLength={150}
        value={value.name}
        onChange={(v) => update('name', v)}
      />
      <SectionField
        label="Professional headline"
        maxLength={240}
        value={value.headline}
        onChange={(v) => update('headline', v)}
      />
      <SectionField
        label="Location"
        maxLength={180}
        value={value.location}
        onChange={(v) => update('location', v)}
      />
      <SectionField
        label="Professional summary"
        multiline
        value={value.summary}
        onChange={(v) => update('summary', v)}
      />
    </div>
  );
}
