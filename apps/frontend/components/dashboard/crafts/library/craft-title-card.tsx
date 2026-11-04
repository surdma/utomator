'use client';

import { Save, Sparkles } from 'lucide-react';
import type { ReactNode } from 'react';
import {
  Button,
  Card,
  CardContent,
  CardHeader,
} from '@/components/ui/automate-card';
import type { Craft, Draft } from '../craft-types';

type Props = {
  chosen: Craft;
  draft: Draft;
  readOnly: boolean;
  totalLinks: number;
  changed: boolean;
  busy: boolean;
  onNameChange: (name: string) => void;
  onChatOpen: () => void;
  onSave: () => void;
  children: ReactNode;
};

export function CraftTitleCard({
  chosen,
  draft,
  readOnly,
  totalLinks,
  changed,
  busy,
  onNameChange,
  onChatOpen,
  onSave,
  children,
}: Props) {
  return (
    <Card>
      <CardHeader className="flex flex-row flex-wrap items-start justify-between gap-3 border-b border-slate-100">
        <div className="min-w-0 flex-1">
          <input
            aria-label="Craft title"
            className="w-full max-w-lg bg-transparent text-lg font-extrabold text-slate-900 outline-teal-600"
            value={draft.name}
            readOnly={readOnly}
            onChange={(e) => onNameChange(e.target.value)}
          />
          <p className="mt-1 text-xs text-slate-500">
            Growth flow · {draft.slug} ·{' '}
            {readOnly ? 'Shared default · read only' : 'My craft'} · v
            {chosen.version} · {draft.steps.length} steps · {totalLinks}{' '}
            connections
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            className="inline-flex min-h-10 items-center gap-2 rounded-lg border border-slate-200 px-3 text-xs font-semibold"
            onClick={onChatOpen}
          >
            <Sparkles className="size-4" />
            Use in Chat
          </button>
          <Button
            size="sm"
            disabled={readOnly || !changed || busy}
            variant="primary"
            onClick={onSave}
          >
            <Save className="size-4" />
            {busy ? 'Saving' : 'Save'}
          </Button>
        </div>
      </CardHeader>
      <CardContent className="flex flex-col gap-4 pt-4">{children}</CardContent>
    </Card>
  );
}
