"use client";

import { useCallback, useEffect, useMemo, useState, type ReactNode, type MouseEvent } from "react";
import {
  ReactFlow, ReactFlowProvider, Background, BackgroundVariant, Controls, Handle,
  Position, MarkerType, useNodesState, useEdgesState, useReactFlow, type Node, type Edge, type NodeProps,
  type EdgeProps,
} from "@xyflow/react";
import StudioDialog from "@/components/ui/studio-dialog";
import Image from "next/image";
import { Activity, ArrowDownToLine, Check, ChevronDown, CircleDot, Compass, Crosshair, Eye, FileSearch,
  GitBranch, LockKeyhole, MoreHorizontal, MousePointer2, Play, ScanSearch, ShieldCheck,
  Sparkles, Waypoints, XCircle, Zap } from "lucide-react";

export type CanvasEvent = {
  kind: string; message: string;
  details?: { fileName?: string; title?: string; headline?: string | null; bio?: string | null;
    xName?: string | null; url?: string; excerpt?: string; section?: string };
};
export type TaggedAnnotationReview = {
  id: string; pageUrl: string; annotations: Array<{ id: string; action: string; comment: string }>;
  imageUrl: string; yamlUrl: string;
};
export type CanvasWorkflow = { id: string; title: string; category: string };
type Phase = "start" | "session" | "inspect" | "annotation" | "action" | "approval" | "verify" | "finish";
type PhaseStatus = "idle" | "active" | "done" | "blocked" | "failed";
interface StudioData extends Record<string, unknown> {
  title: string;
  caption: string;
  phase: Phase;
  step: string;
  status: PhaseStatus;
  selectedAction: boolean;
  locked: boolean;
  from: Position;
  to: Position;
}
type StudioNode = Node<StudioData, "studio">;
type StudioEdge = Edge;
type Popup = { kind: "node" | "edge"; id: string; x: number; y: number } | null;

const phaseIcon = {
  start: Compass, session: LockKeyhole, inspect: ScanSearch, annotation: Crosshair,
  action: Zap, approval: ShieldCheck, verify: FileSearch, finish: Check,
};

const descriptions: Record<Phase, string> = {
  start: "Single account and one declared task",
  session: "Signed-in Chrome session; manual challenge if required",
  inspect: "Live profile and selectors, not archived HTML",
  annotation: "Operator-tagged image geometry and YAML instructions; not executed browser clicks",
  action: "Only the selected Fastify/Playwright handler runs",
  approval: "Mandatory operator decision before mutation",
  verify: "Re-read the changed value or saved evidence",
  finish: "Terminal result and event journal",
};

function phaseState(phase: Phase, runState: string | undefined, history: CanvasEvent[]): PhaseStatus {
  if (phase === "annotation") return "done";
  if (!runState) return "idle";
  const messages = history.map((entry) => entry.message.toLowerCase());
  const has = (word: string) => messages.some((text) => text.includes(word));
  if (phase === "start") return "done";
  if (phase === "session") return has("browser session connected") ? "done" : "active";
  if (runState === "completed") return "done";
  if (phase === "finish") return runState === "failed" ? "failed" :
    runState === "blocked" || runState === "cancelled" ? "blocked" : "idle";
  if (runState === "failed" && phase === "inspect" && !has("profile ui observed") &&
    !has("save clicked")) return "failed";
  if (phase === "inspect") return has("profile ui observed") || has("review") || has("save clicked")
    ? "done" : "active";
  if (phase === "action") return has("save clicked") || has("verified") ? "done" :
    has("approval") || has("review") ? "active" : "idle";
  if (phase === "approval") return has("operator approved") ? "done" :
    runState === "approval-needed" || runState === "input-needed" ? "active" : "idle";
  if (phase === "verify") return has("verified") ? "done" : "idle";
  return "idle";
}

