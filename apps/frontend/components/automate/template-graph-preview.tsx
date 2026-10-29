'use client';

import { useMemo } from 'react';
import {
  Background,
  BackgroundVariant,
  Controls,
  MarkerType,
  Position,
  ReactFlow,
  ReactFlowProvider,
  type Edge,
  type Node,
} from '@xyflow/react';
import type { WorkflowPlan } from './workflow-plan-editor';

/** Read-only preview of the same validated steps and links used by the artboard.
 * Positions are generated for the thumbnail only; the user's graph is unchanged.
 */
export default function TemplateGraphPreview({ plan }: { plan: WorkflowPlan }) {
  const { nodes, edges } = useMemo(() => {
    const order = new Map(plan.steps.map((step, index) => [step.id, index]));
    const nodes: Node[] = plan.steps.map((step, index) => {
      const row = Math.floor(index / 3);
      const col = row % 2 === 0 ? index % 3 : 2 - (index % 3);
      const action = step.kind === 'action';
      const review = step.kind === 'approve' || step.kind === 'pause';
      const color = action ? '#0f766e' : review ? '#a16207' : '#475569';
      return {
        id: step.id,
        type: 'default',
        position: { x: 20 + col * 200, y: 18 + row * 102 },
        sourcePosition: row % 2 === 0 ? Position.Right : Position.Left,
        targetPosition: row % 2 === 0 ? Position.Left : Position.Right,
        draggable: false,
        selectable: false,
        data: {
          label: (
            <div className="flex min-h-10 flex-col justify-center gap-1 text-left">
              <span
                className="text-[9px] font-semibold tracking-wider uppercase"
                style={{ color }}
              >
                {action
                  ? 'Action'
                  : review
                    ? 'Review'
                    : step.kind === 'verify'
                      ? 'Verification'
                      : 'Workflow'}
              </span>
              <span className="line-clamp-2 text-[11px] leading-4 font-semibold text-slate-900">
                {step.title}
              </span>
            </div>
          ),
        },
        style: {
          width: 166,
          minHeight: 64,
          borderRadius: 12,
          border:
            '1.5px solid ' +
            (action ? '#0d9488' : review ? '#d6b36b' : '#cbd5e1'),
          background: action ? '#f0fdfa' : review ? '#fffbeb' : '#ffffff',
          boxShadow: '0 2px 8px rgba(15,23,42,0.06)',
          padding: '7px 10px',
        },
      } satisfies Node;
    });
    const edges: Edge[] = plan.links
      .filter((link) => order.has(link.source) && order.has(link.target))
      .map((link, index) => ({
        id: 'preview-link-' + index,
        source: link.source,
        target: link.target,
        type: 'smoothstep',
        selectable: false,
        style: { stroke: '#0f766e', strokeWidth: 2 },
        markerEnd: { type: MarkerType.ArrowClosed, color: '#0f766e' },
      }));
    return { nodes, edges };
  }, [plan]);

  return (
    <div
      data-testid="template-graph-preview"
      aria-label={'Read-only workflow diagram with ' + nodes.length + ' stages'}
      role="group"
      className="relative h-60 w-full overflow-hidden rounded-xl border border-slate-200 bg-[#f5f8f9] sm:h-64"
    >
      <ReactFlowProvider>
        <ReactFlow
          nodes={nodes}
          edges={edges}
          fitView
          fitViewOptions={{ padding: 0.18, minZoom: 0.2, maxZoom: 1 }}
          minZoom={0.16}
          maxZoom={1.8}
          nodesDraggable={false}
          nodesConnectable={false}
          elementsSelectable={false}
          zoomOnScroll={false}
          preventScrolling={false}
          zoomOnPinch
          panOnDrag
          proOptions={{ hideAttribution: false }}
        >
          <Background
            variant={BackgroundVariant.Dots}
            gap={18}
            color="#cbd5e1"
          />
          <Controls
            showInteractive={false}
            position="bottom-left"
            className="!rounded-lg !border-slate-200 !bg-white"
          />
        </ReactFlow>
      </ReactFlowProvider>
      <span className="pointer-events-none absolute top-2 left-2 rounded-md bg-white/95 px-2 py-1 text-[10px] font-semibold text-slate-600 shadow-sm">
        Preview only
      </span>
    </div>
  );
}
