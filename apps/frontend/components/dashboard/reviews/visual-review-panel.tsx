'use client';

import Image from 'next/image';
import { useRef, useState, type PointerEvent } from 'react';
import {
  Circle,
  Eraser,
  MousePointer2,
  PenLine,
  RectangleHorizontal,
  RotateCcw,
  Tag,
  Trash2,
} from 'lucide-react';
import StudioDialog from '@/components/ui/studio-dialog';
import { VoiceMicButton } from '@/components/dashboard/pipeline/mator-composer';
import { useVoiceSession } from '@/components/dashboard/pipeline/use-voice-session';
import { matchAnnotationAction, mergeSpokenComment } from './annotation-voice';

export type ImageSource =
  | { kind: 'capture'; src: string; runId: string; fileName: string }
  | { kind: 'upload'; src: string; imageData: string }
  | {
      kind: 'review';
      src: string;
      reviewId: string;
      initialAnnotations?: VisualAnnotation[];
    };
export type Region = {
  x: number;
  y: number;
  width: number;
  height: number;
  label: string;
  request: string;
};
export type AnnotationAction =
  | 'inspect'
  | 'suggest'
  | 'audit-page'
  | 'edit-profile'
  | 'edit-experience'
  | 'edit-website'
  | 'edit-services'
  | 'add-project'
  | 'add-featured'
  | 'add-skill'
  | 'compose-post'
  | 'pin-post'
  | 'delete-post'
  | 'upload-banner';
