'use client';

import { useRef, useState } from 'react';
import { FileText, Plus } from 'lucide-react';
import StudioDialog from '@/components/ui/studio-dialog';
import MatorAttachmentCanvas, { type MatorCanvasMarker } from './mator-attachment-canvas';

type Props = {
  attachmentId: string;
  imageSrc?: string | null;
  filename?: string;
  mime?: string;
  markers: MatorCanvasMarker[];
  draftText?: string;
  interactive?: boolean;
  onMarkersChange?: (markers: MatorCanvasMarker[]) => void | Promise<unknown>;
};

export default function MatorAttachmentPreview({
  attachmentId, imageSrc, filename = 'Image', mime = 'image/png',
  markers, draftText = '', interactive = true, onMarkersChange,
}: Props) {
  const [open, setOpen] = useState(false);
  const [note, setNote] = useState('');
  const [draftMarkers, setDraftMarkers] = useState<MatorCanvasMarker[]>([]);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [broken, setBroken] = useState(false);
  const trigger = useRef<HTMLButtonElement>(null);
  const isImage = mime.startsWith('image/');
  const canEdit = isImage && interactive && Boolean(onMarkersChange);
  const close = () => {
    if (saving) return;
    setOpen(false);
    setError('');
    trigger.current?.focus();
  };
  const openEditor = () => {
    setDraftMarkers(markers.map((marker) => ({ ...marker })));
    setNote(draftText);
    setError('');
    setOpen(true);
  };
  const addCenter = () => {
    if (!note.trim()) return;
    const id = typeof crypto !== 'undefined' && 'randomUUID' in crypto
      ? crypto.randomUUID()
      : 'marker-' + Date.now().toString(36);
    setDraftMarkers((current) => [...current, { id, x: 0.5, y: 0.5, text: note.trim() }]);
    setNote('');
  };
  const save = async () => {
    if (!onMarkersChange) return close();
    setSaving(true);
    setError('');
    try {
      await onMarkersChange(draftMarkers);
      setOpen(false);
      trigger.current?.focus();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Could not save annotations');
    } finally {
      setSaving(false);
    }
  };
  return (
    <>
      {isImage ? (
        <button
          ref={trigger}
          type="button"
          title={filename}
          aria-label={`Annotate image ${filename}`}
          data-testid="mator-image-thumbnail"
          onClick={openEditor}
          className="relative flex size-20 shrink-0 items-center justify-center overflow-hidden rounded-lg border border-slate-200 bg-slate-50 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-teal-700 sm:size-24"
        >
          {imageSrc && !broken ? (
            // eslint-disable-next-line @next/next/no-img-element -- local blob or authorized attachment route
            <img src={imageSrc} alt="" className="size-full object-cover" onError={() => setBroken(true)} />
          ) : <FileText className="size-5 text-slate-500" aria-hidden="true" />}
          {markers.length > 0 && <span className="absolute right-1 bottom-1 rounded bg-slate-950/80 px-1 text-[10px] text-white">{markers.length} notes</span>}
        </button>
      ) : (
        <div title={filename} aria-label={filename} className="flex size-20 shrink-0 flex-col items-center justify-center gap-1 rounded-lg border border-slate-200 bg-slate-50 px-1 sm:size-24">
          <FileText className="size-5 text-slate-500" aria-hidden="true" />
          <span className="w-full truncate text-center text-[10px] text-slate-600">{filename}</span>
        </div>
      )}
      {isImage && (
        <StudioDialog open={open} onDismiss={close} title="Annotate image" description={filename} size="wide" testId="mator-image-annotation-modal">
          <div className="mx-auto max-w-3xl space-y-3">
            <MatorAttachmentCanvas attachmentId={attachmentId} imageSrc={imageSrc} markers={draftMarkers} draftText={note} onMarkersChange={setDraftMarkers} interactive={canEdit} className="w-full" />
            {canEdit && (
              <>
                <label htmlFor={`mator-image-note-${attachmentId}`} className="block text-xs font-semibold text-slate-700">Annotation comment</label>
                <div className="flex flex-col gap-2 sm:flex-row">
                  <input id={`mator-image-note-${attachmentId}`} value={note} onChange={(event) => setNote(event.target.value)} placeholder="Describe what should change" className="min-h-11 min-w-0 flex-1 rounded-lg border border-slate-200 px-3 text-sm" />
                  <button type="button" onClick={addCenter} disabled={!note.trim()} className="inline-flex min-h-11 items-center gap-2 rounded-lg border border-slate-200 px-3 text-xs font-semibold text-teal-800 disabled:opacity-40"><Plus className="size-4" aria-hidden="true" /> Add comment at center</button>
                </div>
              </>
            )}
            {error && <p role="alert" className="text-xs text-rose-700">{error}</p>}
            <div className="flex justify-end gap-2">
              <button type="button" onClick={close} className="min-h-11 rounded-lg border border-slate-200 px-4 text-sm">Cancel</button>
              {canEdit && <button type="button" data-testid="mator-annotation-save" onClick={() => void save()} disabled={saving} className="min-h-11 rounded-lg bg-teal-800 px-4 text-sm font-semibold text-white disabled:opacity-50">{saving ? 'Saving…' : 'Save annotations'}</button>}
            </div>
          </div>
        </StudioDialog>
      )}
    </>
  );
}