function buildGraph(
  action: string,
  actionLabel: string,
  runState: string | undefined,
  events: CanvasEvent[],
  hasAnnotations: boolean,
): { nodes: StudioNode[]; edges: StudioEdge[] } {
  const isAudit = action === "audit" || action === "audit-page";
  const phases: Array<{ id: Phase; title: string; caption: string; x: number; y: number; from: Position; to: Position }> = isAudit
    ? [
      { id: "start", title: "Run trigger", caption: "Manual start", x: 60, y: 135, from: Position.Right, to: Position.Left },
      { id: "session", title: "Browser session", caption: "Chrome / authentication", x: 350, y: 135, from: Position.Right, to: Position.Left },
      { id: "inspect", title: action === "audit-page" ? "Scoped page inspection" : "Profile inspection", caption: action === "audit-page" ? "One selected page · read-only" : "Live DOM observation", x: 640, y: 135, from: Position.Bottom, to: Position.Left },
      { id: "verify", title: "Capture evidence", caption: "Screenshot + accessibility", x: 640, y: 380, from: Position.Left, to: Position.Top },
      { id: "finish", title: "Audit output", caption: "Read-only results", x: 350, y: 380, from: Position.Left, to: Position.Right },
    ]
    : [
      { id: "start", title: "Run trigger", caption: "Manual start", x: 30, y: 100, from: Position.Right, to: Position.Left },
      { id: "session", title: "Browser session", caption: "Chrome / authentication", x: 325, y: 100, from: Position.Right, to: Position.Left },
      { id: "inspect", title: "Inspect owned profile", caption: "Live UI guard", x: 620, y: 100, from: Position.Right, to: Position.Left },
      { id: "action", title: actionLabel, caption: "Selected executable action", x: 915, y: 100, from: Position.Bottom, to: Position.Left },
      { id: "approval", title: "Human approval", caption: "Mandatory review", x: 915, y: 370, from: Position.Left, to: Position.Top },
      { id: "verify", title: "Verify persisted value", caption: "Fresh UI observation", x: 620, y: 370, from: Position.Left, to: Position.Right },
      { id: "finish", title: "Result journal", caption: "Terminal state + evidence", x: 325, y: 370, from: Position.Left, to: Position.Right },
    ];
  if (hasAnnotations) {
    const place = isAudit
      ? { id: "annotation" as const, title: "Image annotation", caption: "Tagged YAML instruction bridge", x: 930, y: 135, from: Position.Bottom, to: Position.Left }
      : { id: "annotation" as const, title: "Image annotation", caption: "Tagged YAML instruction bridge", x: 915, y: 100, from: Position.Right, to: Position.Left };
    if (isAudit) {
      phases[3]!.x = 930; phases[4]!.x = 640;
    } else {
      for (const phase of phases.slice(3)) phase.x += 295;
    }
    phases.splice(3, 0, place);
  }
  const nodes: StudioNode[] = phases.map((phase, i) => ({
    id: phase.id, type: "studio", position: { x: phase.x, y: phase.y },
    width: 240, height: 137,
    measured: { width: 240, height: 137 }, // Deterministic edge anchors before ResizeObserver hydrates.
    sourcePosition: phase.from, targetPosition: phase.to,
    draggable: true, selectable: true,
    data: {
      phase: phase.id, title: phase.title, caption: phase.caption, step: String(i + 1).padStart(2, "0"),
      status: phaseState(phase.id, runState, events), locked: phase.id !== "action",
      selectedAction: phase.id === "action", from: phase.from, to: phase.to,
    },
  }));
  const edges: StudioEdge[] = phases.slice(1).map((target, i) => {
    const previous = phases[i];
    return {
      id: previous.id + "-to-" + target.id, source: previous.id, target: target.id,
      type: "smoothstep", animated: runState === "running" && (target.id === "inspect" || target.id === "action"),
      selectable: true, markerEnd: { type: MarkerType.ArrowClosed, color: "#0f766e", width: 16, height: 16 },
      style: { stroke: "#0f766e", strokeWidth: 2.1 },
    };
  });
  return { nodes, edges };
}

