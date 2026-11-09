'use client';

import {
  Background,
  BackgroundVariant,
  type Connection,
  Controls,
  type Edge,
  MarkerType,
  Position,
  ReactFlow,
  ReactFlowProvider,
  useNodesState,
} from '@xyflow/react';
import { ArrowLeft, ChevronRight } from 'lucide-react';
import { type ReactNode, useEffect, useMemo, useState } from 'react';
import { WorkflowEditorDialogs } from './editor/workflow-editor-dialogs';
import { WorkflowEditorToolbar } from './editor/workflow-editor-toolbar';
import {
  type StepForm,
  WorkflowStepInspector,
} from './editor/workflow-step-inspector';
import StepCard from './workflow-step-card';
import { fixed } from './workflow-step-policy';

export type { StepForm, StepFormField } from './editor/workflow-step-inspector';

import type {
  FlowNode,
  RunEvent,
  StepKind,
  WorkflowPlan,
  WorkflowStep,
} from './workflow-types';

export type {
  RunEvent,
  StepKind,
  WorkflowPlan,
  WorkflowStep,
} from './workflow-types';

import {
  buildGrowthGraph,
  type GrowthExecutionView,
  type GrowthGraphNode,
  GrowthGraphNodeCard,
  type GrowthWorkflowState,
  GrowthWorkspaceDialogs,
  useGrowthExecutionProjection,
  useGrowthGraphNodes,
  useGrowthProfileWorkflow,
} from '@/modules/growth';
import StudioDialog from '../../../components/ui/studio-dialog';

