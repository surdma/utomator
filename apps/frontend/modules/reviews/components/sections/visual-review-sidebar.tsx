'use client';

import { Tag, Trash2 } from 'lucide-react';
import type { Dispatch, SetStateAction } from 'react';
import { VoiceMicButton } from '@/modules/mator';
import type {
  AnnotationAction,
  VisualAnnotation,
} from '../visual-review-types';

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

export default function VisualReviewSidebar({
  annotations,
  selectedId,
  setSelectedId,
  selected,
  allowedActions,
  updateAnnotation,
  setAnnotations,
  record,
  removeSelected,
  commentVoice,
  error,
  saving,
  tag,
}: {
  annotations: VisualAnnotation[];
  selectedId: string | null;
  setSelectedId: (id: string | null) => void;
  selected: VisualAnnotation | undefined;
  allowedActions: AnnotationAction[];
  updateAnnotation: (
    next: VisualAnnotation,
    kind: 'action' | 'comment',
  ) => void;
  setAnnotations: Dispatch<SetStateAction<VisualAnnotation[]>>;
  record: (
    kind: 'draw' | 'action' | 'comment' | 'remove' | 'undo' | 'tag',
    annotationId: string,
    annotation?: VisualAnnotation | null,
  ) => void;
  removeSelected: () => void;
  commentVoice: {
    listening: boolean;
    support: string;
    toggleListen: () => void;
    interim: string;
    error: string | null | undefined;
  };
  error: string;
  saving: boolean;
  tag: () => void;
}) {
  return (
    <div className="flex min-w-0 flex-col gap-3">
      <div>
        <h3 className="text-sm font-extrabold text-slate-900">
          Location actions
        </h3>
        <p className="mt-1 text-xs leading-5 text-slate-500">
          Select a numbered mark to link an action and optional comment. Actions
          are plans, not automatic website clicks.
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
                  'action',
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
                      : item,
                  ),
                )
              }
              onBlur={() =>
                record(
                  'comment',
                  selected.id,
                  annotations.find((item) => item.id === selected.id),
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
          Saves the original image, mark geometry, actions, comments, and edit
          history. Any external edit still requires live inspection and
          approval.
        </p>
      </div>
    </div>
  );
}
