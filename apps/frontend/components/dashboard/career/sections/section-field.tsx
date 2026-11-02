'use client';

import { classInput } from '../styles';

export default function SectionField({
  label,
  value,
  onChange,
  multiline,
  maxLength = 3000,
}: {
  label: string;
  value: string;
  onChange: (text: string) => void;
  multiline?: boolean;
  maxLength?: number;
}) {
  return (
    <label className="block min-w-0 text-xs font-semibold text-slate-700">
      <span className="mb-1.5 block">{label}</span>
      {multiline ? (
        <textarea
          rows={4}
          maxLength={maxLength}
          className={classInput + ' resize-y leading-6'}
          value={value}
          onChange={(e) => onChange(e.target.value)}
        />
      ) : (
        <input
          maxLength={maxLength}
          className={classInput}
          value={value}
          onChange={(e) => onChange(e.target.value)}
        />
      )}
    </label>
  );
}
