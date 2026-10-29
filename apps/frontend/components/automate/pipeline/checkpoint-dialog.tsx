'use client';

import { CheckCircle2 } from 'lucide-react';
import StudioDialog from '@/components/ui/studio-dialog';
import { Button } from '@/components/ui/automate-card';
import type { Checkpoint } from './run-models';

type Props = {
  checkpoint: Checkpoint | null;
  checkpointError: string;
  inputReply: string;
  onInputChange: (value: string) => void;
  onDecision: (approved: boolean, text?: string) => Promise<void>;
  onCancel: () => Promise<void>;
};

export default function CheckpointDialog({
  checkpoint,
  checkpointError,
  inputReply,
  onInputChange,
  onDecision,
  onCancel,
}: Props) {
  const checkpointNeeded = checkpoint?.kind === 'approval';
  return (
    <StudioDialog
      open={Boolean(checkpoint)}
      onDismiss={() => {}}
      dismissible={false}
      title={
        checkpointNeeded ? 'Approval required' : 'Operator input required'
      }
      description={checkpoint?.message}
      testId="checkpoint-dialog"
    >
      {checkpoint && (
        <div className="flex flex-col gap-4">
          <p className="text-sm leading-6 text-slate-700">
            Review the operation before continuing.
          </p>
          {checkpointError && (
            <p
              role="alert"
              className="rounded-lg border border-rose-200 bg-rose-50 p-3 text-xs text-rose-800"
            >
              {checkpointError}
            </p>
          )}
          <div>
            {checkpointNeeded ? (
              <div className="flex flex-wrap gap-2">
                <Button variant="primary" onClick={() => void onDecision(true)}>
                  <CheckCircle2 className="size-4" />
                  Approve checkpoint
                </Button>
                <Button variant="danger" onClick={() => void onDecision(false)}>
                  Reject
                </Button>
              </div>
            ) : (
              <div className="flex flex-wrap gap-2">
                <input
                  aria-label="Checkpoint response"
                  value={inputReply}
                  onChange={(event) => onInputChange(event.target.value)}
                  className="min-h-10 min-w-0 flex-1 rounded-xl border border-slate-300 bg-white px-3 text-sm"
                  maxLength={300}
                />
                <Button
                  variant="primary"
                  disabled={!inputReply.trim()}
                  onClick={() => void onDecision(true, inputReply)}
                >
                  Respond
                </Button>
                <Button type="button" onClick={() => void onCancel()}>
                  Cancel run
                </Button>
              </div>
            )}
          </div>
        </div>
      )}
    </StudioDialog>
  );
}
