'use client';

import Image from 'next/image';
import StudioDialog from '@/components/ui/studio-dialog';
import type { CanvasEvent } from './workflow-artboard-graph';

type Props = {
  open: boolean;
  onDismiss: () => void;
  focused: string | null;
  state?: string;
  runId?: string;
  events: CanvasEvent[];
  evidenceRoot?: string;
  onEvidenceOpen?: (runId: string, fileName: string) => void;
};

export default function WorkflowOutputDialog({
  open,
  onDismiss,
  focused,
  state,
  runId,
  events,
  evidenceRoot,
  onEvidenceOpen,
}: Props) {
  const resultEvents = events.filter((item) => item.kind === 'result');
  const screenshots = events.filter(
    (item) =>
      item.kind === 'screenshot' &&
      /^[a-zA-Z0-9_-]+\.png$/.test(item.details?.fileName ?? '')
  );
  const observation = [...events]
    .reverse()
    .find(
      (item) =>
        item.kind === 'audit' &&
        (item.details?.headline ||
          item.details?.bio ||
          item.details?.xName ||
          item.details?.excerpt)
    );
  return (
    <StudioDialog
      open={open}
      onDismiss={() => onDismiss()}
      title={
        focused === 'verify' ? 'Verification evidence' : 'Final workflow output'
      }
      description="Actual run results and captured evidence. Screenshots are labeled as captured, not fabricated after-state previews."
      size="wide"
      testId="workflow-output-dialog"
    >
      <div data-testid="workflow-output" className="space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-2 rounded-xl bg-slate-950 p-4 text-white">
          <div>
            <p className="text-[10px] font-bold tracking-wider text-slate-400 uppercase">
              Execution status
            </p>
            <p className="mt-1 text-base font-bold capitalize">
              {state?.replaceAll('-', ' ') ?? 'No run selected'}
            </p>
          </div>
          <p className="max-w-[260px] text-right font-mono text-[10px] break-all text-slate-300">
            {runId ?? 'Run the workflow to see its actual output'}
          </p>
        </div>
        {resultEvents.length > 0 ? (
          <div className="space-y-2">
            <h3 className="text-xs font-bold tracking-wider text-slate-500 uppercase">
              Verified outcome journal
            </h3>
            {resultEvents.map((item) => (
              <div
                key={item.id ?? `${item.kind}:${item.message}`}
                className="rounded-xl border border-teal-200 bg-teal-50 p-3 text-sm text-teal-950"
              >
                {item.message}
              </div>
            ))}
          </div>
        ) : (
          <p className="rounded-xl border border-dashed border-slate-200 p-4 text-xs text-slate-600">
            No verified result event yet. A workflow configuration is not an
            output.
          </p>
        )}
        {observation?.details && (
          <div
            className="rounded-xl border border-slate-200 bg-white p-4"
            data-testid="observed-profile-preview"
          >
            <p className="mb-3 text-[10px] font-bold tracking-wider text-teal-700 uppercase">
              Observed profile preview · source DOM
            </p>
            <h3 className="text-base font-bold text-slate-900">
              {observation.details.xName ||
                observation.details.title ||
                'Observed profile'}
            </h3>
            {observation.details.headline && (
              <p className="mt-1 text-sm text-slate-700">
                {observation.details.headline}
              </p>
            )}
            {observation.details.bio && (
              <p className="mt-1 text-sm whitespace-pre-wrap text-slate-700">
                {observation.details.bio}
              </p>
            )}
            {observation.details.url && (
              <p className="mt-2 text-xs break-all text-slate-500">
                {observation.details.url}
              </p>
            )}
            {observation.details.excerpt && (
              <p className="mt-3 max-h-40 overflow-y-auto border-t border-slate-100 pt-3 text-xs leading-5 whitespace-pre-wrap text-slate-600">
                {observation.details.excerpt}
              </p>
            )}
            <p className="mt-3 text-[11px] text-slate-500">
              Rendered from a real browser observation event. Not an unverified
              edit preview.
            </p>
          </div>
        )}
        {screenshots.length > 0 ? (
          <div className="space-y-3">
            <h3 className="text-xs font-bold tracking-wider text-slate-500 uppercase">
              Captured browser evidence
            </h3>
            <div className="grid gap-3 sm:grid-cols-2">
              {screenshots.map((item) => (
                <div
                  key={item.id ?? `${item.kind}:${item.message}`}
                  className="overflow-hidden rounded-xl border border-slate-200 bg-slate-50"
                >
                  {evidenceRoot && runId && onEvidenceOpen ? (
                    <button
                      type="button"
                      onClick={() => {
                        onDismiss();
                        onEvidenceOpen(runId, item.details!.fileName!);
                      }}
                      aria-label={
                        'Annotate output capture: ' + item.details!.fileName!
                      }
                      className="block w-full text-left hover:opacity-90"
                    >
                      <Image
                        unoptimized
                        src={evidenceRoot + item.details!.fileName!}
                        width={860}
                        height={540}
                        alt={'Recorded screenshot: ' + item.message}
                        className="h-auto w-full object-contain"
                      />
                    </button>
                  ) : (
                    evidenceRoot && (
                      <Image
                        unoptimized
                        src={evidenceRoot + item.details!.fileName!}
                        width={860}
                        height={540}
                        alt={'Recorded screenshot: ' + item.message}
                        className="h-auto w-full object-contain"
                      />
                    )
                  )}
                  <p className="px-3 py-2 text-xs font-semibold text-slate-700">
                    {item.message}
                  </p>
                </div>
              ))}
            </div>
            <p className="text-[11px] text-slate-500">
              Captures may precede a mutation. Only the result journal asserts
              verification.
            </p>
          </div>
        ) : (
          <p className="text-xs text-slate-500">
            No screenshot recorded for this run.
          </p>
        )}
      </div>
    </StudioDialog>
  );
}
