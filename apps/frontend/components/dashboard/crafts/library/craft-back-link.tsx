'use client';

import { ArrowLeft } from 'lucide-react';

type Props = {
  onClick: () => void;
};

export function CraftBackLink({ onClick }: Props) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="inline-flex min-h-10 w-fit items-center gap-2 rounded-lg px-2 text-xs font-semibold text-teal-800 hover:bg-teal-50 focus-visible:outline-2 focus-visible:outline-teal-600"
    >
      <ArrowLeft className="size-4" />
      Growth library
    </button>
  );
}