type Props = {
  plan: WorkflowPlan;
  templates: WorkflowPlan[];
  events: RunEvent[];
  state?: string;
  runId?: string;
  busy: boolean;
  dirty: boolean;
  saving: boolean;
  onPlanChange: (plan: WorkflowPlan) => void;
  onTemplateApply: (plan: WorkflowPlan, templateId: string) => Promise<void>;
  onSave: () => Promise<void>;
  runError?: string;
  configRequest?: number;
  children: ReactNode;
  evidenceRoot?: string;
  onEvidenceOpen?: (runId: string, fileName: string) => void;
  connected: boolean;
  accountLabel?: string;
  growthTemplateId?: string | null;
  growthAccountId?: string;
  growthState?: GrowthWorkflowState;
  growthExecution?: GrowthExecutionView;
  onGrowthTemplateApply?: (id: string) => Promise<void>;
  onClearGrowth?: () => void;
  onGrowthActionSelect?: (action: string) => void;
};
const choices: Array<{ kind: StepKind; name: string; help: string }> = [
  {
    kind: 'inspect',
    name: 'Inspect browser page',
    help: 'Read actual browser DOM and emit evidence',
  },
  {
    kind: 'note',
    name: 'Record event',
    help: 'Write a user-defined entry to the run journal',
  },
  {
    kind: 'evidence',
    name: 'Capture evidence',
    help: 'Bind to a prior read-only observation',
  },
  {
    kind: 'approve',
    name: 'Review evidence',
    help: 'Require explicit operator approval of captured evidence',
  },
  { kind: 'delay', name: 'Wait', help: 'Cancellable delay, up to 30 seconds' },
  {
    kind: 'pause',
    name: 'Wait for operator',
    help: 'Pause execution until Resume is selected',
  },
  {
    kind: 'stop',
    name: 'End workflow early',
    help: 'Stop before executing later stages',
  },
  {
    kind: 'verify',
    name: 'Observe browser result',
    help: 'Read the real page after earlier steps',
  },
];
const nodeTypes = { step: StepCard, growthNode: GrowthGraphNodeCard };
type ArtboardNode = FlowNode | GrowthGraphNode;
function chain(plan: WorkflowPlan, steps: WorkflowStep[]): WorkflowPlan {
  return {
    ...plan,
    steps,
    links: steps
      .slice(1)
      .map((s, i) => ({ source: steps[i]?.id, target: s.id })),
  };
}
function EditorBody(props: Props) {
  const {
    plan,
    templates,
    events,
    state,
    runId,
    busy,
    dirty,
    saving,
    onPlanChange,
    onTemplateApply,
    onSave,
    runError,
    configRequest = 0,
    children,
    evidenceRoot,
    onEvidenceOpen,
    connected,
    accountLabel,
    growthTemplateId,
    growthAccountId,
    growthState,
    growthExecution,
    onGrowthTemplateApply,
    onClearGrowth,
    onGrowthActionSelect,
  } = props;
  const [configOpen, setConfigOpen] = useState(false);
  useEffect(() => {
    if (configRequest <= 0) return;
    const frame = requestAnimationFrame(() => setConfigOpen(true));
    return () => cancelAnimationFrame(frame);
  }, [configRequest]);
  const [templateOpen, setTemplateOpen] = useState(false);
  const [addOpen, setAddOpen] = useState(false);
  const [stepDraft, setStepDraft] = useState<WorkflowStep | null>(null);
  const [growthDetailsOpen, setGrowthDetailsOpen] = useState(false);
  const [returnConfirmOpen, setReturnConfirmOpen] = useState(false);
  const [growthPipelineId, setGrowthPipelineId] = useState<string | null>(null);
  const [growthTaskId, setGrowthTaskId] = useState<string | null>(null);
  const localGrowth = useGrowthProfileWorkflow(
    plan.platform,
    growthState ? null : (growthTemplateId ?? null),
    growthAccountId,
  );
  const growth = growthState ?? localGrowth;
  const growthRun = growth.run;
  // A past execution must display its pinned YAML plans, not a newer library revision.
  const growthProgram = useMemo(
    () =>
      growth.program && growthRun?.stages?.length
        ? {
            ...growth.program,
            stages: growthRun.stages.map((stage) => ({
              ...stage,
              stepCount: stage.plan.steps.length,
            })),
          }
        : growth.program,
    [growth.program, growthRun?.stages],
  );
  const growthStage =
    growthProgram?.stages.find((stage) => stage.id === growthPipelineId) ??
    null;
  const localExecution = useGrowthExecutionProjection(
    growthExecution ? null : growthRun,
  );
  const { projection: growthProjection, error: growthJournalError } =
    growthExecution ?? localExecution;
  const projectedPipeline = growthProjection?.pipelines.find(
    (item) => item.id === growthPipelineId,
  );
  const growthGraph = useMemo(
    () =>
      growthProgram
        ? buildGrowthGraph(
            growthProgram,
            growthRun,
            growthStage,
            growthProjection,
          )
        : null,
    [growthProgram, growthRun, growthStage, growthProjection],
  );
  const growthViewKey = [
    'growth',
    growthTemplateId,
    growthPipelineId ?? 'overview',
    growthProgram ? 'loaded' : 'loading',
  ].join('/');
  const { nodes: growthNodes, onNodesChange: onGrowthNodesChange } =
    useGrowthGraphNodes(growthViewKey, growthGraph?.nodes);
  const [outputOpen, setOutputOpen] = useState(false);
  const [editorError, setEditorError] = useState('');
  const [stepForms, setStepForms] = useState<
    Partial<Record<StepKind, StepForm>>
  >({});
  const [stepFormsError, setStepFormsError] = useState('');
  const [_stepFormsRequest, setStepFormsRequest] = useState(0);
  useEffect(() => {
    const controller = new AbortController();
    void fetch('/api/step-forms', {
      cache: 'no-store',
      signal: controller.signal,
    })
      .then(async (response) => {
        if (!response.ok) {
          const result = (await response.json().catch(() => ({}))) as {
            error?: string;
          };
          throw Error(
            result.error ||
              `Step fields unavailable (HTTP ${response.status}).`,
          );
        }
        const data = (await response.json()) as Partial<
          Record<StepKind, StepForm>
        >;
        if (
          !data ||
          typeof data !== 'object' ||
          !Array.isArray(data.start?.fields)
        )
          throw Error('Step forms returned an invalid response.');
        if (!controller.signal.aborted) {
          setStepForms(data);
          setStepFormsError('');
        }
      })
      .catch((error) => {
        if (!controller.signal.aborted)
          setStepFormsError(
            error instanceof Error ? error.message : 'Step fields unavailable',
          );
      });
    return () => controller.abort();
  }, []);
  const latest = useMemo(() => {
    const m = new Map<string, string>();
    for (const e of events)
      if (e.details?.stepId && e.details?.stage)
        m.set(e.details.stepId, e.details.stage);
    return m;
  }, [events]);
  const data = useMemo(
    () => ({
      nodes: plan.steps.map(
        (step, i): FlowNode => ({
          id: step.id,
          type: 'step',
          position: step.position ?? {
            x: 50 + (i % 4) * 290,
            y: 70 + Math.floor(i / 4) * 230,
          },
          data: { step, index: i + 1, status: latest.get(step.id) ?? 'idle' },
          sourcePosition: Position.Right,
          targetPosition: Position.Left,
        }),
      ),
      edges: plan.links.map(
        (link): Edge => ({
          id: `${link.source}-to-${link.target}`,
          source: link.source,
          target: link.target,
          type: 'smoothstep',
          markerEnd: { type: MarkerType.ArrowClosed, color: '#0f766e' },
          style: { stroke: '#0f766e', strokeWidth: 2 },
          animated:
            state === 'running' && latest.get(link.target) === 'started',
        }),
      ),
    }),
    [plan, latest, state],
  );
  const [nodes, setNodes, onNodesChange] = useNodesState<ArtboardNode>(
    data.nodes,
  );
  useEffect(() => {
    const frame = requestAnimationFrame(() => {
      setNodes((previous) => {
        const changed =
          previous.map((node) => node.id).join('|') !==
          data.nodes.map((node) => node.id).join('|');
        return data.nodes.map((node) => ({
          ...node,
          position: changed
            ? node.position
            : (previous.find((item) => item.id === node.id)?.position ??
              node.position),
        }));
      });
    });
    return () => cancelAnimationFrame(frame);
  }, [data.nodes, setNodes]);
  const canEdit = !busy;
  function requestWorkspaceReturn() {
    if (busy || saving) return;
    if (dirty) {
      setReturnConfirmOpen(true);
      return;
    }
    onClearGrowth?.();
  }
  function update(next: WorkflowPlan) {
    if (!canEdit) return;
    setEditorError('');
    onPlanChange(next);
  }
  function reorder(source: string, target: string) {
    if (!canEdit || source === target) return;
    const ordered = [...plan.steps];
    if (fixed.has(target)) {
      setEditorError(
        'Required core nodes cannot be moved. Connect an optional step instead.',
      );
      return;
    }
    const from = ordered.findIndex((s) => s.id === target),
      to = ordered.findIndex((s) => s.id === source);
    if (from < 0 || to < 0) return;
    const [step] = ordered.splice(from, 1);
    ordered.splice(ordered.findIndex((s) => s.id === source) + 1, 0, step!);
    if (
      ordered[0]?.id !== 'start' ||
      ordered[1]?.id !== 'session' ||
      ordered.at(-1)?.id !== 'finish'
    ) {
      setEditorError('Start, Browser and Final output are protected.');
      return;
    }
    update(chain(plan, ordered));
  }
  function moveSelected(direction: -1 | 1) {
    if (!stepDraft || fixed.has(stepDraft.id)) return;
    const order = [...plan.steps],
      index = order.findIndex((s) => s.id === stepDraft.id);
    const next = index + direction;
    if (next < 2 || next >= order.length - 1) return;
    [order[index], order[next]] = [order[next]!, order[index]!];
    update(chain(plan, order));
  }
  function add(kind: StepKind) {
    const order = [...plan.steps],
      index = order.findIndex((s) => s.id === 'action');
    const earlier = order.slice(0, index);
    const observation = [...earlier]
      .reverse()
      .find((step) => step.kind === 'inspect' || step.kind === 'verify');
    const evidence = [...earlier]
      .reverse()
      .find((step) => step.kind === 'evidence');
    if (kind === 'evidence' && !observation) {
      setEditorError('Add an observation before capturing evidence.');
      return;
    }
    if (kind === 'approve' && !evidence) {
      setEditorError(
        'Add a connected evidence step before requesting approval.',
      );
      return;
    }
    const step: WorkflowStep = {
      id: `step-${crypto.randomUUID().slice(0, 8)}`,
      kind,
      title: choices.find((c) => c.kind === kind)?.name ?? kind,
      ...(kind === 'delay' ? { delayMs: 1000 } : {}),
      ...(kind === 'evidence' && observation
        ? {
            inputBindings: {
              observation: {
                stepId: observation.id,
                field: 'excerpt' as const,
              },
            },
          }
        : {}),
      ...(kind === 'approve' && evidence
        ? {
            inputBindings: {
              evidence: { stepId: evidence.id, field: 'digest' as const },
            },
          }
        : {}),
    };
    order.splice(index, 0, step);
    update(chain(plan, order));
    setAddOpen(false);
    setStepDraft(step);
  }
  function remove() {
    if (!stepDraft || fixed.has(stepDraft.id)) return;
    update(
      chain(
        plan,
        plan.steps.filter((s) => s.id !== stepDraft.id),
      ),
    );
    setStepDraft(null);
  }
  function applyStepDraft() {
    if (!stepDraft) return;
    if (
      !stepDraft.title.trim() ||
      (stepDraft.delayMs !== undefined &&
        (stepDraft.delayMs < 0 || stepDraft.delayMs > 30000))
    ) {
      setEditorError('Invalid title or delay');
      return;
    }
    if (
      (stepDraft.kind === 'evidence' &&
        !stepDraft.inputBindings?.observation) ||
      (stepDraft.kind === 'approve' && !stepDraft.inputBindings?.evidence)
    ) {
      setEditorError('This step requires a preceding typed source binding.');
      return;
    }
    update({
      ...plan,
      steps: plan.steps.map((s) => (s.id === stepDraft.id ? stepDraft : s)),
    });
    setStepDraft(null);
  }
  return (
    <section
      data-testid="workflow-artboard"
      className="flex h-full min-h-[630px] flex-col overflow-hidden rounded-3xl border border-slate-200/90 bg-white shadow-sm lg:min-h-[calc(100dvh-8rem)]"
    >
      {(runError || editorError) && (
        <p
          role="alert"
          className="border-b border-rose-200 bg-rose-50 px-4 py-2 text-xs text-rose-800"
        >
          {runError || editorError}
        </p>
      )}
      <div
        data-workflow-canvas
        className="relative min-h-[480px] flex-1 bg-[#f3f6f7]"
      >
        <div
          className="absolute inset-0"
          data-testid={growthTemplateId ? 'growth-nested-artboard' : undefined}
        >
          <ReactFlow<ArtboardNode, Edge>
            key={growthTemplateId ? growthViewKey : 'workflow'}
            data-testid={growthTemplateId ? 'growth-workflow-graph' : undefined}
            nodes={growthTemplateId ? growthNodes : nodes}
            edges={growthTemplateId ? (growthGraph?.edges ?? []) : data.edges}
            nodeTypes={nodeTypes}
            onNodesChange={
              growthTemplateId ? onGrowthNodesChange : onNodesChange
            }
            nodesDraggable={!growthTemplateId && canEdit}
            nodesConnectable={!growthTemplateId && canEdit}
            edgesReconnectable={false}
            deleteKeyCode={null}
            onConnect={
              growthTemplateId
                ? undefined
                : (link: Connection) => reorder(link.source, link.target)
            }
            onNodeDragStop={(_, node) => {
              if (!growthTemplateId && !busy)
                update({
                  ...plan,
                  steps: plan.steps.map((step) =>
                    step.id === node.id
                      ? { ...step, position: node.position }
                      : step,
                  ),
                });
            }}
            onNodeClick={(_, node) => {
              if (growthTemplateId) {
                if (!growthStage) {
                  if (
                    growthProgram?.stages.some((stage) => stage.id === node.id)
                  ) {
                    setGrowthPipelineId(node.id);
                    setGrowthTaskId(null);
                  }
                } else if (
                  growthStage.plan.steps.some((step) => step.id === node.id)
                ) {
                  setGrowthTaskId(node.id);
                }
                return;
              }
              const step = plan.steps.find((item) => item.id === node.id);
              if (!step) return;
              if (step.kind === 'finish' || step.kind === 'verify') {
                setOutputOpen(true);
                return;
              }
              if (step.kind === 'action') {
                setConfigOpen(true);
                return;
              }
              setStepDraft({ ...step });
            }}
            fitView
            fitViewOptions={{ padding: 0.17, minZoom: 0.25, maxZoom: 0.95 }}
            minZoom={0.15}
            maxZoom={1.8}
            proOptions={{ hideAttribution: false }}
            aria-label={
              growthTemplateId
                ? growthStage
                  ? `Compiled tasks for ${growthStage.title}`
                  : 'Growth workflow pipeline graph'
                : 'Editable workflow step graph'
            }
          >
            <Background
              variant={BackgroundVariant.Dots}
              color="#bdd0d3"
              gap={20}
            />
            <Controls
              showInteractive={false}
              className="!rounded-xl !bg-white"
            />
          </ReactFlow>
          {growthTemplateId && (
            <div className="pointer-events-none absolute top-20 left-3 z-10 flex max-w-[calc(100%-6rem)] flex-wrap items-center gap-2">
              {growthStage ? (
                <button
                  type="button"
                  onClick={() => {
                    setGrowthPipelineId(null);
                    setGrowthTaskId(null);
                  }}
                  aria-label="Back to pipelines"
                  className="pointer-events-auto inline-flex min-h-11 items-center gap-2 rounded-xl border border-slate-200 bg-white/95 px-3 text-xs font-semibold text-slate-800 shadow-sm focus-visible:outline-2 focus-visible:outline-teal-700"
                >
                  <ArrowLeft className="size-4" />
                  Back to pipelines
                </button>
              ) : (
                <span
                  role="status"
                  className="rounded-xl border border-slate-200 bg-white/95 px-3 py-2 text-xs font-semibold text-slate-800 shadow-sm"
                >
                  {growthProgram
                    ? `${growthProgram.stages.length} connected pipelines`
                    : plan.platform !== 'linkedin'
                      ? 'Growth workflows require a LinkedIn account.'
                      : growth.error || 'Loading workflow pipelines…'}
                </span>
              )}
              {growthStage && (
                <span className="max-w-[15rem] truncate rounded-xl border border-slate-200 bg-white/95 px-3 py-2 text-xs font-semibold text-slate-800 shadow-sm sm:max-w-xs">
                  {growthStage.title} · {growthStage.plan.steps.length} tasks
                </span>
              )}
              {growthStage && projectedPipeline?.runId && (
                <a
                  href={`/api/runs/${encodeURIComponent(projectedPipeline.runId)}/logs?since=0`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="pointer-events-auto rounded-xl border border-slate-200 bg-white/95 px-3 py-2 text-xs font-semibold text-teal-800 underline shadow-sm"
                >
                  Runner journal
                </a>
              )}
            </div>
          )}
          {growthTemplateId && growthStage && (
            <div className="pointer-events-none absolute bottom-3 left-14 z-10 max-w-[min(100%-8rem,32rem)] rounded-xl bg-white/90 px-3 py-2 text-[11px] text-slate-600 shadow">
              {growthProgram?.kind === 'GrowthBlueprintWorkflow'
                ? 'Planning-only tasks, not executable Runner operations.'
                : 'Select a task to inspect its compiled configuration and recorded evidence.'}
              {growthJournalError && (
                <span className="block text-amber-800">
                  {growthJournalError}
                </span>
              )}
            </div>
          )}
        </div>
        {!growthTemplateId && (
          <div className="pointer-events-none absolute bottom-3 left-14 z-10 max-w-[min(100%-8rem,28rem)] truncate rounded-lg bg-white/90 px-2.5 py-1.5 text-[11px] text-slate-600 shadow">
            Drag nodes to arrange · Drag a connector to reorder · Click to edit
          </div>
        )}
        <WorkflowEditorToolbar
          plan={plan}
          growthTemplateId={growthTemplateId}
          growthTitle={growthProgram?.title}
          onOpenGrowthDetails={() => setGrowthDetailsOpen(true)}
          connected={connected}
          accountLabel={accountLabel}
          busy={busy}
          saving={saving}
          dirty={dirty}
          onOpenTemplates={() => setTemplateOpen(true)}
          onReturnToWorkspace={requestWorkspaceReturn}
          onOpenAddStep={() => setAddOpen(true)}
          onSave={onSave}
          onSaveError={setEditorError}
          onOpenConfig={() => setConfigOpen(true)}
        />
      </div>
      <div className="flex flex-wrap justify-between gap-2 border-t border-slate-200 px-4 py-3 text-xs text-slate-600">
        {growthTemplateId ? (
          <>
            <span>
              {growthProgram?.kind === 'GrowthBlueprintWorkflow'
                ? 'Planning-only workflow'
                : `Growth execution: ${growthRun?.state ?? 'not started'}`}
              {growthRun?.id ? ` · ${growthRun.id.slice(0, 8)}` : ''}
            </span>
            <button
              type="button"
              onClick={() => setGrowthDetailsOpen(true)}
              className="min-h-10 font-bold text-teal-800 focus-visible:outline-2 focus-visible:outline-teal-700"
            >
              Run controls and evidence{' '}
              <ChevronRight className="inline size-4" />
            </button>
          </>
        ) : (
          <>
            <span>
              Live status:{' '}
              <strong className="capitalize">{state ?? 'idle'}</strong>
              {runId ? ` · ${runId.slice(0, 8)}` : ''}
            </span>
            <button
              type="button"
              onClick={() => setOutputOpen(true)}
              className="font-bold text-teal-800"
            >
              View recorded output <ChevronRight className="inline size-4" />
            </button>
          </>
        )}
      </div>
      <StudioDialog
        open={returnConfirmOpen}
        onDismiss={() => setReturnConfirmOpen(false)}
        title="Leave unsaved workflow?"
        description="Your unsaved edits will be lost. Existing saved revisions and recorded runs will not change."
        testId="workflow-leave-confirmation"
      >
        <div className="flex flex-wrap justify-end gap-2">
          <button
            type="button"
            onClick={() => setReturnConfirmOpen(false)}
            className="min-h-11 rounded-xl border border-slate-200 bg-white px-4 text-sm font-semibold text-slate-800 focus-visible:outline-2 focus-visible:outline-teal-700"
          >
            Keep editing
          </button>
          <button
            type="button"
            onClick={() => {
              setReturnConfirmOpen(false);
              onClearGrowth?.();
            }}
            className="min-h-11 rounded-xl bg-slate-950 px-4 text-sm font-semibold text-white focus-visible:outline-2 focus-visible:outline-teal-700"
          >
            Discard draft
          </button>
        </div>
      </StudioDialog>
      <WorkflowEditorDialogs
        configOpen={configOpen}
        onConfigDismiss={() => setConfigOpen(false)}
        templateOpen={templateOpen}
        onTemplateDismiss={() => setTemplateOpen(false)}
        addOpen={addOpen}
        onAddDismiss={() => setAddOpen(false)}
        outputOpen={outputOpen}
        onOutputDismiss={() => setOutputOpen(false)}
        editorError={editorError}
        onEditorError={setEditorError}
        saving={saving}
        busy={busy}
        onSave={onSave}
        plan={plan}
        templates={templates}
        connected={connected}
        onGrowthTemplateApply={onGrowthTemplateApply}
        onTemplateApply={onTemplateApply}
        onAddStep={add}
        choices={choices}
        state={state}
        runId={runId}
        events={events}
        evidenceRoot={evidenceRoot}
        onEvidenceOpen={onEvidenceOpen}
      >
        {children}
      </WorkflowEditorDialogs>
      <GrowthWorkspaceDialogs
        program={growthProgram}
        run={growthRun}
        endpoint={growth.endpoint}
        accountId={growthAccountId}
        busy={busy}
        working={growth.working}
        error={growth.error}
        execution={growthProjection}
        journalError={growthJournalError}
        detailsOpen={Boolean(growthTemplateId && growthDetailsOpen)}
        onDetailsClose={() => setGrowthDetailsOpen(false)}
        taskOpen={Boolean(growthTemplateId && growthTaskId)}
        onTaskClose={() => setGrowthTaskId(null)}
        stage={growthStage}
        taskId={growthTaskId}
        selectedAction={plan.action}
        onSelectAction={onGrowthActionSelect}
        setRun={growth.setRun}
        mutate={growth.mutate}
      />
      <WorkflowStepInspector
        stepDraft={stepDraft}
        onDismiss={() => setStepDraft(null)}
        stepForms={stepForms}
        stepFormsError={stepFormsError}
        onRetryStepForms={() => setStepFormsRequest((value) => value + 1)}
        plan={plan}
        events={events}
        choices={choices}
        busy={busy}
        onStepDraftChange={setStepDraft}
        onMoveSelected={moveSelected}
        onRemove={remove}
        onApply={applyStepDraft}
      />
    </section>
  );
}
export default function WorkflowPlanEditor(props: Props) {
  return (
    <ReactFlowProvider>
      <EditorBody key={props.growthTemplateId ?? 'saved-workflow'} {...props} />
    </ReactFlowProvider>
  );
}
