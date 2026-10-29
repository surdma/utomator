'use client';

import {
  useCallback,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
  type MouseEvent,
} from 'react';
import {
  ReactFlow,
  ReactFlowProvider,
  Background,
  BackgroundVariant,
  Controls,
  useNodesState,
  useEdgesState,
  useReactFlow,
} from '@xyflow/react';
import StudioDialog from '@/components/ui/studio-dialog';
import StageNode from './workflow-artboard-node';
import WorkflowOutputDialog from './workflow-artboard-output-dialog';
import WorkflowAnnotationDialog from './workflow-artboard-annotation-dialog';
import {
  Activity,
  Check,
  ChevronDown,
  CircleDot,
  Eye,
  GitBranch,
  LockKeyhole,
  MousePointer2,
  Play,
  Waypoints,
  Zap,
} from 'lucide-react';

import {
  buildGraph,
  type CanvasEvent,
  type TaggedAnnotationReview,
  type CanvasWorkflow,
  type Phase,
  type StudioNode,
  type StudioEdge,
} from './workflow-artboard-graph';
export type {
  CanvasEvent,
  TaggedAnnotationReview,
  CanvasWorkflow,
} from './workflow-artboard-graph';

type Popup = { kind: 'node' | 'edge'; id: string; x: number; y: number } | null;

const descriptions: Record<Phase, string> = {
  start: 'Single account and one declared task',
  session: 'Signed-in Chrome session; manual challenge if required',
  inspect: 'Live profile and selectors, not archived HTML',
  annotation:
    'Operator-tagged image geometry and YAML instructions; not executed browser clicks',
  action: 'Only the selected Fastify/Playwright handler runs',
  approval: 'Mandatory operator decision before mutation',
  verify: 'Re-read the changed value or saved evidence',
  finish: 'Terminal result and event journal',
};

const nodeTypes = { studio: StageNode };

