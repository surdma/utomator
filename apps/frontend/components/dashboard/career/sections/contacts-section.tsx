'use client';

import type { CareerDocument } from '../types';
import { classInput } from '../styles';

export default function ContactsSection({
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
    <label className="text-sm font-semibold">
      Contact methods, one per line
      <textarea
        className={classInput + ' mt-2 resize-y leading-6'}
        rows={5}
        maxLength={4000}
        value={value.contacts.join('\n')}
        onChange={(e) =>
          update('contacts', e.target.value.split('\n').slice(0, 16))
        }
      />
    </label>
  );
}
