'use client';

import { useEffect, useId, useRef, useState } from 'react';
import { FileImage, ExternalLink, Pencil, X, Plus } from 'lucide-react';
import MatorAttachmentCanvas, { type MatorCanvasMarker } from './mator-attachment-canvas';
import { matorAttachmentFileUrl } from './mator-api';

type Props = {
  attachmentId: string;
  imageSrc?: string | null;
  markers: MatorCanvasMarker[];
  draftText?: string;
  onMarkersChange?: (markers: MatorCanvasMarker[]) => void;
  interactive?: boolean;
};

export default function MatorAttachmentPreview({
  attachmentId,
  imageSrc,
  markers,
  draftText = '',
  onMarkersChange,
  interactive = true,
}: Props) {
  const [editing, setEditing] = useState(false);
  const [note, setNote] = useState('');
  const [failedImageSrc, setFailedImageSrc] = useState<string | null>(null);
  const id = useId();
  const pencilRef = useRef<HTMLButtonElement>(null);
  const noteRef = useRef<HTMLInputElement>(null);
  const canEdit = Boolean(interactive && onMarkersChange);

  useEffect(() => {
    if (editing) noteRef.current?.focus();
  }, [editing]);


  const close = () => {
    setEditing(false);
    pencilRef.current?.focus();
  };

  const addCenterMarker = () => {
    const text = note.trim();
    if (!text || !onMarkersChange) return;
    const markerId = typeof crypto !== 'undefined' && 'randomUUID' in crypto
      ? crypto.randomUUID()
      : 'marker-' + Date.now().toString(36);
    onMarkersChange([...markers, { id: markerId, x: 0.5, y: 0.5, text }]);
    setNote('');
  };

  return (
    <section
      data-testid="mator-attachment-preview"
      className="w-fit min-w-0 max-w-full rounded-xl border border-slate-200 bg-white p-2 shadow-sm"
      aria-label="Conversation attachment"
    >
      {imageSrc && failedImageSrc !== imageSrc && (
        <a
          href={matorAttachmentFileUrl(attachmentId)}
          target="_blank"
          rel="noopener noreferrer"
          aria-label="Open original image"
          className="mb-2 block w-fit max-w-full overflow-hidden rounded-lg bg-slate-50 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-teal-700"
        >
          {/* Attachment URLs may be local blobs or authenticated file routes. */}
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={imageSrc}
            alt="Attached image preview"
            loading="lazy"
            className="block max-h-28 max-w-32 object-contain"
            onError={() => setFailedImageSrc(imageSrc)}
          />
        </a>
      )}
      <div className="flex min-w-0 flex-nowrap items-center gap-1.5">
        <span aria-hidden="true" className="inline-flex size-9 shrink-0 items-center justify-center rounded-lg bg-slate-100 text-teal-700">
          <FileImage className="size-4" />
        </span>
        <a
          href={matorAttachmentFileUrl(attachmentId)}
          target="_blank"
          rel="noopener noreferrer"
          className="min-w-0 max-w-40 truncate text-xs font-semibold text-teal-800 underline underline-offset-2 focus-visible:outline-2 focus-visible:outline-teal-700"
          aria-label="Open attached file"
        >
          Attachment <ExternalLink className="inline size-3" aria-hidden="true" />
        </a>
        {markers.length > 0 && <span className="shrink-0 text-[11px] text-slate-500">{markers.length} notes</span>}
        {canEdit && (
          <button
            ref={pencilRef}
            type="button"
            data-testid="mator-annotation-pencil"
            aria-label={editing ? 'Close annotation editor' : 'Annotate attachment'}
            aria-controls={id}
            aria-expanded={editing}
            onClick={() => editing ? close() : setEditing(true)}
            className="inline-flex size-11 shrink-0 items-center justify-center rounded-lg text-teal-800 hover:bg-teal-50 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-teal-700"
          >
            {editing ? <X className="size-4" aria-hidden="true" /> : <Pencil className="size-4" aria-hidden="true" />}
          </button>
        )}
      </div>
      {editing && (
        <div id={id} role="region" aria-label="Attachment annotation editor" className="mt-2 w-[min(18rem,75vw)] max-w-full border-t border-slate-100 pt-2">
          <label className="block text-xs font-medium text-slate-700" htmlFor={id + '-note'}>
            Annotation note
          </label>
          <input
            ref={noteRef}
            id={id + '-note'}
            type="text"
            value={note}
            onChange={(event) => setNote(event.target.value)}
            placeholder="Describe what to change"
            className="mt-1 min-h-11 w-full rounded-lg border border-slate-200 px-2 text-sm text-slate-900 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-teal-700"
          />
          <p className="mt-1 text-[11px] text-slate-500">Tap the image to place this note, or add it at the center using the button.</p>
          <MatorAttachmentCanvas
            attachmentId={attachmentId}
            imageSrc={imageSrc}
            markers={markers}
            draftText={note.trim() || draftText}
            onMarkersChange={onMarkersChange}
            interactive={canEdit}
            className="mt-2"
          />
          <button
            type="button"
            onClick={addCenterMarker}
            disabled={!note.trim()}
            className="mt-2 inline-flex min-h-11 items-center gap-1.5 rounded-lg border border-slate-200 px-3 text-xs font-semibold text-teal-800 hover:bg-teal-50 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-teal-700 disabled:opacity-40"
          >
            <Plus className="size-4" aria-hidden="true" />
            Add note at center
          </button>
        </div>
      )}
    </section>
  );
}
