'use client';

import { useState } from 'react';
import { FileText } from 'lucide-react';
import type { MatorCanvasMarker } from './mator-attachment-canvas';
import { getApi } from './api-client';

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
};

export default function MatorAttachmentPreview({
  attachmentId, imageSrc, filename = 'Image', mime = 'image/png',
  markers, interactive = true, reviewId, onAnnotateFull,
}: Props) {
  const [broken, setBroken] = useState(false);
  const isImage = mime.startsWith('image/');
  return (
    <>
      {isImage ? (
        <>
          <span className="relative inline-flex size-20 shrink-0 sm:size-24">
          <button
            type="button"
            title={filename}
            aria-label={`Open annotation studio for ${filename}`}
            data-testid="mator-image-thumbnail"
            onClick={() => void onAnnotateFull?.()}
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
    </>
  );
}
