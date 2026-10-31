'use client';

import { FileCode2, ShieldCheck } from 'lucide-react';
import GrowthWorkflowArtboard from './growth-workflow-artboard';
import type { Run } from './growth-profile-types';
import { request } from '../../../lib/growth-profile-client';
import { useGrowthProfileWorkflow } from './hooks/use-growth-profile-workflow';
import GrowthRunControls from './run-controls';
import GrowthEvidenceForm from './evidence-form';
import GrowthCoverageList from './coverage-list';

type Props = {
  platform: 'linkedin' | 'x';
  selectedAction: string;
  busy: boolean;
  accountId?: string;
  onSelectAction: (action: string) => void;
  templateId?: string;
  onExit?: () => void;
};
export default function GrowthProfilePipelines({
  platform,
  selectedAction,
  busy,
  accountId,
  onSelectAction,
  templateId = 'linkedin-profile',
  onExit,
}: Props) {
  const { endpoint, program, run, setRun, error, working, mutate } =
    useGrowthProfileWorkflow(platform, templateId, accountId);
  if (platform !== 'linkedin') return null;
  return (
    <section
      data-testid="growth-profile-program"
      className="space-y-4 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm sm:p-6"
    >
      <header className="flex flex-wrap items-start justify-between gap-4">
        <div className="max-w-3xl">
          <p className="text-xs font-semibold tracking-widest text-teal-800 uppercase">
            Growth · one composed YAML workflow
          </p>
          <h2 className="mt-2 text-xl font-semibold text-slate-950">
            {program?.title ?? 'Profile auditing & section optimization'}
          </h2>
          <p className="mt-2 text-sm leading-6 text-slate-600">
            {program?.objective ?? 'Loading the profile Growth workflow…'}
          </p>
        </div>
        <div className="flex items-center gap-3">
          {onExit && (
            <button
              type="button"
              onClick={onExit}
              className="min-h-10 rounded-xl border border-slate-200 px-3 text-xs font-semibold"
            >
              Back to action workflows
            </button>
          )}
          <a
            href={endpoint + '/yaml'}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex min-h-10 items-center gap-2 text-xs font-semibold text-teal-800 underline"
          >
            <FileCode2 className="size-4" />
            View source YAML
          </a>
        </div>
      </header>
      <p className="rounded-xl border border-amber-200 bg-amber-50 p-3 text-xs leading-5 text-amber-950">
        <ShieldCheck className="mr-2 inline size-4" />
        Connected Runner pipelines, not separate engines. Section coverage stays
        missing until independent evidence is supplied. No automatic profile
        edit or growth outcome is implied.
      </p>
      {error && (
        <p role="alert" className="text-sm text-rose-700">
          {error}
        </p>
      )}
      {program && <GrowthWorkflowArtboard program={program} run={run} />}
      {!accountId && (
        <p className="rounded-xl border border-slate-200 p-3 text-sm text-slate-600">
          Connect and verify the owner’s LinkedIn account to start this YAML
          Growth workflow.
        </p>
      )}
      {accountId &&
        (!run ||
          run.status !== 'active' ||
          ['failed', 'blocked', 'cancelled', 'unavailable'].includes(
            run.state
          )) && (
          <button
            type="button"
            disabled={working || busy || !program}
            onClick={() =>
              void mutate(async () => {
                setRun(
                  await request<Run>(endpoint + '/runs', 'POST', { accountId })
                );
              })
            }
            className="min-h-11 rounded-xl bg-slate-950 px-5 text-sm font-semibold text-white disabled:opacity-50"
          >
            Start Growth workflow
          </button>
        )}
      {run && (
        <>
          <GrowthRunControls
            run={run}
            program={program}
            busy={busy}
            working={working}
            endpoint={endpoint}
            mutate={mutate}
          />
          {run.status === 'active' && run.currentStage?.id !== 'review' && (
            <GrowthEvidenceForm
              run={run}
              program={program}
              endpoint={endpoint}
              working={working}
              mutate={mutate}
            />
          )}
          <GrowthCoverageList run={run} program={program} />
        </>
      )}
      {program && (
        <details className="rounded-xl border border-slate-200 p-4">
          <summary className="cursor-pointer text-sm font-semibold">
            {program.requirements.length} Growth requirements and registered
            editing actions
          </summary>
          <ol className="mt-3 list-decimal space-y-2 pl-5 text-xs leading-5 text-slate-600">
            {program.requirements.map((item) => (
              <li key={item.id}>{item.text}</li>
            ))}
          </ol>
          <p className="mt-4 text-xs text-slate-500">
            Editing actions use the existing guarded Pipeline editor separately;
            the composed sample performs six read-only evidence workflows.
          </p>
          <div className="mt-3 grid gap-2 sm:grid-cols-2">
            {program.pipelines.map((item) => (
              <button
                key={item.id}
                type="button"
                disabled={busy}
                onClick={() => onSelectAction(item.action)}
                className={
                  'rounded-lg border p-3 text-left text-xs font-semibold disabled:opacity-50 ' +
                  (selectedAction === item.action
                    ? 'border-teal-600 bg-teal-50'
                    : 'border-slate-200')
                }
              >
                {item.title}
              </button>
            ))}
          </div>
        </details>
      )}
    </section>
  );
}
