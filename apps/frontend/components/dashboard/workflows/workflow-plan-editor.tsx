'use client';

import Image from 'next/image';
import { useEffect, useMemo, useState, type ReactNode } from 'react';
import {
  ReactFlow,
  ReactFlowProvider,
  Background,
  BackgroundVariant,
  Controls,
  Position,
  MarkerType,
  useNodesState,
  type Edge,
  type Connection,
} from '@xyflow/react';
import {
  ChevronRight,
  Plus,
  Save,
  Settings2,
  Square,
  Trash2,
  ArrowUp,
  ArrowDown,
} from 'lucide-react';
import StudioDialog from '@/components/ui/studio-dialog';
import TemplateBrowser from './template-browser';
import StepCard from './workflow-step-card';
import { fixed } from './workflow-step-policy';
import type {
  StepKind,
  WorkflowStep,
  WorkflowPlan,
  RunEvent,
  FlowNode,
} from './workflow-types';
export type {
  StepKind,
  WorkflowStep,
  WorkflowPlan,
  RunEvent,
} from './workflow-types';
import GrowthProfilePipelines from '../growth/growth-profile-pipelines';

type Props = {
  plan: WorkflowPlan;
  templates: WorkflowPlan[];
  events: RunEvent[];
  state?: string;
  runId?: string;
  busy: boolean;
  dirty: boolean;
  saving: boolean;
  savedWorkflows: Array<{ id: string; revision: number; plan: WorkflowPlan }>;
  workflowId: string | null;
  onWorkflowSelect: (id: string | null) => void;
  onPlanChange: (plan: WorkflowPlan) => void;
  onTemplateApply: (plan: WorkflowPlan, templateId: string) => Promise<void>;
  onSave: () => Promise<void>;
  onStop: () => void;
  runError?: string;
  configRequest?: number;
  children: ReactNode;
  evidenceRoot?: string;
  onEvidenceOpen?: (runId: string, fileName: string) => void;
  connected: boolean;
  accountLabel?: string;
  growthTemplateId?: string | null;
  growthAccountId?: string;
  onGrowthTemplateApply?: (id: string) => Promise<void>;
  onClearGrowth?: () => void;
  onGrowthActionSelect?: (action: string) => void;
};
type StepFormField = {
  key: 'message' | 'delayMs' | 'expectedText';
  label: string;
  control: 'text' | 'textarea' | 'number';
  min?: number;
  max?: number;
};
type StepForm = {
  kind: StepKind;
  title: string;
  summary: string;
  fields: StepFormField[];
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
const nodeTypes = { step: StepCard };
function chain(plan: WorkflowPlan, steps: WorkflowStep[]): WorkflowPlan {
  return {
    ...plan,
    steps,
    links: steps
      .slice(1)
      .map((s, i) => ({ source: steps[i]!.id, target: s.id })),
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
    savedWorkflows,
    workflowId,
    onWorkflowSelect,
    onPlanChange,
    onTemplateApply,
    onSave,
    onStop,
    runError,
    configRequest = 0,
    children,
    evidenceRoot,
    onEvidenceOpen,
    connected,
    accountLabel,
    growthTemplateId,
    growthAccountId,
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
  const [outputOpen, setOutputOpen] = useState(false);
  const [editorError, setEditorError] = useState('');
  const [stepForms, setStepForms] = useState<
    Partial<Record<StepKind, StepForm>>
  >({});
  const [stepFormsError, setStepFormsError] = useState('');
  const [stepFormsRequest, setStepFormsRequest] = useState(0);
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
              'Step fields unavailable (HTTP ' + response.status + ').'
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
            error instanceof Error ? error.message : 'Step fields unavailable'
          );
      });
    return () => controller.abort();
  }, [stepFormsRequest]);
  const latest = useMemo(() => {
    const m = new Map<string, string>();
    for (const e of events)
      if (e.details?.stepId && e.details?.stage)
        m.set(e.details.stepId, e.details.stage);
    return m;
  }, [events]);
  const data = useMemo(
    () => ({
      nodes: plan.steps.map((step, i): FlowNode => ({
        id: step.id,
        type: 'step',
        position: step.position ?? {
          x: 50 + (i % 4) * 290,
          y: 70 + Math.floor(i / 4) * 230,
        },
        data: { step, index: i + 1, status: latest.get(step.id) ?? 'idle' },
        sourcePosition: Position.Right,
        targetPosition: Position.Left,
      })),
      edges: plan.links.map((link): Edge => ({
        id: link.source + '-to-' + link.target,
        source: link.source,
        target: link.target,
        type: 'smoothstep',
        markerEnd: { type: MarkerType.ArrowClosed, color: '#0f766e' },
        style: { stroke: '#0f766e', strokeWidth: 2 },
        animated: state === 'running' && latest.get(link.target) === 'started',
      })),
    }),
    [plan, latest, state]
  );
  const [nodes, setNodes, onNodesChange] = useNodesState(data.nodes);
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
        'Required core nodes cannot be moved. Connect an optional step instead.'
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
        'Add a connected evidence step before requesting approval.'
      );
      return;
    }
    const step: WorkflowStep = {
      id: 'step-' + crypto.randomUUID().slice(0, 8),
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
        plan.steps.filter((s) => s.id !== stepDraft.id)
      )
    );
    setStepDraft(null);
  }
  const images = events.filter(
    (e) =>
      e.kind === 'screenshot' &&
      /^[a-zA-Z0-9_-]+\.png$/.test(e.details?.fileName ?? '')
  );
  const observed = [...events]
    .reverse()
    .find(
      (e) =>
        e.kind === 'audit' &&
        (e.details?.headline || e.details?.bio || e.details?.excerpt)
    );
  const result = events.filter((e) => e.kind === 'result');
  return (
    <section
      data-testid="workflow-artboard"
      className="flex h-full min-h-[630px] flex-col overflow-hidden rounded-3xl border border-slate-200/90 bg-white shadow-sm lg:min-h-[calc(100dvh-8rem)]"
    >
      <div className="flex flex-wrap items-center justify-between gap-4 border-b border-slate-200 px-4 py-4 sm:px-5 sm:py-5">
        <div className="max-w-xl space-y-1.5">
          <h2 className="text-base font-semibold tracking-tight text-slate-950">
            Workflow artboard
          </h2>
          <p className="text-xs leading-5 text-slate-500">
            {growthTemplateId
              ? 'Growth · connected pipelines with nested executable tasks'
              : plan.name + ' · ' + plan.steps.length + ' pipeline tasks'}
          </p>
          <p
            role="status"
            data-testid="workflow-run-readiness"
            className={
              'mt-1 text-[11px] ' +
              (connected ? 'text-teal-800' : 'text-amber-800')
            }
          >
            {plan.platform === 'linkedin'
              ? connected
                ? 'Execution target: ' +
                  (accountLabel || 'Selected LinkedIn account') +
                  '. The server verifies this account when you run.'
                : 'You can edit this workflow now. Connect and sync the selected LinkedIn account to run it.'
              : 'A supported, verified account connection is required to run this workflow.'}
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          {!growthTemplateId && (
            <select
              aria-label="Saved workflow"
              value={workflowId ?? ''}
              disabled={busy || saving || dirty}
              onChange={(event) => onWorkflowSelect(event.target.value || null)}
              className="min-h-10 max-w-[220px] rounded-xl border border-slate-200 bg-white px-2 text-xs font-bold disabled:opacity-40"
            >
              <option value="">Action default (unsaved)</option>
              {savedWorkflows
                .filter((item) => item.plan.platform === plan.platform)
                .map((item) => (
                  <option key={item.id} value={item.id}>
                    {item.plan.name} · r{item.revision}
                  </option>
                ))}
            </select>
          )}
          <button
            type="button"
            aria-label="Choose workflow template"
            disabled={busy}
            onClick={() => setTemplateOpen(true)}
            className="min-h-10 rounded-xl border border-slate-200 px-3 text-xs font-bold disabled:opacity-40"
          >
            Templates
          </button>
          {growthTemplateId && (
            <button
              type="button"
              onClick={onClearGrowth}
              className="min-h-10 rounded-xl border border-slate-200 px-3 text-xs font-bold"
            >
              Action workflows
            </button>
          )}
          {!growthTemplateId && (
            <button
              type="button"
              aria-label="Add workflow step"
              disabled={busy}
              onClick={() => setAddOpen(true)}
              className="flex min-h-10 items-center gap-1 rounded-xl border border-slate-200 px-3 text-xs font-bold disabled:opacity-40"
            >
              <Plus className="size-4" />
              Add step
            </button>
          )}
          {!growthTemplateId && (
            <button
              type="button"
              aria-label="Save workflow"
              disabled={busy || saving || !dirty}
              onClick={() => {
                void onSave().catch((error) =>
                  setEditorError(
                    error instanceof Error
                      ? error.message
                      : 'Could not save workflow'
                  )
                );
              }}
              className="flex min-h-10 items-center gap-1 rounded-xl border border-slate-200 px-3 text-xs font-bold disabled:opacity-40"
            >
              <Save className="size-4" />
              {saving ? 'Saving…' : dirty ? 'Save changes' : 'Saved'}
            </button>
          )}
          {!growthTemplateId && (
            <button
              type="button"
              aria-label="Configure action"
              onClick={() => setConfigOpen(true)}
              className="flex min-h-10 items-center gap-1 rounded-xl border border-slate-200 px-3 text-xs font-bold"
            >
              <Settings2 className="size-4" />
              Config
            </button>
          )}
          {!growthTemplateId && (
            <button
              type="button"
              aria-label="Stop workflow"
              disabled={!busy}
              onClick={onStop}
              className="flex min-h-10 items-center gap-2 rounded-xl border border-rose-200 px-3 text-xs font-semibold text-rose-700 disabled:opacity-30"
            >
              <Square className="size-3.5" />
              Stop
            </button>
          )}
        </div>
      </div>
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
        {growthTemplateId ? (
          <div className="h-full max-h-[calc(100dvh-9rem)] overflow-y-auto p-3">
            <GrowthProfilePipelines
              templateId={growthTemplateId}
              platform={plan.platform}
              selectedAction={plan.action}
              busy={busy}
              accountId={growthAccountId}
              onExit={onClearGrowth}
              onSelectAction={onGrowthActionSelect ?? (() => undefined)}
            />
          </div>
        ) : (
          <ReactFlow
            nodes={nodes}
            edges={data.edges}
            nodeTypes={nodeTypes}
            onNodesChange={onNodesChange}
            nodesConnectable={canEdit}
            edgesReconnectable={false}
            deleteKeyCode={null}
            onConnect={(link: Connection) => reorder(link.source, link.target)}
            onNodeDragStop={(_, node) => {
              if (!busy)
                update({
                  ...plan,
                  steps: plan.steps.map((s) =>
                    s.id === node.id ? { ...s, position: node.position } : s
                  ),
                });
            }}
            onNodeClick={(_, node) => {
              const step = plan.steps.find((s) => s.id === node.id)!;
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
        )}
        {!growthTemplateId && (
          <div className="pointer-events-none absolute top-3 left-3 rounded-lg bg-white/90 px-2.5 py-1.5 text-[11px] text-slate-600 shadow">
            Drag nodes to arrange · Drag connector to insert/reorder optional
            tasks · Click to edit
          </div>
        )}
      </div>
      {!growthTemplateId && (
        <div className="flex flex-wrap justify-between gap-2 border-t border-slate-200 px-4 py-3 text-xs text-slate-600">
          <span>
            Live status:{' '}
            <strong className="capitalize">{state ?? 'idle'}</strong>
            {runId ? ' · ' + runId.slice(0, 8) : ''}
          </span>
          <button
            type="button"
            onClick={() => setOutputOpen(true)}
            className="font-bold text-teal-800"
          >
            View recorded output <ChevronRight className="inline size-4" />
          </button>
        </div>
      )}
      <StudioDialog
        open={configOpen}
        onDismiss={() => setConfigOpen(false)}
        title="Configure workflow action"
        description="Set the account, page scope and supported action fields. Use the main Start button when ready."
        size="wide"
        testId="workflow-configuration-dialog"
      >
        {children}
        {editorError && (
          <p
            role="alert"
            className="mt-3 rounded-lg bg-rose-50 p-2 text-xs text-rose-800"
          >
            {editorError}
          </p>
        )}
        <div className="mt-4 border-t border-slate-200 pt-4">
          <button
            type="button"
            onClick={() => {
              setEditorError('');
              void onSave()
                .then(() => setConfigOpen(false))
                .catch((error) =>
                  setEditorError(
                    error instanceof Error
                      ? error.message
                      : 'Could not save workflow'
                  )
                );
            }}
            disabled={saving || busy}
            className="min-h-10 rounded-xl bg-slate-950 px-4 text-xs font-bold text-white disabled:opacity-40"
          >
            Save configuration
          </button>
        </div>
      </StudioDialog>
      <StudioDialog
        open={templateOpen}
        onDismiss={() => setTemplateOpen(false)}
        title="Workflow template library"
        description="Preview a pipeline and load it onto the dashboard. Connecting your account is required only when running it."
        size="wide"
        scrollMode="contained"
        testId="workflow-template-dialog"
      >
        <TemplateBrowser
          activePlatform={plan.platform}
          templates={templates}
          connected={connected}
          onGrowthApply={onGrowthTemplateApply}
          onApply={onTemplateApply}
          onApplied={() => setTemplateOpen(false)}
        />
      </StudioDialog>
      <StudioDialog
        open={addOpen}
        onDismiss={() => setAddOpen(false)}
        title="Add executable step"
        description="Each new node is inserted before the action. Reconnect or reorder it as needed."
        size="wide"
        testId="workflow-add-step-dialog"
      >
        <div className="grid gap-2 sm:grid-cols-2">
          {choices.map((item) => (
            <button
              type="button"
              key={item.kind}
              onClick={() => add(item.kind)}
              className="rounded-xl border border-slate-200 p-3 text-left hover:border-teal-500 hover:bg-teal-50"
            >
              <span className="text-xs font-bold">{item.name}</span>
              <p className="mt-1 text-[11px] text-slate-600">{item.help}</p>
            </button>
          ))}
        </div>
      </StudioDialog>
      <StudioDialog
        open={Boolean(stepDraft)}
        onDismiss={() => setStepDraft(null)}
        title={
          stepDraft
            ? (stepForms[stepDraft.kind]?.title ?? 'Edit workflow step')
            : 'Edit workflow step'
        }
        description={
          stepDraft
            ? (stepForms[stepDraft.kind]?.summary ??
              'Changes to this step are saved as part of your workflow.')
            : 'Changes to this step are saved as part of your workflow.'
        }
        testId="workflow-step-dialog"
      >
        {stepDraft && (
          <div className="space-y-4">
            <p className="text-xs font-semibold text-slate-500">
              Type: {stepDraft.kind} ·{' '}
              {fixed.has(stepDraft.kind)
                ? 'Required core stage'
                : 'Optional editable stage'}
            </p>
            <label className="block text-xs font-bold">
              Step title
              <input
                aria-label="Step title"
                value={stepDraft.title}
                maxLength={100}
                onChange={(e) =>
                  setStepDraft({ ...stepDraft, title: e.target.value })
                }
                className="mt-1.5 min-h-10 w-full rounded-lg border border-slate-200 px-3 text-sm"
              />
            </label>
            {!fixed.has(stepDraft.id) && (
              <label className="block text-xs font-bold">
                Node behavior
                <select
                  aria-label="Node behavior"
                  value={stepDraft.kind}
                  onChange={(e) => {
                    const kind = e.target.value as StepKind;
                    setStepDraft({
                      ...stepDraft,
                      kind,
                      ...(kind === 'delay'
                        ? { delayMs: stepDraft.delayMs ?? 1000 }
                        : { delayMs: undefined }),
                      ...(kind === 'note' || kind === 'stop'
                        ? { message: stepDraft.message ?? '' }
                        : { message: undefined }),
                      ...(kind === stepDraft.kind
                        ? {}
                        : {
                            inputBindings:
                              kind === 'evidence'
                                ? {
                                    observation: (() => {
                                      const prior = plan.steps
                                        .slice(
                                          0,
                                          plan.steps.findIndex(
                                            (item) => item.id === stepDraft.id
                                          )
                                        )
                                        .findLast(
                                          (item) =>
                                            item.kind === 'inspect' ||
                                            item.kind === 'verify'
                                        );
                                      return prior
                                        ? {
                                            stepId: prior.id,
                                            field: 'excerpt' as const,
                                          }
                                        : undefined;
                                    })(),
                                  }
                                : kind === 'approve'
                                  ? {
                                      evidence: (() => {
                                        const prior = plan.steps
                                          .slice(
                                            0,
                                            plan.steps.findIndex(
                                              (item) => item.id === stepDraft.id
                                            )
                                          )
                                          .findLast(
                                            (item) => item.kind === 'evidence'
                                          );
                                        return prior
                                          ? {
                                              stepId: prior.id,
                                              field: 'digest' as const,
                                            }
                                          : undefined;
                                      })(),
                                    }
                                  : undefined,
                          }),
                    });
                  }}
                  className="mt-1.5 min-h-10 w-full rounded-lg border border-slate-200 px-3 text-sm"
                >
                  {choices.map((item) => (
                    <option key={item.kind} value={item.kind}>
                      {item.name}
                    </option>
                  ))}
                </select>
              </label>
            )}
            {stepForms[stepDraft.kind]?.fields.map((field) => (
              <label key={field.key} className="block text-xs font-bold">
                {field.label}
                {field.control === 'textarea' ? (
                  <textarea
                    aria-label={field.label}
                    rows={3}
                    maxLength={field.max}
                    value={String(stepDraft[field.key] ?? '')}
                    onChange={(e) =>
                      setStepDraft({
                        ...stepDraft,
                        [field.key]: e.target.value,
                      })
                    }
                    className="mt-1.5 w-full rounded-lg border border-slate-200 p-3 text-sm"
                  />
                ) : (
                  <input
                    aria-label={field.label}
                    type={field.control === 'number' ? 'number' : 'text'}
                    min={field.min}
                    max={field.min === undefined ? undefined : field.max}
                    maxLength={
                      field.control !== 'number' ? field.max : undefined
                    }
                    value={String(stepDraft[field.key] ?? '')}
                    onChange={(e) =>
                      setStepDraft({
                        ...stepDraft,
                        [field.key]:
                          field.control === 'number'
                            ? Number(e.target.value)
                            : e.target.value,
                      })
                    }
                    className="mt-1.5 min-h-10 w-full rounded-lg border border-slate-200 px-3 text-sm"
                  />
                )}
              </label>
            ))}
            {stepFormsError && (
              <div
                role="alert"
                className="flex flex-wrap items-center gap-2 text-xs text-rose-700"
              >
                <span>
                  {stepFormsError} Step fields cannot be edited safely until
                  they load.
                </span>
                <button
                  type="button"
                  className="min-h-9 rounded-lg border border-rose-300 px-3 font-semibold"
                  onClick={() => setStepFormsRequest((value) => value + 1)}
                >
                  Retry loading fields
                </button>
              </div>
            )}
            {stepDraft.kind === 'note' && (
              <label className="block text-xs font-bold">
                Note input from earlier step
                <select
                  aria-label="Note input from earlier step"
                  value={
                    stepDraft.inputBindings?.message
                      ? stepDraft.inputBindings.message.stepId +
                        ':' +
                        stepDraft.inputBindings.message.field
                      : ''
                  }
                  onChange={(event) => {
                    const selected = event.target.value;
                    const [stepId, field] = selected.split(':');
                    setStepDraft({
                      ...stepDraft,
                      inputBindings:
                        stepId && ['url', 'excerpt'].includes(field)
                          ? {
                              message: {
                                stepId,
                                field: field as 'url' | 'excerpt',
                              },
                            }
                          : undefined,
                    });
                  }}
                  className="mt-1.5 min-h-10 w-full rounded-lg border border-slate-200 px-3 text-sm"
                >
                  <option value="">Static message above</option>
                  {plan.steps
                    .slice(
                      0,
                      plan.steps.findIndex((item) => item.id === stepDraft.id)
                    )
                    .filter(
                      (item) =>
                        item.kind === 'inspect' || item.kind === 'verify'
                    )
                    .flatMap((item) => [
                      <option
                        key={item.id + ':excerpt'}
                        value={item.id + ':excerpt'}
                      >
                        {item.title}: observed excerpt
                      </option>,
                      <option key={item.id + ':url'} value={item.id + ':url'}>
                        {item.title}: observed URL
                      </option>,
                    ])}
                </select>
                <span className="mt-1 block text-[11px] font-normal text-slate-500">
                  Uses the real observation recorded earlier in this run, not an
                  AI-generated message.
                </span>
              </label>
            )}
            {stepDraft.kind === 'evidence' && (
              <label className="block text-xs font-bold">
                Observed evidence source
                <select
                  aria-label="Observed evidence source"
                  value={stepDraft.inputBindings?.observation?.stepId ?? ''}
                  onChange={(e) =>
                    setStepDraft({
                      ...stepDraft,
                      inputBindings: e.target.value
                        ? {
                            observation: {
                              stepId: e.target.value,
                              field: 'excerpt',
                            },
                          }
                        : undefined,
                    })
                  }
                  className="mt-1.5 min-h-10 w-full rounded-lg border border-slate-200 px-3 text-sm"
                >
                  <option value="">Select an earlier observation</option>
                  {plan.steps
                    .slice(
                      0,
                      plan.steps.findIndex((item) => item.id === stepDraft.id)
                    )
                    .filter(
                      (item) =>
                        item.kind === 'inspect' || item.kind === 'verify'
                    )
                    .map((item) => (
                      <option key={item.id} value={item.id}>
                        {item.title} · excerpt
                      </option>
                    ))}
                </select>
              </label>
            )}
            {stepDraft.kind === 'approve' && (
              <label className="block text-xs font-bold">
                Evidence requiring owner approval
                <select
                  aria-label="Evidence requiring owner approval"
                  value={stepDraft.inputBindings?.evidence?.stepId ?? ''}
                  onChange={(e) =>
                    setStepDraft({
                      ...stepDraft,
                      inputBindings: e.target.value
                        ? {
                            evidence: {
                              stepId: e.target.value,
                              field: 'digest',
                            },
                          }
                        : undefined,
                    })
                  }
                  className="mt-1.5 min-h-10 w-full rounded-lg border border-slate-200 px-3 text-sm"
                >
                  <option value="">Select an earlier evidence step</option>
                  {plan.steps
                    .slice(
                      0,
                      plan.steps.findIndex((item) => item.id === stepDraft.id)
                    )
                    .filter((item) => item.kind === 'evidence')
                    .map((item) => (
                      <option key={item.id} value={item.id}>
                        {item.title} · SHA-256
                      </option>
                    ))}
                </select>
                <span className="mt-1 block text-[11px] font-normal text-slate-500">
                  Separate approval is still required for any later provider
                  write.
                </span>
              </label>
            )}
            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                onClick={() => moveSelected(-1)}
                disabled={fixed.has(stepDraft.id) || busy}
                aria-label="Move step earlier"
                className="min-h-10 rounded-lg border px-3 text-xs disabled:opacity-30"
              >
                <ArrowUp className="mr-1 inline size-4" />
                Earlier
              </button>
              <button
                type="button"
                onClick={() => moveSelected(1)}
                disabled={fixed.has(stepDraft.id) || busy}
                aria-label="Move step later"
                className="min-h-10 rounded-lg border px-3 text-xs disabled:opacity-30"
              >
                <ArrowDown className="mr-1 inline size-4" />
                Later
              </button>
              <button
                type="button"
                onClick={remove}
                disabled={fixed.has(stepDraft.id) || busy}
                aria-label="Remove workflow step"
                className="min-h-10 rounded-lg border border-rose-200 px-3 text-xs text-rose-700 disabled:opacity-30"
              >
                <Trash2 className="mr-1 inline size-4" />
                Remove
              </button>
              <button
                type="button"
                onClick={() => {
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
                    (stepDraft.kind === 'approve' &&
                      !stepDraft.inputBindings?.evidence)
                  ) {
                    setEditorError(
                      'This step requires a preceding typed source binding.'
                    );
                    return;
                  }
                  update({
                    ...plan,
                    steps: plan.steps.map((s) =>
                      s.id === stepDraft.id ? stepDraft : s
                    ),
                  });
                  setStepDraft(null);
                }}
                disabled={busy || Boolean(stepFormsError)}
                className="ml-auto min-h-10 rounded-lg bg-slate-950 px-4 text-xs font-bold text-white disabled:opacity-30"
              >
                Apply node changes
              </button>
            </div>
            <div className="border-t border-slate-100 pt-3">
              <h3 className="mb-2 text-xs font-bold">Recorded node events</h3>
              {events
                .filter((e) => e.details?.stepId === stepDraft.id)
                .map((e, i) => (
                  <p key={i} className="py-1 text-xs text-slate-600">
                    {e.message}
                  </p>
                ))}
              {!events.some((e) => e.details?.stepId === stepDraft.id) && (
                <p className="text-xs text-slate-400">
                  No execution events for this node yet.
                </p>
              )}
            </div>
          </div>
        )}
      </StudioDialog>
      <StudioDialog
        open={outputOpen}
        onDismiss={() => setOutputOpen(false)}
        title="Final workflow output"
        description="Source-backed browser evidence and recorded execution events, never a fabricated profile preview."
        size="wide"
        testId="workflow-output-dialog"
      >
        <div data-testid="workflow-output" className="space-y-4">
          <p className="rounded-xl bg-slate-950 p-4 text-sm font-semibold text-white capitalize">
            {state ?? 'No run'} · {runId ?? 'No run selected'}
          </p>
          {result.length ? (
            result.map((e, i) => (
              <p
                key={i}
                className="rounded-xl border border-teal-200 bg-teal-50 p-3 text-xs text-teal-900"
              >
                {e.message}
              </p>
            ))
          ) : (
            <p className="text-xs text-slate-500">
              No verified result event recorded.
            </p>
          )}
          {observed?.details && (
            <div
              data-testid="observed-profile-preview"
              className="rounded-xl border border-slate-200 p-4"
            >
              <p className="mb-2 text-xs font-bold">Observed page content</p>
              <p className="text-sm font-semibold">
                {observed.details.title ??
                  observed.details.xName ??
                  'Observed page'}
              </p>
              <p className="mt-2 text-xs whitespace-pre-wrap text-slate-600">
                {observed.details.headline ??
                  observed.details.bio ??
                  observed.details.excerpt ??
                  ''}
              </p>
            </div>
          )}
          <div className="grid gap-3 sm:grid-cols-2">
            {images.map((e, i) => (
              <div
                key={i}
                className="overflow-hidden rounded-xl border border-slate-200"
              >
                {evidenceRoot && (
                  <button
                    type="button"
                    onClick={() => {
                      setOutputOpen(false);
                      if (runId && e.details?.fileName)
                        onEvidenceOpen?.(runId, e.details.fileName);
                    }}
                    className="block w-full"
                  >
                    <Image
                      unoptimized
                      src={evidenceRoot + e.details!.fileName}
                      alt={e.message}
                      width={640}
                      height={420}
                      className="w-full object-contain"
                    />
                  </button>
                )}
                <p className="p-2 text-xs">{e.message}</p>
              </div>
            ))}
          </div>
          <h3 className="text-xs font-bold">Run event journal</h3>
          <div className="max-h-52 overflow-y-auto">
            {events.map((e, i) => (
              <p
                key={i}
                className="border-b border-slate-100 py-1 text-xs text-slate-600"
              >
                <strong className="uppercase">{e.kind} </strong>
                {e.message}
              </p>
            ))}
          </div>
        </div>
      </StudioDialog>
    </section>
  );
}
export default function WorkflowPlanEditor(props: Props) {
  return (
    <ReactFlowProvider>
      <EditorBody {...props} />
    </ReactFlowProvider>
  );
}