function StageNode({ data, selected }: NodeProps<StudioNode>) {
  const Icon = phaseIcon[data.phase];
  const stateTone = data.status === "done" ? "bg-emerald-100 text-emerald-700" :
    data.status === "active" ? "bg-sky-100 text-sky-700" :
    data.status === "failed" ? "bg-rose-100 text-rose-700" :
    data.status === "blocked" ? "bg-amber-100 text-amber-800" : "bg-slate-100 text-slate-500";
  return (
    <div data-testid={"workflow-node-" + data.phase} className={
      "group w-[240px] overflow-hidden rounded-[18px] border bg-white shadow-[0_16px_50px_-25px_rgba(15,23,42,.6)] transition " +
      (selected ? "border-teal-500 ring-[3px] ring-teal-500/20" : "border-slate-200 hover:border-slate-400")
    }>
      <Handle type="target" position={data.to} className="!size-2.5 !border-2 !border-white !bg-teal-600" />
      <div className="flex items-center justify-between border-b border-slate-100 bg-slate-50/80 px-3 py-2">
        <span className="font-mono text-[10px] font-semibold tracking-widest text-slate-500">STEP {data.step}</span>
        <span className={"rounded-full px-2 py-0.5 text-[10px] font-semibold capitalize " + stateTone}>{data.status}</span>
      </div>
      <div className="flex gap-3 px-3 py-4">
        <span className={"flex size-10 shrink-0 items-center justify-center rounded-xl " + (data.phase === "action" ? "bg-teal-900 text-white" : "bg-slate-100 text-slate-700")}>
          <Icon className="size-5" />
        </span>
        <div className="min-w-0"><p className="truncate text-[13px] font-bold text-slate-900">{data.title}</p><p className="mt-1 text-[11px] leading-4 text-slate-500">{data.caption}</p></div>
      </div>
      <div className="flex items-center justify-between border-t border-slate-100 px-3 py-2">
        <span className="text-[10px] text-slate-400">{data.phase === "action" ? "RUNNABLE ACTION" : "REQUIRED STAGE"}</span>
        <MoreHorizontal className="size-4 text-slate-400" />
      </div>
      <Handle type="source" position={data.from} className="!size-2.5 !border-2 !border-white !bg-teal-600" />
    </div>
  );
}
const nodeTypes = { studio: StageNode };

