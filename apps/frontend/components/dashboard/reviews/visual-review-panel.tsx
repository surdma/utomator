'use client';

import {
  Circle,
  Eraser,
  MousePointer2,
  PenLine,
  RectangleHorizontal,
  RotateCcw,
} from 'lucide-react';
import Image from 'next/image';
import { type PointerEvent, useRef, useState } from 'react';
import { useVoiceSession } from '@/components/mator/use-voice-session';
import StudioDialog from '@/components/ui/studio-dialog';
import { matchAnnotationAction, mergeSpokenComment } from './annotation-voice';
import VisualReviewSidebar from './sections/visual-review-sidebar';
import type {
  AnnotationAction,
  AnnotationEditEvent,
  ImageSource,
  VisualAnnotation,
  VisualReviewDraft,
} from './visual-review-types';

export type {
  AnnotationAction,
  AnnotationEditEvent,
  ImageSource,
  Region,
  VisualAnnotation,
  VisualReviewDraft,
} from './visual-review-types';

type Props = {
  source: ImageSource;
  platform: 'linkedin' | 'x';
  handle: string;
  pageUrl: string;
  nodeId: string;
  onClose: () => void;
  onSave: (review: VisualReviewDraft) => Promise<void>;
};
type Point = { x: number; y: number };
type Tool = 'ellipse' | 'rectangle' | 'freehand';
type Gesture = { start: Point; end: Point; points: Point[] };

