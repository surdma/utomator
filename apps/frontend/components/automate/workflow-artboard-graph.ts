import { MarkerType, Position, type Node, type Edge } from '@xyflow/react';

export type CanvasEvent = {
  id?: number;
  kind: string;
  message: string;
  details?: {
    fileName?: string;
    title?: string;
    headline?: string | null;
    bio?: string | null;
    xName?: string | null;
    url?: string;
    excerpt?: string;
    section?: string;
  };
};
export type TaggedAnnotationReview = {
  id: string;
  pageUrl: string;
  annotations: Array<{ id: string; action: string; comment: string }>;
  imageUrl: string;
  yamlUrl: string;
};
export type CanvasWorkflow = { id: string; title: string; category: string };
export type Phase =
  | 'start'
  | 'session'
  | 'inspect'
  | 'annotation'
  | 'action'
  | 'approval'
  | 'verify'
  | 'finish';
export type PhaseStatus = 'idle' | 'active' | 'done' | 'blocked' | 'failed';
export interface StudioData extends Record<string, unknown> {
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
export type StudioNode = Node<StudioData, 'studio'>;
export type StudioEdge = Edge;
export function phaseState(
  phase: Phase,
  runState: string | undefined,
  history: CanvasEvent[]
): PhaseStatus {
  if (phase === 'annotation') return 'done';
  if (!runState) return 'idle';
  const messages = history.map((entry) => entry.message.toLowerCase());
  const has = (word: string) => messages.some((text) => text.includes(word));
  if (phase === 'start') return 'done';
  if (phase === 'session')
    return has('browser session connected') ? 'done' : 'active';
  if (runState === 'completed') return 'done';
  if (phase === 'finish')
    return runState === 'failed'
      ? 'failed'
      : runState === 'blocked' || runState === 'cancelled'
        ? 'blocked'
        : 'idle';
  if (
    runState === 'failed' &&
    phase === 'inspect' &&
    !has('profile ui observed') &&
    !has('save clicked')
  )
    return 'failed';
  if (phase === 'inspect')
    return has('profile ui observed') || has('review') || has('save clicked')
      ? 'done'
      : 'active';
  if (phase === 'action')
    return has('save clicked') || has('verified')
      ? 'done'
      : has('approval') || has('review')
        ? 'active'
        : 'idle';
  if (phase === 'approval')
    return has('operator approved')
      ? 'done'
      : runState === 'approval-needed' || runState === 'input-needed'
        ? 'active'
        : 'idle';
  if (phase === 'verify') return has('verified') ? 'done' : 'idle';
  return 'idle';
}

export function buildGraph(
  action: string,
  actionLabel: string,
  runState: string | undefined,
  events: CanvasEvent[],
  hasAnnotations: boolean
): { nodes: StudioNode[]; edges: StudioEdge[] } {
  const isAudit = action === 'audit' || action === 'audit-page';
  const phases: Array<{
    id: Phase;
    title: string;
    caption: string;
    x: number;
    y: number;
    from: Position;
    to: Position;
  }> = isAudit
    ? [
        {
          id: 'start',
          title: 'Run trigger',
          caption: 'Manual start',
          x: 60,
          y: 135,
          from: Position.Right,
          to: Position.Left,
        },
        {
          id: 'session',
          title: 'Browser session',
          caption: 'Chrome / authentication',
          x: 350,
          y: 135,
          from: Position.Right,
          to: Position.Left,
        },
        {
          id: 'inspect',
          title:
            action === 'audit-page'
              ? 'Scoped page inspection'
              : 'Profile inspection',
          caption:
            action === 'audit-page'
              ? 'One selected page · read-only'
              : 'Live DOM observation',
          x: 640,
          y: 135,
          from: Position.Bottom,
          to: Position.Left,
        },
        {
          id: 'verify',
          title: 'Capture evidence',
          caption: 'Screenshot + accessibility',
          x: 640,
          y: 380,
          from: Position.Left,
          to: Position.Top,
        },
        {
          id: 'finish',
          title: 'Audit output',
          caption: 'Read-only results',
          x: 350,
          y: 380,
          from: Position.Left,
          to: Position.Right,
        },
      ]
    : [
        {
          id: 'start',
          title: 'Run trigger',
          caption: 'Manual start',
          x: 30,
          y: 100,
          from: Position.Right,
          to: Position.Left,
        },
        {
          id: 'session',
          title: 'Browser session',
          caption: 'Chrome / authentication',
          x: 325,
          y: 100,
          from: Position.Right,
          to: Position.Left,
        },
        {
          id: 'inspect',
          title: 'Inspect owned profile',
          caption: 'Live UI guard',
          x: 620,
          y: 100,
          from: Position.Right,
          to: Position.Left,
        },
        {
          id: 'action',
          title: actionLabel,
          caption: 'Selected executable action',
          x: 915,
          y: 100,
          from: Position.Bottom,
          to: Position.Left,
        },
        {
          id: 'approval',
          title: 'Human approval',
          caption: 'Mandatory review',
          x: 915,
          y: 370,
          from: Position.Left,
          to: Position.Top,
        },
        {
          id: 'verify',
          title: 'Verify persisted value',
          caption: 'Fresh UI observation',
          x: 620,
          y: 370,
          from: Position.Left,
          to: Position.Right,
        },
        {
          id: 'finish',
          title: 'Result journal',
          caption: 'Terminal state + evidence',
          x: 325,
          y: 370,
          from: Position.Left,
          to: Position.Right,
        },
      ];
  if (hasAnnotations) {
    const place = isAudit
      ? {
          id: 'annotation' as const,
          title: 'Image annotation',
          caption: 'Tagged YAML instruction bridge',
          x: 930,
          y: 135,
          from: Position.Bottom,
          to: Position.Left,
        }
      : {
          id: 'annotation' as const,
          title: 'Image annotation',
          caption: 'Tagged YAML instruction bridge',
          x: 915,
          y: 100,
          from: Position.Right,
          to: Position.Left,
        };
    if (isAudit) {
      phases[3]!.x = 930;
      phases[4]!.x = 640;
    } else {
      for (const phase of phases.slice(3)) phase.x += 295;
    }
    phases.splice(3, 0, place);
  }
  const nodes: StudioNode[] = phases.map((phase, i) => ({
    id: phase.id,
    type: 'studio',
    position: { x: phase.x, y: phase.y },
    width: 240,
    height: 137,
    measured: { width: 240, height: 137 }, // Deterministic edge anchors before ResizeObserver hydrates.
    sourcePosition: phase.from,
    targetPosition: phase.to,
    draggable: true,
    selectable: true,
    data: {
      phase: phase.id,
      title: phase.title,
      caption: phase.caption,
      step: String(i + 1).padStart(2, '0'),
      status: phaseState(phase.id, runState, events),
      locked: phase.id !== 'action',
      selectedAction: phase.id === 'action',
      from: phase.from,
      to: phase.to,
    },
  }));
  const edges: StudioEdge[] = phases.slice(1).map((target, i) => {
    const previous = phases[i];
    return {
      id: previous.id + '-to-' + target.id,
      source: previous.id,
      target: target.id,
      type: 'smoothstep',
      animated:
        runState === 'running' &&
        (target.id === 'inspect' || target.id === 'action'),
      selectable: true,
      markerEnd: {
        type: MarkerType.ArrowClosed,
        color: '#0f766e',
        width: 16,
        height: 16,
      },
      style: { stroke: '#0f766e', strokeWidth: 2.1 },
    };
  });
  return { nodes, edges };
}