interface Props {
  platform: "linkedin" | "x";
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
function CanvasInner({ platform, action, actionLabel, actions, state, runId, events, onActionChange, onNodeFocus,
  scopeLabel, reviewCount = 0, inspectorRequest = 0, taggedReviews = [], evidenceRoot, onEvidenceOpen, children }: Props) {
  const graph = useMemo(() => buildGraph(action, actionLabel, state, events, taggedReviews.length > 0), [action, actionLabel, state, events, taggedReviews.length]);
  const { fitView } = useReactFlow();
  const [nodes, setNodes, onNodesChange] = useNodesState<StudioNode>(graph.nodes);
  const [edges, setEdges, onEdgesChange] = useEdgesState<StudioEdge>(graph.edges);
  const [focused, setFocused] = useState<string | null>("inspect");
  const [selectedEdge, setSelectedEdge] = useState<string | null>(null);
  const [popup, setPopup] = useState<Popup>(null);
  const [showActions, setShowActions] = useState(false);
  const [inspector, setInspector] = useState(false);
  const [detail, setDetail] = useState<"output" | "annotation" | "stage" | null>(null);
  useEffect(() => { if (inspectorRequest > 0) setInspector(true); }, [inspectorRequest]);
  useEffect(() => { if (runId) setInspector(false); }, [runId]);
  const [notice, setNotice] = useState("Select nodes or right-click a connection to inspect it.");
  useEffect(() => {
    // Keep manually arranged positions while telemetry updates, reset on action change
    setNodes((previous) => {
      const structureChanged = previous.some(item => item.id === "annotation") !==
        graph.nodes.some(item => item.id === "annotation");
      return graph.nodes.map(node => ({
        ...node,
        position: structureChanged ? node.position :
          (previous.find(item => item.id === node.id)?.position ?? node.position),
      }));
    });
    setEdges(graph.edges);
  }, [graph, setNodes, setEdges]);
  useEffect(() => {
    if (!taggedReviews.length) return;
    const frame = requestAnimationFrame(() => { void fitView({padding:0.18,duration:250}); });
    return () => cancelAnimationFrame(frame);
  }, [taggedReviews.length,fitView]);
  const selectedNode = nodes.find((node) => node.id === focused);
  const activeEdge = edges.find((edge) => edge.id === selectedEdge);
  const resultEvents = events.filter(item => item.kind === "result");
  const screenshots = events.filter(item => item.kind === "screenshot" &&
    /^[a-zA-Z0-9_-]+\.png$/.test(item.details?.fileName ?? ""));
  const observation = [...events].reverse().find(item => item.kind === "audit" &&
    (item.details?.headline || item.details?.bio || item.details?.xName || item.details?.excerpt));

  const showNodeMenu = useCallback((event: MouseEvent, node: StudioNode) => {
    event.preventDefault(); setFocused(node.id); if (node.id !== "finish" && node.id !== "verify") onNodeFocus?.(node.id); setSelectedEdge(null);
    const container = (event.currentTarget as HTMLElement).closest("[data-workflow-canvas]");
    const rect = container?.getBoundingClientRect();
    setPopup({ kind: "node", id: node.id, x: Math.min(Math.max(8, event.clientX - (rect?.left ?? 0)), Math.max(8, (rect?.width ?? 300) - 215)), y: Math.min(Math.max(8, event.clientY - (rect?.top ?? 0)), Math.max(8, (rect?.height ?? 450) - 200)) });
  }, [onNodeFocus]);
  const showEdgeMenu = useCallback((event: MouseEvent, edge: StudioEdge) => {
    event.preventDefault(); setSelectedEdge(edge.id); setFocused(null);
    const container = (event.currentTarget as HTMLElement).closest("[data-workflow-canvas]");
    const rect = container?.getBoundingClientRect();
    setPopup({ kind: "edge", id: edge.id, x: Math.min(Math.max(8, event.clientX - (rect?.left ?? 0)), Math.max(8, (rect?.width ?? 300) - 215)), y: Math.min(Math.max(8, event.clientY - (rect?.top ?? 0)), Math.max(8, (rect?.height ?? 450) - 200)) });
  }, []);

  return (
    <section data-testid="workflow-artboard" className="flex min-w-0 flex-col overflow-hidden rounded-[20px] border border-slate-200 bg-white shadow-sm lg:min-h-[calc(100dvh-7rem)]">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-200 bg-white px-4 py-3 md:px-5">
        <div className="flex items-center gap-3">
          <div className="flex size-10 items-center justify-center rounded-xl bg-teal-50 text-teal-700"><Waypoints className="size-5" /></div>
          <div><h2 className="text-sm font-extrabold tracking-tight text-slate-900">Workflow artboard</h2><p className="text-[11px] text-slate-500">{platform === "linkedin" ? "LinkedIn" : "X"} · Connected execution trace · {nodes.length} nodes</p></div>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <div className="relative">
            <button type="button" aria-label="Choose runnable action" aria-expanded={showActions} onClick={() => setShowActions(!showActions)}
              className="inline-flex min-h-10 items-center gap-2 rounded-xl border border-slate-200 px-3 text-xs font-bold hover:bg-slate-50">
              <Zap className="size-4 text-teal-700" />{actionLabel}<ChevronDown className="size-3.5 text-slate-400" />
            </button>
            {showActions && <div role="menu" aria-label="Runnable actions" className="absolute right-0 top-full z-40 mt-2 max-h-72 w-64 overflow-auto rounded-xl border border-slate-200 bg-white p-1.5 shadow-xl">
              {actions.map((item) => <button key={item.id} type="button" role="menuitemradio" aria-checked={item.id === action}
                onClick={() => { if (item.id !== action) onActionChange(item.id); setFocused(item.id === "audit" ? "inspect" : "action"); setShowActions(false); }}
                className="flex min-h-10 w-full items-center justify-between rounded-lg px-3 text-left text-xs font-semibold hover:bg-slate-50">
                {item.title}{item.id === action && <Check className="size-4 text-teal-700" />}
              </button>)}
            </div>}
          </div>
          <button type="button" onClick={() => setInspector(true)} aria-haspopup="dialog" aria-expanded={inspector} className="inline-flex min-h-10 items-center gap-2 rounded-xl border border-slate-200 px-3 text-xs font-semibold hover:bg-slate-50">
            <MousePointer2 className="size-4" />Configure workflow
          </button>
        </div>
      </div>
      <div className="min-w-0 flex-1">
        <div data-workflow-canvas className="relative h-[450px] min-w-0 bg-[#f5f8f9] sm:h-[545px] lg:h-[calc(100dvh-14rem)] lg:min-h-[480px]" onClick={() => { setPopup(null);setShowActions(false); }}>
          <ReactFlow<StudioNode, StudioEdge>
            nodes={nodes} edges={edges} nodeTypes={nodeTypes}
            onNodesChange={onNodesChange} onEdgesChange={onEdgesChange}
            onNodeClick={(_, node) => {
              setFocused(node.id); setSelectedEdge(null); setInspector(false);
              if (node.id === "finish" || node.id === "verify") setDetail("output");
              else if (node.id === "annotation") setDetail("annotation");
              else if (node.id === "action") { setInspector(true); onNodeFocus?.(node.id); }
              else setDetail("stage");
            }}
            onEdgeClick={(_, edge) => { setSelectedEdge(edge.id);setFocused(null); }}
            onNodeContextMenu={showNodeMenu} onEdgeContextMenu={showEdgeMenu}
            onPaneClick={() => { setPopup(null); setFocused(null); setSelectedEdge(null); }}
            nodesConnectable={false} edgesReconnectable={false} deleteKeyCode={null}
            fitView fitViewOptions={{ padding: 0.17, minZoom: 0.37, maxZoom: 0.92 }}
            minZoom={0.28} maxZoom={1.7} proOptions={{ hideAttribution: false }}
            aria-label="Connected workflow graph with live execution stages"
          >
            <Background variant={BackgroundVariant.Dots} color="#b5c9cd" gap={20} size={1.15} />
            <Controls showInteractive={false} className="!rounded-xl !border-slate-200 !bg-white !shadow-sm" />
          </ReactFlow>
          <div className="pointer-events-none absolute left-4 top-4 flex flex-wrap gap-2">
            <span className="rounded-full border border-slate-200 bg-white/95 px-2.5 py-1 text-[10px] font-bold text-slate-600">LIVE GRAPH</span>
             {scopeLabel && <span className="max-w-[230px] truncate rounded-full border border-teal-200 bg-teal-50/95 px-2.5 py-1 text-[10px] font-semibold text-teal-800">Scope: {scopeLabel}</span>}
             {reviewCount > 0 && <span className="rounded-full border border-slate-200 bg-white/95 px-2.5 py-1 text-[10px] font-semibold text-slate-600">{reviewCount} saved annotations</span>}
            <span className="rounded-full border border-slate-200 bg-white/95 px-2.5 py-1 text-[10px] font-medium text-slate-500">Drag · Pan · Zoom · Right-click</span>
          </div>
          {popup && <div data-testid="node-context-menu" className="absolute z-50 min-w-48 rounded-xl border border-slate-200 bg-white p-1.5 shadow-2xl"
            style={{ left: popup.x, top: popup.y }}
            onClick={(event) => event.stopPropagation()}>
            <p className="px-3 py-2 text-[10px] font-bold uppercase tracking-wider text-slate-400">
              {popup.kind === "node" ? "Step actions" : "Connector actions"}
            </p>
            <button type="button" onClick={() => {
              if(popup.kind === "node") {
                setFocused(popup.id);
                setInspector(popup.id === "action");
                setDetail(popup.id === "finish" || popup.id === "verify" ? "output" : popup.id === "annotation" ? "annotation" : popup.id === "action" ? null : "stage");
                setNotice("Inspecting " + popup.id + " stage");
              } else {setSelectedEdge(popup.id);setInspector(true);setNotice("Active trace: " + popup.id);}
              setPopup(null);
            }}
              className="flex min-h-10 w-full items-center gap-2 rounded-lg px-3 text-left text-xs font-semibold hover:bg-slate-100">
              <Eye className="size-4" /> {popup.kind === "node" ? "Inspect step" : "Activate trace"}
            </button>
            {popup.kind === "node" && popup.id === "action" && <button type="button" onClick={() => {
              setFocused("action");setInspector(true);setPopup(null);setNotice("Action selected for review: " + actionLabel);
            }} className="flex min-h-10 w-full items-center gap-2 rounded-lg px-3 text-left text-xs font-semibold hover:bg-teal-50 hover:text-teal-800">
              <Play className="size-4" />Activate action
            </button>}
            <div className="border-t border-slate-100 px-3 py-2 text-[10px] leading-4 text-slate-500">
              Execution edges are locked to the audited backend sequence.
            </div>
          </div>}
        </div>
        <StudioDialog open={detail==="output"} onDismiss={()=>setDetail(null)} title={focused==="verify"?"Verification evidence":"Final workflow output"}
          description="Actual run results and captured evidence. Screenshots are labeled as captured, not fabricated after-state previews."
          size="wide" testId="workflow-output-dialog">
          <div data-testid="workflow-output" className="space-y-4">
            <div className="flex flex-wrap items-center justify-between gap-2 rounded-xl bg-slate-950 p-4 text-white">
              <div><p className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Execution status</p><p className="mt-1 text-base font-bold capitalize">{state?.replaceAll("-"," ")??"No run selected"}</p></div>
              <p className="max-w-[260px] break-all text-right font-mono text-[10px] text-slate-300">{runId??"Run the workflow to see its actual output"}</p>
            </div>
            {resultEvents.length>0?<div className="space-y-2"><h3 className="text-xs font-bold uppercase tracking-wider text-slate-500">Verified outcome journal</h3>
              {resultEvents.map((item,index)=><div key={index} className="rounded-xl border border-teal-200 bg-teal-50 p-3 text-sm text-teal-950">{item.message}</div>)}</div>
              :<p className="rounded-xl border border-dashed border-slate-200 p-4 text-xs text-slate-600">No verified result event yet. A workflow configuration is not an output.</p>}
            {observation?.details&&<div className="rounded-xl border border-slate-200 bg-white p-4" data-testid="observed-profile-preview">
              <p className="mb-3 text-[10px] font-bold uppercase tracking-wider text-teal-700">Observed profile preview · source DOM</p>
              <h3 className="text-base font-bold text-slate-900">{observation.details.xName||observation.details.title||"Observed profile"}</h3>
              {observation.details.headline&&<p className="mt-1 text-sm text-slate-700">{observation.details.headline}</p>}
              {observation.details.bio&&<p className="mt-1 whitespace-pre-wrap text-sm text-slate-700">{observation.details.bio}</p>}
              {observation.details.url&&<p className="mt-2 break-all text-xs text-slate-500">{observation.details.url}</p>}
              {observation.details.excerpt&&<p className="mt-3 max-h-40 overflow-y-auto whitespace-pre-wrap border-t border-slate-100 pt-3 text-xs leading-5 text-slate-600">
                {observation.details.excerpt}</p>}
              <p className="mt-3 text-[11px] text-slate-500">Rendered from a real browser observation event. Not an unverified edit preview.</p>
            </div>}
            {screenshots.length>0?<div className="space-y-3"><h3 className="text-xs font-bold uppercase tracking-wider text-slate-500">Captured browser evidence</h3>
              <div className="grid gap-3 sm:grid-cols-2">
                {screenshots.map((item,index)=><div key={index} className="overflow-hidden rounded-xl border border-slate-200 bg-slate-50">
                  {evidenceRoot && runId && onEvidenceOpen
                    ? <button type="button" onClick={()=>{setDetail(null);onEvidenceOpen(runId,item.details!.fileName!);}}
                        aria-label={"Annotate output capture: "+item.details!.fileName!} className="block w-full text-left hover:opacity-90">
                        <Image unoptimized src={evidenceRoot+item.details!.fileName!} width={860} height={540}
                          alt={"Recorded screenshot: "+item.message} className="h-auto w-full object-contain" />
                      </button>
                    : evidenceRoot&&<Image unoptimized src={evidenceRoot+item.details!.fileName!} width={860} height={540}
                        alt={"Recorded screenshot: "+item.message} className="h-auto w-full object-contain" />}
                  <p className="px-3 py-2 text-xs font-semibold text-slate-700">{item.message}</p>
                </div>)}
              </div>
              <p className="text-[11px] text-slate-500">Captures may precede a mutation. Only the result journal asserts verification.</p>
            </div>:<p className="text-xs text-slate-500">No screenshot recorded for this run.</p>}
          </div>
        </StudioDialog>
        <StudioDialog open={detail==="annotation"} onDismiss={()=>setDetail(null)} title="Tagged image instructions"
          description="Image-position instructions linked to this workflow. They do not bypass selectors, inspection, or approval." size="wide" testId="workflow-annotation-dialog">
          <div className="grid gap-3 sm:grid-cols-2">
            {taggedReviews.map(review=><div key={review.id} className="overflow-hidden rounded-xl border border-slate-200">
              <Image unoptimized src={review.imageUrl} alt="Operator-tagged screenshot" width={700} height={460} className="w-full" />
              <div className="space-y-2 p-3"><p className="break-all text-xs text-slate-600">{review.pageUrl}</p>
                {review.annotations.map((a,i)=><p key={a.id} className="text-xs text-slate-700">{i+1}. {a.action.replaceAll("-"," ")}{a.comment?" · "+a.comment:""}</p>)}
                <a href={review.yamlUrl} target="_blank" rel="noopener noreferrer" className="inline-flex text-xs font-bold text-teal-700 underline">View saved annotation YAML</a>
              </div>
            </div>)}
          </div>
        </StudioDialog>
        <StudioDialog open={detail==="stage"} onDismiss={()=>setDetail(null)} title="Workflow stage details"
          description={focused?descriptions[focused as Phase]:"Recorded engine events, not editable configuration."}
          testId="workflow-stage-dialog">
          <div className="space-y-3">
            <p className="text-sm font-semibold capitalize">Stage: {focused}</p>
            {events.length>0?events.slice(-15).map((item,index)=><p key={index} className="border-b border-slate-100 pb-2 text-xs text-slate-600">
              <strong className="mr-2 uppercase">{item.kind}</strong>{item.message}</p>):
              <p className="text-xs text-slate-500">No run events recorded yet.</p>}
          </div>
        </StudioDialog>
        <StudioDialog open={inspector} onDismiss={() => setInspector(false)} title="Workflow configuration"
          description="Inspect the selected stage and configure one supported action before execution." size="wide" testId="workflow-configuration-dialog">
          <div data-testid="workflow-inspector" className="min-w-0 rounded-xl border border-slate-200 bg-white">
          <div className="sticky top-0 z-10 border-b border-slate-100 bg-white px-4 py-3">
            <div className="flex items-center gap-2"><CircleDot className="size-4 text-teal-700" /><h3 className="text-xs font-bold uppercase tracking-[.08em] text-slate-900">Node inspector</h3></div>
            <p className="mt-1 text-[11px] leading-4 text-slate-500">{activeEdge
              ? activeEdge.source + " → " + activeEdge.target + " · fixed connection"
              : selectedNode ? descriptions[selectedNode.data.phase] : "Select a stage to see its behavior."}</p>
          </div>
          <div className="px-4 py-4">
            {selectedNode && <div className="mb-4 flex items-start gap-2 rounded-xl border border-slate-100 bg-slate-50 p-3">
              <div className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-white text-slate-600"><Activity className="size-4" /></div>
              <div className="min-w-0"><p className="text-xs font-semibold text-slate-900">{selectedNode.data.title}</p><p className="mt-1 text-[11px] leading-4 text-slate-500">{selectedNode.data.locked ? "Required stage, locked for safe execution" : "Configurable action; execution needs Start and approval"}</p></div>
            </div>}
            <div className="mb-3 flex gap-2"><span className="rounded-full bg-teal-50 px-2.5 py-1 text-[10px] font-semibold text-teal-900">Executable: {actionLabel}</span></div>
            {children}
          </div>
          </div>
        </StudioDialog>
      </div>
      <div className="flex flex-wrap items-center justify-between gap-2 border-t border-slate-200 bg-white px-4 py-2.5 text-[11px] text-slate-500">
        <span className="flex items-center gap-1.5"><GitBranch className="size-3.5" />{notice} · Click a node to annotate evidence in Chat</span>
        <span className="flex items-center gap-1.5"><LockKeyhole className="size-3.5" />Single action per run · mandatory review</span>
      </div>
    </section>
  );
}
export default function WorkflowArtboard(props: Props) {
  return <ReactFlowProvider><CanvasInner {...props} /></ReactFlowProvider>;
}