const clamp = (value: number) => Math.max(0, Math.min(1, value));
const tools: Array<{ kind: Tool; label: string; Icon: typeof Circle }> = [
  { kind: 'ellipse', label: 'Circle', Icon: Circle },
  { kind: 'rectangle', label: 'Rectangle', Icon: RectangleHorizontal },
  { kind: 'freehand', label: 'Draw', Icon: PenLine },
];
function geometry(start: Point, end: Point) {
  const x = Math.min(start.x, end.x),
    y = Math.min(start.y, end.y);
  const width = Math.max(0.012, Math.abs(start.x - end.x));
  const height = Math.max(0.012, Math.abs(start.y - end.y));
  return {
    x: Math.min(x, 1 - width),
    y: Math.min(y, 1 - height),
    width,
    height,
  };
}
function outline(item: VisualAnnotation, selected: boolean) {
  const stroke = selected ? '#0891b2' : '#0f766e';
  if (item.shape === 'freehand')
    return (
      <polyline
        points={(item.points ?? [])
          .map((p) => `${p.x * 1000},${p.y * 1000}`)
          .join(' ')}
        fill="none"
        stroke={stroke}
        strokeWidth={selected ? 6 : 4}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    );
  const x = item.x * 1000,
    y = item.y * 1000,
    width = item.width * 1000,
    height = item.height * 1000;
  return item.shape === 'ellipse' ? (
    <ellipse
      cx={x + width / 2}
      cy={y + height / 2}
      rx={width / 2}
      ry={height / 2}
      fill={stroke}
      fillOpacity={0.09}
      stroke={stroke}
      strokeWidth={selected ? 5 : 3}
    />
  ) : (
    <rect
      x={x}
      y={y}
      width={width}
      height={height}
      rx={5}
      fill={stroke}
      fillOpacity={0.09}
      stroke={stroke}
      strokeWidth={selected ? 5 : 3}
    />
  );
}
export default function VisualReviewPanel({
  source,
  platform,
  handle,
  pageUrl,
  nodeId,
  onClose,
  onSave,
}: Props) {
  const imageRef = useRef<HTMLDivElement>(null);
  const nextId = useRef(1);
  const [tool, setTool] = useState<Tool>('ellipse');
  const [gesture, setGesture] = useState<Gesture | null>(null);
  const [annotations, setAnnotations] = useState<VisualAnnotation[]>(
    source.kind === 'review' ? (source.initialAnnotations ?? []) : [],
  );
  const [history, setHistory] = useState<VisualAnnotation[][]>([]);
  const [events, setEvents] = useState<AnnotationEditEvent[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const selected = annotations.find((a) => a.id === selectedId);
  const allowedActions = (
    [
      'inspect',
      'suggest',
      'audit-page',
      ...(platform === 'x'
        ? [
            'edit-profile',
            'compose-post',
            'pin-post',
            'delete-post',
            'upload-banner',
          ]
        : [
            'edit-profile',
            'edit-experience',
            'edit-website',
            'edit-services',
            'add-project',
            'add-featured',
            'add-skill',
          ]),
    ] as AnnotationAction[]
  ).filter(Boolean);
  const record = (
    kind: AnnotationEditEvent['kind'],
    annotationId: string,
    annotation?: VisualAnnotation | null,
  ) =>
    setEvents((previous) => [
      ...previous,
      { kind, annotationId, at: new Date().toISOString(), annotation },
    ]);
  const position = (event: PointerEvent<HTMLDivElement>): Point | null => {
    const bounds = imageRef.current?.getBoundingClientRect();
    if (!bounds?.width || !bounds.height) return null;
    return {
      x: clamp((event.clientX - bounds.left) / bounds.width),
      y: clamp((event.clientY - bounds.top) / bounds.height),
    };
  };
  function pointerDown(event: PointerEvent<HTMLDivElement>) {
    if (event.button !== 0 || saving || annotations.length >= 15) return;
    const p = position(event);
    if (!p) return;
    setGesture({ start: p, end: p, points: [p] });
    event.currentTarget.setPointerCapture(event.pointerId);
  }
  function pointerMove(event: PointerEvent<HTMLDivElement>) {
    if (!gesture) return;
    const p = position(event);
    if (!p) return;
    setGesture((prev) =>
      prev
        ? {
            ...prev,
            end: p,
            points:
              tool === 'freehand' && prev.points.length < 250
                ? [...prev.points, p]
                : prev.points,
          }
        : prev,
    );
  }
  function pointerUp(event: PointerEvent<HTMLDivElement>) {
    if (!gesture) return;
    const p = position(event) ?? gesture.end;
    const points =
      tool === 'freehand' ? [...gesture.points, p].slice(0, 250) : [];
    if (tool === 'freehand' && points.length < 2) {
      setGesture(null);
      return;
    }
    const box =
      tool === 'freehand'
        ? geometry(
            {
              x: Math.min(...points.map((q) => q.x)),
              y: Math.min(...points.map((q) => q.y)),
            },
            {
              x: Math.max(...points.map((q) => q.x)),
              y: Math.max(...points.map((q) => q.y)),
            },
          )
        : geometry(gesture.start, p);
    const annotation: VisualAnnotation = {
      id: `mark-${Date.now().toString(36)}-${nextId.current++}`,
      shape: tool,
      ...box,
      ...(tool === 'freehand' ? { points } : {}),
      action: 'inspect',
      comment: '',
    };
    setHistory((prev) => [...prev, annotations]);
    setAnnotations((prev) => [...prev, annotation]);
    record('draw', annotation.id, annotation);
    setSelectedId(annotation.id);
    setGesture(null);
    setError('');
  }
  function updateAnnotation(
    next: VisualAnnotation,
    kind: 'action' | 'comment',
  ) {
    setHistory((prev) => [...prev, annotations]);
    setAnnotations((prev) => prev.map((a) => (a.id === next.id ? next : a)));
    record(kind, next.id, next);
  }
  const commentVoice = useVoiceSession({
    onFinal: (utterance) => {
      const current = annotations.find((item) => item.id === selectedId);
      if (!current) return;
      const action = matchAnnotationAction(utterance, allowedActions);
      updateAnnotation(
        {
          ...current,
          comment: mergeSpokenComment(current.comment, utterance),
          ...(action ? { action: action as AnnotationAction } : {}),
        },
        'comment',
      );
    },
  });
  function removeSelected() {
    if (!selected) return;
    setHistory((prev) => [...prev, annotations]);
    setAnnotations((prev) => prev.filter((a) => a.id !== selected.id));
    record('remove', selected.id, selected);
    setSelectedId(null);
  }
  function undo() {
    if (!history.length) return;
    const prior = history[history.length - 1]!;
    setHistory((prev) => prev.slice(0, -1));
    setAnnotations(prior);
    record('undo', selectedId ?? 'all');
    if (!prior.some((a) => a.id === selectedId)) setSelectedId(null);
  }
  async function tag() {
    if (!annotations.length) {
      setError('Circle, box, or draw at least one location.');
      return;
    }
    setSaving(true);
    setError('');
    try {
      await onSave({
        platform,
        handle,
        pageUrl,
        nodeId,
        note: source.kind === 'upload' ? (source.draftNote ?? '') : '',
        annotations,
        editEvents: [
          ...events,
          { kind: 'tag', annotationId: 'all', at: new Date().toISOString() },
        ],
        source:
          source.kind === 'capture'
            ? {
                kind: 'capture',
                runId: source.runId,
                fileName: source.fileName,
              }
            : source.kind === 'upload'
              ? { kind: 'upload', imageData: source.imageData }
              : { kind: 'review', reviewId: source.reviewId },
      });
    } catch (e) {
      setError(
        e instanceof Error ? e.message : 'Could not tag the annotated image',
      );
    } finally {
      setSaving(false);
    }
  }
  const draft: VisualAnnotation | null = gesture
    ? {
        id: 'preview',
        shape: tool,
        ...geometry(gesture.start, gesture.end),
        ...(tool === 'freehand' ? { points: gesture.points } : {}),
        action: 'inspect',
        comment: '',
      }
    : null;
  return (
    <StudioDialog
      open
      title="Image annotation studio"
      description="Draw directly on the captured image, assign an action to each mark, then tag it to Mator and the workflow."
      onDismiss={onClose}
      size="wide"
      testId="visual-review-dialog"
    >
      <div
        className="grid min-w-0 gap-4 lg:grid-cols-[minmax(0,1fr)_250px]"
        data-testid="annotation-editor"
      >
        <div className="min-w-0">
          <div
            role="toolbar"
            aria-label="Annotation drawing tools"
            className="mb-3 flex flex-wrap items-center gap-1 rounded-xl border border-slate-200 bg-slate-50 p-1.5"
          >
            {tools.map((item) => (
              <button
                key={item.kind}
                type="button"
                aria-label={item.label}
                aria-pressed={tool === item.kind}
                onClick={() => setTool(item.kind)}
                className={
                  'inline-flex min-h-10 items-center gap-2 rounded-lg px-3 text-xs font-bold ' +
                  (tool === item.kind
                    ? 'bg-slate-900 text-white'
                    : 'text-slate-600 hover:bg-white')
                }
              >
                <item.Icon className="size-4" />
                {item.label}
              </button>
            ))}
            <div className="ml-auto flex gap-1">
              <button
                type="button"
                aria-label="Undo annotation"
                disabled={!history.length}
                onClick={undo}
                className="inline-flex size-10 items-center justify-center rounded-lg text-slate-600 hover:bg-white disabled:opacity-30"
              >
                <RotateCcw className="size-4" />
              </button>
              <button
                type="button"
                aria-label="Remove selected annotation"
                disabled={!selected}
                onClick={removeSelected}
                className="inline-flex size-10 items-center justify-center rounded-lg text-rose-700 hover:bg-rose-50 disabled:opacity-30"
              >
                <Eraser className="size-4" />
              </button>
            </div>
          </div>
          <div
            ref={imageRef}
            data-testid="annotation-image"
            className="relative w-full cursor-crosshair touch-none overflow-hidden rounded-xl border border-slate-200 bg-slate-100 select-none"
            onPointerDown={pointerDown}
            onPointerMove={pointerMove}
            onPointerUp={pointerUp}
            onPointerCancel={() => setGesture(null)}
          >
            <Image
              unoptimized
              src={source.src}
              alt="Captured image ready for annotation"
              width={1200}
              height={800}
              className="pointer-events-none block h-auto w-full"
              draggable={false}
            />
            <svg
              className="pointer-events-none absolute inset-0 size-full"
              viewBox="0 0 1000 1000"
              preserveAspectRatio="none"
              aria-hidden="true"
            >
              {annotations.map((a, i) => (
                <g key={a.id}>
                  {outline(a, a.id === selectedId)}
                  <circle
                    cx={a.x * 1000 + 12}
                    cy={a.y * 1000 + 12}
                    r="13"
                    fill="#0f172a"
                    stroke="white"
                    strokeWidth="2"
                  />
                  <text
                    x={a.x * 1000 + 12}
                    y={a.y * 1000 + 17}
                    textAnchor="middle"
                    fontSize="17"
                    fontWeight="bold"
                    fill="white"
                  >
                    {i + 1}
                  </text>
                </g>
              ))}
              {draft && <g opacity={0.8}>{outline(draft, true)}</g>}
            </svg>
          </div>
          <div className="mt-2 flex items-center justify-between text-xs text-slate-500">
            <span>
              <MousePointer2 className="mr-1 inline size-3.5" />
              Drag to mark a precise location · normalized coordinates
            </span>
            <span>{annotations.length}/15</span>
          </div>
        </div>
        <VisualReviewSidebar
          annotations={annotations}
          selectedId={selectedId}
          setSelectedId={setSelectedId}
          selected={selected}
          allowedActions={allowedActions}
          updateAnnotation={updateAnnotation}
          setAnnotations={setAnnotations}
          record={record}
          removeSelected={removeSelected}
          commentVoice={commentVoice}
          error={error}
          saving={saving}
          tag={tag}
        />
      </div>
    </StudioDialog>
  );
}