export type VisualAnnotation = {
  id: string;
  shape: 'rectangle' | 'ellipse' | 'freehand';
  x: number;
  y: number;
  width: number;
  height: number;
  points?: Array<{ x: number; y: number }>;
  action: AnnotationAction;
  comment: string;
};
export type AnnotationEditEvent = {
  kind: 'draw' | 'action' | 'comment' | 'remove' | 'undo' | 'tag';
  annotationId: string;
  at: string;
  annotation?: VisualAnnotation | null;
};
export type VisualReviewDraft = {
  platform: 'linkedin' | 'x';
  handle: string;
  pageUrl: string;
  nodeId: string;
  note: string;
  annotations: VisualAnnotation[];
  editEvents: AnnotationEditEvent[];
  source:
    | { kind: 'capture'; runId: string; fileName: string }
    | { kind: 'upload'; imageData: string }
    | { kind: 'review'; reviewId: string };
};
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
const actionOptions: Array<{ value: AnnotationAction; label: string }> = [
  { value: 'inspect', label: 'Read this location' },
  { value: 'suggest', label: 'Suggest a change' },
  { value: 'audit-page', label: 'Inspect selected page' },
  { value: 'edit-profile', label: 'Prepare profile edit' },
  { value: 'edit-experience', label: 'Prepare experience edit' },
  { value: 'compose-post', label: 'Prepare a post' },
  { value: 'add-skill', label: 'Prepare skill update' },
  { value: 'edit-website', label: 'Prepare website change' },
  { value: 'edit-services', label: 'Prepare services change' },
  { value: 'add-project', label: 'Prepare project entry' },
  { value: 'add-featured', label: 'Prepare Featured entry' },
  { value: 'pin-post', label: 'Prepare post pin' },
  { value: 'delete-post', label: 'Prepare post deletion' },
  { value: 'upload-banner', label: 'Prepare banner update' },
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
          .map((p) => p.x * 1000 + ',' + p.y * 1000)
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
    source.kind === 'review' ? (source.initialAnnotations ?? []) : []
  );
  const [history, setHistory] = useState<VisualAnnotation[][]>([]);
  const [events, setEvents] = useState<AnnotationEditEvent[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const selected = annotations.find((a) => a.id === selectedId);
  const allowedActions = actionOptions
    .filter(
      (option) =>
        option.value === 'inspect' ||
        option.value === 'suggest' ||
        option.value === 'audit-page' ||
        (platform === 'x'
          ? [
              'edit-profile',
              'compose-post',
              'pin-post',
              'delete-post',
              'upload-banner',
            ].includes(option.value)
          : [
              'edit-profile',
              'edit-experience',
              'edit-website',
              'edit-services',
              'add-project',
              'add-featured',
              'add-skill',
            ].includes(option.value))
    )
    .map((option) => option.value);
  const record = (
    kind: AnnotationEditEvent['kind'],
    annotationId: string,
    annotation?: VisualAnnotation | null
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
        : prev
    );
  }
  function pointerUp(event: PointerEvent<HTMLDivElement>) {
    if (!gesture) return;
    const p = position(event) ?? gesture.end;
    const points =
      tool === 'freehand' ? [...gesture.points, p].slice(0, 250) : undefined;
    const box =
      tool === 'freehand'
        ? geometry(
            {
              x: Math.min(...points!.map((q) => q.x)),
              y: Math.min(...points!.map((q) => q.y)),
            },
            {
              x: Math.max(...points!.map((q) => q.x)),
              y: Math.max(...points!.map((q) => q.y)),
            }
          )
        : geometry(gesture.start, p);
    if (tool === 'freehand' && points!.length < 2) {
      setGesture(null);
      return;
    }
    const annotation: VisualAnnotation = {
      id: 'mark-' + Date.now().toString(36) + '-' + nextId.current++,
      shape: tool,
      ...box,
      ...(points ? { points } : {}),
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
    kind: 'action' | 'comment'
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
        'comment'
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
        note: '',
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
        e instanceof Error ? e.message : 'Could not tag the annotated image'
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
        <div className="flex min-w-0 flex-col gap-3">
          <div>
            <h3 className="text-sm font-extrabold text-slate-900">
              Location actions
            </h3>
            <p className="mt-1 text-xs leading-5 text-slate-500">
              Select a numbered mark to link an action and optional comment.
              Actions are plans, not automatic website clicks.
            </p>
          </div>
          <div
            className="max-h-[270px] space-y-1 overflow-y-auto"
            aria-label="Annotated locations"
          >
            {annotations.length === 0 ? (
              <p className="rounded-xl border border-dashed border-slate-200 p-3 text-xs text-slate-500">
                Choose Circle, Rectangle, or Draw, then mark the screenshot.
              </p>
            ) : (
              annotations.map((a, i) => (
                <button
                  key={a.id}
                  type="button"
                  onClick={() => setSelectedId(a.id)}
                  aria-pressed={a.id === selectedId}
                  className={
                    'flex min-h-11 w-full items-center gap-3 rounded-xl border px-3 text-left text-xs font-semibold ' +
                    (selectedId === a.id
                      ? 'border-teal-600 bg-teal-50 text-teal-900'
                      : 'border-slate-200 bg-white text-slate-700 hover:bg-slate-50')
                  }
                >
                  <span className="flex size-6 items-center justify-center rounded-full bg-slate-900 text-[10px] text-white">
                    {i + 1}
                  </span>
                  <span className="min-w-0 flex-1 truncate">
                    {a.action.replaceAll('-', ' ')} · {a.shape}
                  </span>
                </button>
              ))
            )}
          </div>
          {selected && (
            <div
              data-testid="selected-annotation"
              className="space-y-3 rounded-xl border border-teal-200 bg-teal-50/50 p-3"
            >
              <label className="block text-xs font-bold text-slate-800">
                Action
                <select
                  aria-label="Annotation action"
                  value={selected.action}
                  onChange={(e) =>
                    updateAnnotation(
                      {
                        ...selected,
                        action: e.target.value as AnnotationAction,
                      },
                      'action'
                    )
                  }
                  className="mt-1.5 min-h-11 w-full rounded-lg border border-slate-200 bg-white px-2 text-xs"
                >
                  {actionOptions
                    .filter((option) => allowedActions.includes(option.value))
                    .map((option) => (
                      <option key={option.value} value={option.value}>
                        {option.label}
                      </option>
                    ))}
                </select>
              </label>
              <div className="flex flex-col gap-2">
                <div className="flex items-center justify-between gap-2">
                  <label
                    htmlFor="annotation-comment"
                    className="text-xs font-bold text-slate-800"
                  >
                    Comment
                  </label>
                  <VoiceMicButton
                    size="md"
                    listening={commentVoice.listening}
                    disabled={commentVoice.support === 'unsupported'}
                    onClick={commentVoice.toggleListen}
                    label="Speak a comment"
                  />
                </div>
                <textarea
                  id="annotation-comment"
                  aria-label="Annotation comment"
                  rows={3}
                  maxLength={800}
                  value={selected.comment}
                  onChange={(e) =>
                    setAnnotations((prev) =>
                      prev.map((item) =>
                        item.id === selected.id
                          ? { ...item, comment: e.target.value }
                          : item
                      )
                    )
                  }
                  onBlur={() =>
                    record(
                      'comment',
                      selected.id,
                      annotations.find((item) => item.id === selected.id)
                    )
                  }
                  placeholder="Say what Mator should review here, or type it."
                  className="w-full resize-y rounded-lg border border-slate-200 bg-white p-2 text-base"
                />
                <p aria-live="polite" className="text-sm text-slate-700">
                  {commentVoice.interim ||
                    (commentVoice.support === 'unsupported'
                      ? 'Voice needs Chrome or Edge on this machine. Type a comment instead.'
                      : 'Tap the mic to speak this comment.')}
                </p>
                {commentVoice.error && (
                  <p role="alert" className="text-xs text-rose-700">
                    {commentVoice.error}
                  </p>
                )}
              </div>
              <p className="font-mono text-[10px] text-slate-500">
                x {selected.x.toFixed(3)} · y {selected.y.toFixed(3)} · w{' '}
                {selected.width.toFixed(3)} · h {selected.height.toFixed(3)}
              </p>
              <button
                type="button"
                onClick={removeSelected}
                className="inline-flex items-center gap-1 text-xs font-semibold text-rose-700"
              >
                <Trash2 className="size-4" />
                Remove mark
              </button>
            </div>
          )}
          <div className="mt-auto space-y-2 border-t border-slate-200 pt-3">
            {error && (
              <p role="alert" className="text-xs text-rose-700">
                {error}
              </p>
            )}
            <button
              type="button"
              disabled={!annotations.length || saving}
              onClick={() => void tag()}
              className="flex min-h-11 w-full items-center justify-center gap-2 rounded-xl bg-slate-950 px-3 text-xs font-bold text-white hover:bg-teal-900 disabled:opacity-40"
            >
              <Tag className="size-4" />
              {saving ? 'Saving annotation YAML…' : 'Tag to Chat & Workflow'}
            </button>
            <p className="text-[10px] leading-4 text-slate-500">
              Saves the original image, mark geometry, actions, comments, and
              edit history. Any external edit still requires live inspection and
              approval.
            </p>
          </div>
        </div>
      </div>
    </StudioDialog>
  );
}
