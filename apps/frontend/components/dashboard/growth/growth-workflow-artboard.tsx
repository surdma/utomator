'use client';

import { useMemo, useState } from 'react';
import {
  Background,
  BackgroundVariant,
  Controls,
  MarkerType,
  ReactFlow,
  ReactFlowProvider,
  type Edge,
} from '@xyflow/react';
import { ArrowLeft, GitBranch, ShieldCheck } from 'lucide-react';
import { GrowthGraphNodeCard } from './artboard/growth-graph-node-card';
import {
  buildGrowthGraph,
  type GrowthGraphNode,
  type GrowthGraphProgram,
  type GrowthGraphRun,
} from './growth-graph-model';
import { useGrowthRunJournal } from '../../../hooks/use-growth-run-journal';

export type { GrowthGraphProgram, GrowthGraphRun } from './growth-graph-model';

const nodeTypes = { growthNode: GrowthGraphNodeCard };
function GraphContent({
  program,
  run,
}: {
  program: GrowthGraphProgram;
  run: GrowthGraphRun;
}) {
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const designOnly = program.kind === 'GrowthBlueprintWorkflow';
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
                ? designOnly
                  ? 'Owner-operated YAML tasks, procedures, actions, events and verification. These steps do not execute.'
                  : 'Real task chain from the validated Runner plan. Red identifies the exact failed task.'
                : designOnly
                  ? 'Select a pipeline to inspect its planned tasks and handoffs.'
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
