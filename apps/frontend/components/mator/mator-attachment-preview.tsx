'use client';

import { useRef, useState } from 'react';
import { FileText, Plus } from 'lucide-react';
import MatorAttachmentCanvas, { type MatorCanvasMarker } from './mator-attachment-canvas';
import StudioDialog from '@/components/ui/studio-dialog';
import { getApi } from '@/components/dashboard/pipeline/api-client';

type Props = {
  attachmentId: string;
  imageSrc?: string | null;
  filename?: string;
  mime?: string;
  markers: MatorCanvasMarker[];
  interactive?: boolean;
  reviewId?: string;
  /** Open the full YAML-driven review studio for this image. */
  onAnnotateFull?: () => void | Promise<unknown>;
  /** Quick-marker fallback when a pipeline account/page is not selected. */
  onMarkersChange?: (markers: MatorCanvasMarker[]) => void | Promise<unknown>;
};

export default function MatorAttachmentPreview({
  attachmentId, imageSrc, filename = 'Image', mime = 'image/png',
  markers, interactive = true, reviewId, onAnnotateFull, onMarkersChange,
}: Props) {
  const [broken, setBroken] = useState(false);
  const [quickOpen, setQuickOpen] = useState(false);
  const [draftMarkers, setDraftMarkers] = useState<MatorCanvasMarker[]>([]);
  const [draftNote, setDraftNote] = useState('');
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState('');
  const triggerRef = useRef<HTMLButtonElement>(null);
  const isImage = mime.startsWith('image/');
  const canPlaceMarkers = interactive && Boolean(onMarkersChange);

  function openAnnotation() {
    if (onAnnotateFull) {
      void onAnnotateFull();
      return;
    }
    if (!canPlaceMarkers) return;
    setDraftMarkers(markers.map((marker) => ({ ...marker })));
    setDraftNote('');
    setSaveError('');
    setQuickOpen(true);
  }
  function dismissQuickAnnotation() {
    if (saving) return;
    setQuickOpen(false);
    triggerRef.current?.focus();
  }
  function addCenterNote() {
    if (!draftNote.trim()) return;
    const id = typeof crypto !== 'undefined' && 'randomUUID' in crypto
      ? crypto.randomUUID()
      : 'pin-' + Date.now().toString(36);
    setDraftMarkers((current) => [
      ...current,
      { id, x: 0.5, y: 0.5, text: draftNote.trim() },
    ]);
    setDraftNote('');
  }
  async function saveQuickAnnotation() {
    if (!onMarkersChange) return;
    setSaving(true);
    setSaveError('');
    try {
      await onMarkersChange(draftMarkers);
      setQuickOpen(false);
      triggerRef.current?.focus();
    } catch (error) {
      setSaveError(error instanceof Error ? error.message : 'Could not save image annotations');
    } finally {
      setSaving(false);
    }
  }
  return (
    <>
      {isImage ? (
        <>
          <span className="relative inline-flex size-20 shrink-0 sm:size-24">
          <button
            ref={triggerRef}
            type="button"
            title={filename}
            aria-label={`Annotate image ${filename}`}
            data-testid="mator-image-thumbnail"
            disabled={!onAnnotateFull && !canPlaceMarkers}
            onClick={openAnnotation}
            className="flex size-20 items-center justify-center overflow-hidden rounded-lg border border-slate-200 bg-slate-50 cursor-pencil focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-teal-700 sm:size-24"
          >
            {imageSrc && !broken ? (
              // eslint-disable-next-line @next/next/no-img-element -- local blob or authorized attachment route
              <img src={imageSrc} alt="" className="size-full object-cover" onError={() => setBroken(true)} />
            ) : <FileText className="size-5 text-slate-500" aria-hidden="true" />}
            {markers.length > 0 && <span className="absolute right-1 bottom-1 rounded bg-slate-950/80 px-1 text-[10px] text-white">{markers.length} notes</span>}
          </button>
        </span>
        {reviewId && (
          <a
            data-testid="mator-annotation-yaml-link"
            href={getApi('visual-reviews/' + reviewId + '/yaml')}
            target="_blank"
            rel="noopener noreferrer"
            className="mx-auto block max-w-[6rem] truncate text-[10px] font-semibold text-teal-700 underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-teal-700"
          >
            {markers.length > 0 ? `${markers.length} notes · ` : ''}YAML
          </a>
        )}
        </>
      ) : (
        <div title={filename} aria-label={filename} className="flex size-20 shrink-0 flex-col items-center justify-center gap-1 rounded-lg border border-slate-200 bg-slate-50 px-1 sm:size-24">
          <FileText className="size-5 text-slate-500" aria-hidden="true" />
          <span className="w-full truncate text-center text-[10px] text-slate-600">{filename}</span>
        </div>
      )}
      {isImage && canPlaceMarkers && !onAnnotateFull && (
        <StudioDialog
          open={quickOpen}
          onDismiss={dismissQuickAnnotation}
          title="Annotate image"
          description={filename}
          testId="mator-image-annotation-modal"
          size="wide"
        >
          <div className="mx-auto max-w-3xl space-y-3">
            <MatorAttachmentCanvas
              attachmentId={attachmentId}
              imageSrc={imageSrc}
              markers={draftMarkers}
              draftText={draftNote}
              onMarkersChange={setDraftMarkers}
              interactive
              className="w-full"
            />
            <label htmlFor={`mator-image-note-${attachmentId}`} className="block text-xs font-semibold text-slate-700">
              Annotation comment
            </label>
            <div className="flex flex-col gap-2 sm:flex-row">
              <input
                id={`mator-image-note-${attachmentId}`}
                value={draftNote}
                onChange={(event) => setDraftNote(event.target.value)}
                placeholder="Describe what should change"
                className="min-h-11 min-w-0 flex-1 rounded-lg border border-slate-200 px-3 text-sm"
              />
              <button type="button" onClick={addCenterNote} disabled={!draftNote.trim()} className="inline-flex min-h-11 items-center gap-2 rounded-lg border border-slate-200 px-3 text-xs font-semibold text-teal-800 disabled:opacity-40">
                <Plus className="size-4" aria-hidden="true" /> Add comment at center
              </button>
            </div>
            {saveError && <p role="alert" className="text-xs text-rose-700">{saveError}</p>}
            <div className="flex justify-end gap-2">
              <button type="button" onClick={dismissQuickAnnotation} disabled={saving} className="min-h-11 rounded-lg border border-slate-200 px-4 text-sm">
                Cancel
              </button>
              <button type="button" data-testid="mator-annotation-save" onClick={() => void saveQuickAnnotation()} disabled={saving} className="min-h-11 rounded-lg bg-teal-800 px-4 text-sm font-semibold text-white disabled:opacity-50">
                {saving ? 'Saving…' : 'Save annotations'}
              </button>
            </div>
          </div>
        </StudioDialog>
      )}
    </>
  );
}
