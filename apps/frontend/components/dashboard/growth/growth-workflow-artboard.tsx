'use client';

import { useMemo, useState } from 'react';
import {
  Background,
  BackgroundVariant,
  Controls,
  Handle,
  MarkerType,
  Position,
  ReactFlow,
  ReactFlowProvider,
  type Edge,
  type NodeProps,
} from '@xyflow/react';
import { ArrowLeft, AlertCircle, GitBranch, ShieldCheck } from 'lucide-react';
import {
  buildGrowthGraph,
  type GrowthGraphNode,
  type GrowthGraphProgram,
  type GrowthGraphRun,
} from './growth-graph-model';
import { useGrowthRunJournal } from '../../../hooks/use-growth-run-journal';

export type { GrowthGraphProgram, GrowthGraphRun } from './growth-graph-model';

const statuses = {
  failed: 'border-rose-600 bg-rose-50 ring-2 ring-rose-200',
  blocked: 'border-rose-500 bg-rose-50 ring-2 ring-rose-100',
  cancelled: 'border-slate-400 bg-slate-100',
  completed: 'border-emerald-500 bg-emerald-50',
  running: 'border-sky-500 bg-sky-50',
  paused: 'border-amber-400 bg-amber-50',
  'approval-needed': 'border-amber-500 bg-amber-50',
  'input-needed': 'border-amber-500 bg-amber-50',
} as Record<string, string>;
function GraphNodeCard({ data, selected }: NodeProps<GrowthGraphNode>) {
  const failed = data.state === 'failed' || data.state === 'blocked';
  return (
    <div
      data-testid={
        data.kind === 'pipeline'
          ? 'growth-pipeline-node-' + data.nodeId
          : 'growth-task-node-' + data.nodeId
      }
      className={
        'w-[245px] rounded-xl border-2 p-3 text-left shadow-sm transition ' +
        (statuses[data.state] ?? 'border-slate-200 bg-white') +
        (selected ? ' outline outline-2 outline-offset-2 outline-teal-700' : '')
      }
    >
      <Handle
        type="target"
        position={Position.Left}
        className="!size-2.5 !border-white !bg-slate-600"
      />
      <div className="flex items-center justify-between gap-2">
        <span className="text-[10px] font-bold tracking-[.1em] text-slate-500 uppercase">
          {data.kind === 'pipeline' ? 'Pipeline' : 'Task'}
        </span>
        <span
          className={
            'text-[10px] font-semibold capitalize ' +
            (failed ? 'text-rose-800' : 'text-slate-600')
          }
        >
          {data.state}
        </span>
      </div>
      <p className="mt-2 text-sm leading-snug font-semibold text-slate-950">
        {data.label}
      </p>
      <p className="mt-1 text-[11px] leading-5 text-slate-600">
        {data.subtitle}
      </p>
      {data.failure && (
        <p className="mt-2 line-clamp-2 text-[11px] font-semibold text-rose-800">
          <AlertCircle className="mr-1 inline size-3" />
          {data.failure}
        </p>
      )}
      <Handle
        type="source"
        position={Position.Right}
        className="!size-2.5 !border-white !bg-slate-600"
      />
    </div>
  );
}
const nodeTypes = { growthNode: GraphNodeCard };
function GraphContent({
  program,
  run,
}: {
  program: GrowthGraphProgram;
  run: GrowthGraphRun;
}) {
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const selected =
    program.stages.find((stage) => stage.id === selectedId) ?? null;
  const live = run?.pipelineRuns.find((item) => item.id === selectedId);
  const childRunId = live?.childRunId ?? null;
  const { journal, logError } = useGrowthRunJournal(childRunId);
  const { nodes, edges } = useMemo(() => {
    const graph = buildGrowthGraph(program, run, selected, journal, live);
    return {
      ...graph,
      edges: graph.edges.map((edge) => ({
        ...edge,
        markerEnd: { type: MarkerType.ArrowClosed },
      })),
    };
  }, [program, run, selected, journal, live]);

  return (
    <section
      data-testid="growth-nested-artboard"
      className="overflow-hidden rounded-2xl border border-slate-200 bg-white"
    >
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-200 p-4">
        <div className="flex items-center gap-3">
          {selected && (
            <button
              type="button"
              onClick={() => setSelectedId(null)}
              aria-label="Back to pipelines"
              className="grid size-10 place-items-center rounded-lg border border-slate-200 text-slate-700"
            >
              <ArrowLeft className="size-4" />
            </button>
          )}
          <div>
            <p className="text-xs font-bold tracking-wider text-teal-800 uppercase">
              {selected
                ? 'Pipeline tasks'
                : 'Growth workflow · connected pipelines'}
            </p>
            <h3 className="mt-1 text-base font-bold text-slate-950">
              {selected?.title ?? program.title}
            </h3>
            <p className="text-[11px] text-slate-500">
              {selected
                ? 'Real task chain from the validated Runner plan. Red identifies the exact failed task.'
                : 'Select a pipeline to inspect session, authentication, actions, verification and approval tasks.'}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2 text-xs font-semibold text-slate-600">
          <GitBranch className="size-4" />
          {nodes.length} {selected ? 'tasks' : 'pipelines'}
        </div>
      </div>
      <div
        className="h-[470px] bg-[#f5f8f9] sm:h-[570px]"
        data-testid="growth-workflow-graph"
      >
        <ReactFlow<GrowthGraphNode, Edge>
          key={program.id + '/' + (selected?.id ?? 'pipelines')}
          nodes={nodes}
          edges={edges}
          nodeTypes={nodeTypes}
          nodesDraggable={false}
          nodesConnectable={false}
          edgesReconnectable={false}
          elementsSelectable
          onNodeClick={
            selected ? undefined : (_, node) => setSelectedId(node.id)
          }
          fitView
          fitViewOptions={{ padding: 0.2, minZoom: 0.2, maxZoom: 0.95 }}
          minZoom={0.15}
          maxZoom={1.8}
        >
          <Background
            variant={BackgroundVariant.Dots}
            color="#cbd5e1"
            gap={22}
          />
          <Controls showInteractive={false} />
        </ReactFlow>
      </div>
      {selected && (
        <div className="space-y-3 border-t border-slate-200 p-4">
          <div className="flex items-start gap-2 text-xs text-slate-600">
            <ShieldCheck className="mt-0.5 size-4 shrink-0 text-teal-700" />
            <span>
              Coverage:{' '}
              {selected.sectionIds
                .map(
                  (id) => program.coverage.find((x) => x.id === id)?.label ?? id
                )
                .join(' · ')}
            </span>
          </div>
          {live?.error && (
            <p
              role="alert"
              className="rounded-lg border border-rose-200 bg-rose-50 p-3 text-xs text-rose-900"
            >
              Pipeline failed: {live.error}. The highlighted task is the failure
              source recorded by the Runner.
            </p>
          )}
          {logError && (
            <p role="status" className="text-xs text-amber-800">
              {logError}
            </p>
          )}
          {childRunId && (
            <a
              className="text-xs font-semibold text-teal-800 underline"
              href={'/api/runs/' + childRunId + '/logs'}
              target="_blank"
              rel="noopener noreferrer"
            >
              Inspect complete child Runner journal
            </a>
          )}
        </div>
      )}
    </section>
  );
}
export default function GrowthWorkflowArtboard(props: {
  program: GrowthGraphProgram;
  run: GrowthGraphRun;
}) {
  return (
    <ReactFlowProvider>
      <GraphContent key={props.program.id} {...props} />
    </ReactFlowProvider>
  );
}
