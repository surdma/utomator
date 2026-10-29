'use client';

import { ArrowRight } from 'lucide-react';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/automate-card';
import { short, stateLabel } from './presentation-utils';

type RunSummary = {
  id: string;
  platform: string;
  action: string;
  state: string;
  createdAt: string;
};

export default function RunHistory<T extends RunSummary>({
  runs,
  onSelect,
}: {
  runs: T[];
  onSelect: (run: T) => void;
}) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Recent executions</CardTitle>
        <CardDescription>
          Stored in memory during the current engine session. Select a
          run to inspect streamed events.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <div className="divide-y divide-slate-100">
          {runs.length === 0 && (
            <p className="py-10 text-center text-sm text-slate-500">
              No runs yet. Start an audit to capture the first trace.
            </p>
          )}
          {runs.map((run) => (
            <button
              key={run.id}
              type="button"
              className="flex min-h-16 w-full items-center justify-between gap-3 py-3 text-left hover:bg-slate-50"
              onClick={() => onSelect(run)}
            >
              <span>
                <span className="block text-sm font-semibold capitalize">
                  {run.platform} / {run.action.replaceAll('-', ' ')}
                </span>
                <span className="text-xs text-slate-500">
                  {short(run.id)} ·{' '}
                  {new Date(run.createdAt).toLocaleString()}
                </span>
              </span>
              <span className="text-xs font-semibold text-slate-500 capitalize">
                {stateLabel(run.state)}{' '}
                <ArrowRight className="ml-1 inline size-3" />
              </span>
            </button>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}
