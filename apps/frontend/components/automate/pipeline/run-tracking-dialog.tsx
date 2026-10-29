'use client';

import { Activity } from 'lucide-react';
import StudioDialog from '@/components/ui/studio-dialog';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/automate-card';
import { stateLabel } from './presentation-utils';

type Props = {
  open: boolean;
  onDismiss: () => void;
  active: { id: string; state: string } | null;
  playbook: { stages: string[] } | null;
  assessment: {
    comparisons: Array<{
      field: string;
      status: string;
      observed: string | null;
      proposed: string | null;
    }>;
    notice: string;
  } | null;
  latest: { message: string } | undefined;
};

export default function RunTrackingDialog({
  open,
  onDismiss,
  active,
  playbook,
  assessment,
  latest,
}: Props) {
  return (
    <StudioDialog
      open={open}
      onDismiss={onDismiss}
      title="Run tracking"
      description="Live event telemetry, audit comparisons, and the latest verified observation."
      testId="tracking-dialog"
      size="wide"
    >
      <div
        data-testid="automation-tracking-panel"
        className="flex flex-col gap-4"
      >
        <Card>
          <CardHeader>
            <CardTitle>Run telemetry</CardTitle>
            <CardDescription>
              Live events, approvals and verified outcomes.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              <div className="rounded-xl bg-slate-950 p-4 text-white">
                <p className="text-[10px] tracking-[.15em] text-slate-400 uppercase">
                  Current state
                </p>
                <p className="mt-2 flex items-center gap-2 text-base font-bold capitalize">
                  <Activity className="size-4 text-teal-300" />
                  {active ? stateLabel(active.state) : 'Waiting for a run'}
                </p>
                <p className="mt-2 truncate font-mono text-[10px] text-slate-400">
                  {active?.id || '–'}
                </p>
              </div>
              {playbook?.stages.map((stage, index) => (
                <div key={stage} className="flex gap-3">
                  <span
                    className={
                      'flex size-7 shrink-0 items-center justify-center rounded-full border text-[10px] font-bold ' +
                      (index === 0 && active
                        ? 'border-teal-200 bg-teal-50 text-teal-700'
                        : 'border-slate-200 text-slate-400')
                    }
                  >
                    {index + 1}
                  </span>
                  <div>
                    <p className="text-xs font-semibold">{stage}</p>
                    <p className="text-[10px] text-slate-400">
                      {index === 0 && active
                        ? 'Run started'
                        : 'Reference sequence · not a progress claim'}
                    </p>
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
        {assessment && (
          <Card>
            <CardHeader>
              <CardTitle>Audit comparison</CardTitle>
              <CardDescription>
                Current observation against an owner-authored draft.
                Differences require your judgment.
              </CardDescription>
            </CardHeader>
            <CardContent>
              {assessment.comparisons.map((check) => (
                <div key={check.field} className="space-y-2 text-xs">
                  <p className="font-bold capitalize">
                    {check.field} ·{' '}
                    <span className="font-medium text-slate-500">
                      {check.status.replaceAll('-', ' ')}
                    </span>
                  </p>
                  <p className="rounded-lg bg-slate-50 p-2 text-slate-600">
                    Observed: {check.observed || 'Not observed'}
                  </p>
                  <p className="rounded-lg bg-teal-50 p-2 text-teal-900">
                    Source draft: {check.proposed || 'No draft available'}
                  </p>
                </div>
              ))}
              <p className="mt-3 text-[11px] leading-5 text-slate-500">
                {assessment.notice}
              </p>
            </CardContent>
          </Card>
        )}
        <Card>
          <CardHeader>
            <CardTitle>Latest observation</CardTitle>
            <CardDescription>Not a model confidence score.</CardDescription>
          </CardHeader>
          <CardContent>
            <p className="text-xs leading-5 break-words text-slate-600">
              {latest?.message ||
                'An audit will record profile observations and review evidence.'}
            </p>
          </CardContent>
        </Card>
      </div>
    </StudioDialog>
  );
}