interface Props {
  platform: 'linkedin' | 'x';
  action: string;
  actionLabel: string;
  actions: CanvasWorkflow[];
  state?: string;
  runId?: string;
  events: CanvasEvent[];
  onActionChange: (action: string) => void;
  onNodeFocus?: (nodeId: string) => void;
  scopeLabel?: string;
  reviewCount?: number;
  inspectorRequest?: number;
  taggedReviews?: TaggedAnnotationReview[];
  evidenceRoot?: string;
  onEvidenceOpen?: (runId: string, fileName: string) => void;
  children: ReactNode;
}
function CanvasInner({
  platform,
  action,
  actionLabel,
  actions,
  state,
  runId,
  events,
  onActionChange,
  onNodeFocus,
  scopeLabel,
  reviewCount = 0,
  inspectorRequest = 0,
  taggedReviews = [],
  evidenceRoot,
  onEvidenceOpen,
  children,
}: Props) {
  const graph = useMemo(
    () =>
      buildGraph(action, actionLabel, state, events, taggedReviews.length > 0),
    [action, actionLabel, state, events, taggedReviews.length]
  );
  const { fitView } = useReactFlow();
  const [nodes, setNodes, onNodesChange] = useNodesState<StudioNode>(
    graph.nodes
  );
  const [edges, setEdges, onEdgesChange] = useEdgesState<StudioEdge>(
    graph.edges
  );
  const [focused, setFocused] = useState<string | null>('inspect');
  const [selectedEdge, setSelectedEdge] = useState<string | null>(null);
  const [popup, setPopup] = useState<Popup>(null);
  const [showActions, setShowActions] = useState(false);
  const [inspector, setInspector] = useState(false);
  const [detail, setDetail] = useState<
    'output' | 'annotation' | 'stage' | null
  >(null);
  useEffect(() => {
    if (inspectorRequest <= 0) return;
    const frame = requestAnimationFrame(() => setInspector(true));
    return () => cancelAnimationFrame(frame);
  }, [inspectorRequest]);
  useEffect(() => {
    if (!runId) return;
    const frame = requestAnimationFrame(() => setInspector(false));
    return () => cancelAnimationFrame(frame);
  }, [runId]);
  const [notice, setNotice] = useState(
    'Select nodes or right-click a connection to inspect it.'
  );
  useEffect(() => {
    // Apply graph telemetry after paint so interaction state is not updated during effect setup.
    const frame = requestAnimationFrame(() => {
      setNodes((previous) => {
        const structureChanged =
          previous.some((item) => item.id === 'annotation') !==
          graph.nodes.some((item) => item.id === 'annotation');
        return graph.nodes.map((node) => ({
          ...node,
          position: structureChanged
            ? node.position
            : (previous.find((item) => item.id === node.id)?.position ??
              node.position),
        }));
      });
      setEdges(graph.edges);
    });
    return () => cancelAnimationFrame(frame);
  }, [graph, setNodes, setEdges]);
  useEffect(() => {
    if (!taggedReviews.length) return;
    const frame = requestAnimationFrame(() => {
      void fitView({ padding: 0.18, duration: 250 });
    });
    return () => cancelAnimationFrame(frame);
  }, [taggedReviews.length, fitView]);
  const selectedNode = nodes.find((node) => node.id === focused);
  const activeEdge = edges.find((edge) => edge.id === selectedEdge);
  const showNodeMenu = useCallback(
    (event: MouseEvent, node: StudioNode) => {
      event.preventDefault();
      setFocused(node.id);
      if (node.id !== 'finish' && node.id !== 'verify') onNodeFocus?.(node.id);
      setSelectedEdge(null);
      const container = (event.currentTarget as HTMLElement).closest(
        '[data-workflow-canvas]'
      );
      const rect = container?.getBoundingClientRect();
      setPopup({
        kind: 'node',
        id: node.id,
        x: Math.min(
          Math.max(8, event.clientX - (rect?.left ?? 0)),
          Math.max(8, (rect?.width ?? 300) - 215)
        ),
        y: Math.min(
          Math.max(8, event.clientY - (rect?.top ?? 0)),
          Math.max(8, (rect?.height ?? 450) - 200)
        ),
      });
    },
    [onNodeFocus]
  );
  const showEdgeMenu = useCallback((event: MouseEvent, edge: StudioEdge) => {
    event.preventDefault();
    setSelectedEdge(edge.id);
    setFocused(null);
    const container = (event.currentTarget as HTMLElement).closest(
      '[data-workflow-canvas]'
    );
    const rect = container?.getBoundingClientRect();
    setPopup({
      kind: 'edge',
      id: edge.id,
      x: Math.min(
        Math.max(8, event.clientX - (rect?.left ?? 0)),
        Math.max(8, (rect?.width ?? 300) - 215)
      ),
      y: Math.min(
        Math.max(8, event.clientY - (rect?.top ?? 0)),
        Math.max(8, (rect?.height ?? 450) - 200)
      ),
    });
  }, []);

  return (
    <section
      data-testid="workflow-artboard"
      className="flex min-w-0 flex-col overflow-hidden rounded-[20px] border border-slate-200 bg-white shadow-sm lg:min-h-[calc(100dvh-7rem)]"
    >
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-200 bg-white px-4 py-3 md:px-5">
        <div className="flex items-center gap-3">
          <div className="flex size-10 items-center justify-center rounded-xl bg-teal-50 text-teal-700">
            <Waypoints className="size-5" />
          </div>
          <div>
            <h2 className="text-sm font-extrabold tracking-tight text-slate-900">
              Workflow artboard
            </h2>
            <p className="text-[11px] text-slate-500">
              {platform === 'linkedin' ? 'LinkedIn' : 'X'} · Connected execution
              trace · {nodes.length} nodes
            </p>
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <div className="relative">
            <button
              type="button"
              aria-label="Choose runnable action"
              aria-expanded={showActions}
              onClick={() => setShowActions(!showActions)}
              className="inline-flex min-h-10 items-center gap-2 rounded-xl border border-slate-200 px-3 text-xs font-bold hover:bg-slate-50"
            >
              <Zap className="size-4 text-teal-700" />
              {actionLabel}
              <ChevronDown className="size-3.5 text-slate-400" />
            </button>
            {showActions && (
              <div
                role="menu"
                aria-label="Runnable actions"
                className="absolute top-full right-0 z-40 mt-2 max-h-72 w-64 overflow-auto rounded-xl border border-slate-200 bg-white p-1.5 shadow-xl"
              >
                {actions.map((item) => (
                  <button
                    key={item.id}
                    type="button"
                    role="menuitemradio"
                    aria-checked={item.id === action}
                    onClick={() => {
                      if (item.id !== action) onActionChange(item.id);
                      setFocused(item.id === 'audit' ? 'inspect' : 'action');
                      setShowActions(false);
                    }}
                    className="flex min-h-10 w-full items-center justify-between rounded-lg px-3 text-left text-xs font-semibold hover:bg-slate-50"
                  >
                    {item.title}
                    {item.id === action && (
                      <Check className="size-4 text-teal-700" />
                    )}
                  </button>
                ))}
              </div>
            )}
          </div>
          <button
            type="button"
            onClick={() => setInspector(true)}
            aria-haspopup="dialog"
            aria-expanded={inspector}
            className="inline-flex min-h-10 items-center gap-2 rounded-xl border border-slate-200 px-3 text-xs font-semibold hover:bg-slate-50"
          >
            <MousePointer2 className="size-4" />
            Configure workflow
          </button>
        </div>
      </div>
      <div className="min-w-0 flex-1">
        <div
          data-workflow-canvas
          className="relative h-[450px] min-w-0 bg-[#f5f8f9] sm:h-[545px] lg:h-[calc(100dvh-14rem)] lg:min-h-[480px]"
          onClick={() => {
            setPopup(null);
            setShowActions(false);
          }}
        >
          <ReactFlow<StudioNode, StudioEdge>
            nodes={nodes}
            edges={edges}
            nodeTypes={nodeTypes}
            onNodesChange={onNodesChange}
            onEdgesChange={onEdgesChange}
            onNodeClick={(_, node) => {
              setFocused(node.id);
              setSelectedEdge(null);
              setInspector(false);
              if (node.id === 'finish' || node.id === 'verify')
                setDetail('output');
              else if (node.id === 'annotation') setDetail('annotation');
              else if (node.id === 'action') {
                setInspector(true);
                onNodeFocus?.(node.id);
              } else setDetail('stage');
            }}
            onEdgeClick={(_, edge) => {
              setSelectedEdge(edge.id);
              setFocused(null);
            }}
            onNodeContextMenu={showNodeMenu}
            onEdgeContextMenu={showEdgeMenu}
            onPaneClick={() => {
              setPopup(null);
              setFocused(null);
              setSelectedEdge(null);
            }}
            nodesConnectable={false}
            edgesReconnectable={false}
            deleteKeyCode={null}
            fitView
            fitViewOptions={{ padding: 0.17, minZoom: 0.37, maxZoom: 0.92 }}
            minZoom={0.28}
            maxZoom={1.7}
            proOptions={{ hideAttribution: false }}
            aria-label="Connected workflow graph with live execution stages"
          >
            <Background
              variant={BackgroundVariant.Dots}
              color="#b5c9cd"
              gap={20}
              size={1.15}
            />
            <Controls
              showInteractive={false}
              className="!rounded-xl !border-slate-200 !bg-white !shadow-sm"
            />
          </ReactFlow>
          <div className="pointer-events-none absolute top-4 left-4 flex flex-wrap gap-2">
            <span className="rounded-full border border-slate-200 bg-white/95 px-2.5 py-1 text-[10px] font-bold text-slate-600">
              LIVE GRAPH
            </span>
            {scopeLabel && (
              <span className="max-w-[230px] truncate rounded-full border border-teal-200 bg-teal-50/95 px-2.5 py-1 text-[10px] font-semibold text-teal-800">
                Scope: {scopeLabel}
              </span>
            )}
            {reviewCount > 0 && (
              <span className="rounded-full border border-slate-200 bg-white/95 px-2.5 py-1 text-[10px] font-semibold text-slate-600">
                {reviewCount} saved annotations
              </span>
            )}
            <span className="rounded-full border border-slate-200 bg-white/95 px-2.5 py-1 text-[10px] font-medium text-slate-500">
              Drag · Pan · Zoom · Right-click
            </span>
          </div>
          {popup && (
            <div
              data-testid="node-context-menu"
              className="absolute z-50 min-w-48 rounded-xl border border-slate-200 bg-white p-1.5 shadow-2xl"
              style={{ left: popup.x, top: popup.y }}
              onClick={(event) => event.stopPropagation()}
            >
              <p className="px-3 py-2 text-[10px] font-bold tracking-wider text-slate-400 uppercase">
                {popup.kind === 'node' ? 'Step actions' : 'Connector actions'}
              </p>
              <button
                type="button"
                onClick={() => {
                  if (popup.kind === 'node') {
                    setFocused(popup.id);
                    setInspector(popup.id === 'action');
                    setDetail(
                      popup.id === 'finish' || popup.id === 'verify'
                        ? 'output'
                        : popup.id === 'annotation'
                          ? 'annotation'
                          : popup.id === 'action'
                            ? null
                            : 'stage'
                    );
                    setNotice('Inspecting ' + popup.id + ' stage');
                  } else {
                    setSelectedEdge(popup.id);
                    setInspector(true);
                    setNotice('Active trace: ' + popup.id);
                  }
                  setPopup(null);
                }}
                className="flex min-h-10 w-full items-center gap-2 rounded-lg px-3 text-left text-xs font-semibold hover:bg-slate-100"
              >
                <Eye className="size-4" />{' '}
                {popup.kind === 'node' ? 'Inspect step' : 'Activate trace'}
              </button>
              {popup.kind === 'node' && popup.id === 'action' && (
                <button
                  type="button"
                  onClick={() => {
                    setFocused('action');
                    setInspector(true);
                    setPopup(null);
                    setNotice('Action selected for review: ' + actionLabel);
                  }}
                  className="flex min-h-10 w-full items-center gap-2 rounded-lg px-3 text-left text-xs font-semibold hover:bg-teal-50 hover:text-teal-800"
                >
                  <Play className="size-4" />
                  Activate action
                </button>
              )}
              <div className="border-t border-slate-100 px-3 py-2 text-[10px] leading-4 text-slate-500">
                Execution edges are locked to the audited backend sequence.
              </div>
            </div>
          )}
        </div>
        <WorkflowOutputDialog
          open={detail === 'output'}
          onDismiss={() => setDetail(null)}
          focused={focused}
          state={state}
          runId={runId}
          events={events}
          evidenceRoot={evidenceRoot}
          onEvidenceOpen={onEvidenceOpen}
        />
        <WorkflowAnnotationDialog
          open={detail === 'annotation'}
          onDismiss={() => setDetail(null)}
          taggedReviews={taggedReviews}
        />
        <StudioDialog
          open={detail === 'stage'}
          onDismiss={() => setDetail(null)}
          title="Workflow stage details"
          description={
            focused
              ? descriptions[focused as Phase]
              : 'Recorded engine events, not editable configuration.'
          }
          testId="workflow-stage-dialog"
        >
          <div className="space-y-3">
            <p className="text-sm font-semibold capitalize">Stage: {focused}</p>
            {events.length > 0 ? (
              events.slice(-15).map((item) => (
                <p
                  key={item.id}
                  className="border-b border-slate-100 pb-2 text-xs text-slate-600"
                >
                  <strong className="mr-2 uppercase">{item.kind}</strong>
                  {item.message}
                </p>
              ))
            ) : (
              <p className="text-xs text-slate-500">
                No run events recorded yet.
              </p>
            )}
          </div>
        </StudioDialog>
        <StudioDialog
          open={inspector}
          onDismiss={() => setInspector(false)}
          title="Workflow configuration"
          description="Inspect the selected stage and configure one supported action before execution."
          size="wide"
          testId="workflow-configuration-dialog"
        >
          <div
            data-testid="workflow-inspector"
            className="min-w-0 rounded-xl border border-slate-200 bg-white"
          >
            <div className="sticky top-0 z-10 border-b border-slate-100 bg-white px-4 py-3">
              <div className="flex items-center gap-2">
                <CircleDot className="size-4 text-teal-700" />
                <h3 className="text-xs font-bold tracking-[.08em] text-slate-900 uppercase">
                  Node inspector
                </h3>
              </div>
              <p className="mt-1 text-[11px] leading-4 text-slate-500">
                {activeEdge
                  ? activeEdge.source +
                    ' → ' +
                    activeEdge.target +
                    ' · fixed connection'
                  : selectedNode
                    ? descriptions[selectedNode.data.phase]
                    : 'Select a stage to see its behavior.'}
              </p>
            </div>
            <div className="px-4 py-4">
              {selectedNode && (
                <div className="mb-4 flex items-start gap-2 rounded-xl border border-slate-100 bg-slate-50 p-3">
                  <div className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-white text-slate-600">
                    <Activity className="size-4" />
                  </div>
                  <div className="min-w-0">
                    <p className="text-xs font-semibold text-slate-900">
                      {selectedNode.data.title}
                    </p>
                    <p className="mt-1 text-[11px] leading-4 text-slate-500">
                      {selectedNode.data.locked
                        ? 'Required stage, locked for safe execution'
                        : 'Configurable action; execution needs Start and approval'}
                    </p>
                  </div>
                </div>
              )}
              <div className="mb-3 flex gap-2">
                <span className="rounded-full bg-teal-50 px-2.5 py-1 text-[10px] font-semibold text-teal-900">
                  Executable: {actionLabel}
                </span>
              </div>
              {children}
            </div>
          </div>
        </StudioDialog>
      </div>
      <div className="flex flex-wrap items-center justify-between gap-2 border-t border-slate-200 bg-white px-4 py-2.5 text-[11px] text-slate-500">
        <span className="flex items-center gap-1.5">
          <GitBranch className="size-3.5" />
          {notice} · Click a node to annotate evidence in Chat
        </span>
        <span className="flex items-center gap-1.5">
          <LockKeyhole className="size-3.5" />
          Single action per run · mandatory review
        </span>
      </div>
    </section>
  );
}
export default function WorkflowArtboard(props: Props) {
  return (
    <ReactFlowProvider>
      <CanvasInner {...props} />
    </ReactFlowProvider>
  );
}
