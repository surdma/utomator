'use client';

import { useCallback, useId, useRef, useState } from 'react';
import { motion, useReducedMotion } from 'framer-motion';
import { MapPin } from 'lucide-react';

export type MatorCanvasMarker = {
  id: string;
  x: number;
  y: number;
  text: string;
};

type Props = {
  attachmentId: string;
  imageSrc?: string | null;
  markers: MatorCanvasMarker[];
  onMarkersChange?: (markers: MatorCanvasMarker[]) => void;
  /** Prefer this when placing a pin (e.g. live voice transcript). */
  draftText?: string;
  interactive?: boolean;
  className?: string;
};

function newMarkerId() {
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) {
    return crypto.randomUUID();
  }
  return `pin-${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

export default function MatorAttachmentCanvas({
  attachmentId,
  imageSrc,
  markers,
  onMarkersChange,
  draftText = '',
  interactive = true,
  className = '',
}: Props) {
  const reduceMotion = useReducedMotion();
  const labelId = useId();
  const frameRef = useRef<HTMLDivElement>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [broken, setBroken] = useState(false);

  const placePin = useCallback(
    (clientX: number, clientY: number) => {
      if (!interactive || !onMarkersChange || !frameRef.current) return;
      const rect = frameRef.current.getBoundingClientRect();
      if (rect.width <= 0 || rect.height <= 0) return;
      const x = Math.min(1, Math.max(0, (clientX - rect.left) / rect.width));
      const y = Math.min(1, Math.max(0, (clientY - rect.top) / rect.height));
      const text =
        draftText.trim() ||
        (typeof window !== 'undefined'
          ? window.prompt('Marker note', '')?.trim() || ''
          : '');
      if (!text) return;
      const next: MatorCanvasMarker = { id: newMarkerId(), x, y, text };
      onMarkersChange([...markers, next]);
      setSelectedId(next.id);
    },
    [draftText, interactive, markers, onMarkersChange],
  );

  return (
    <div
      data-testid="mator-attachment-canvas"
      data-attachment-id={attachmentId}
      className={`overflow-hidden rounded-xl border border-teal-200/80 bg-slate-950/5 ${className}`}
      aria-labelledby={labelId}
    >
      <p id={labelId} className="sr-only">
        Attachment canvas with image markers
      </p>
      <div
        ref={frameRef}
        role={interactive ? 'application' : 'img'}
        aria-label={
          interactive
            ? 'Click to place a marker on this image'
            : 'Attachment with markers'
        }
        className={`relative aspect-[4/3] w-full overflow-hidden bg-gradient-to-br from-slate-100 via-teal-50 to-slate-200 ${
          interactive ? 'cursor-crosshair' : ''
        }`}
        onClick={(event) => {
          if ((event.target as HTMLElement).closest('[data-marker-pin]')) return;
          placePin(event.clientX, event.clientY);
        }}
      >
        {imageSrc && !broken ? (
          // eslint-disable-next-line @next/next/no-img-element -- attachment blobs / API URLs
          <img
            src={imageSrc}
            alt="Conversation attachment"
            className="pointer-events-none absolute inset-0 size-full object-contain"
            onError={() => setBroken(true)}
          />
        ) : (
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 px-4 text-center">
            <MapPin className="size-6 text-teal-700/70" aria-hidden="true" />
            <p className="text-xs font-semibold text-slate-600">
              {broken ? 'Image unavailable' : 'Attachment ready for markers'}
            </p>
            <p className="text-[11px] text-slate-500">
              Click to pin a note
              {draftText.trim() ? ' from your voice draft' : ''}
            </p>
          </div>
        )}

        {markers.map((marker, index) => {
          const active = selectedId === marker.id;
          return (
            <motion.button
              key={marker.id}
              type="button"
              data-marker-pin
              initial={reduceMotion ? false : { scale: 0.6, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              transition={
                reduceMotion
                  ? { duration: 0 }
                  : { duration: 0.2, ease: 'easeOut' }
              }
              style={{
                left: `${marker.x * 100}%`,
                top: `${marker.y * 100}%`,
              }}
              className={`absolute z-10 flex max-w-[55%] -translate-x-1/2 -translate-y-full flex-col items-center gap-1 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-teal-700 ${
                active ? 'z-20' : ''
              }`}
              onClick={(event) => {
                event.stopPropagation();
                setSelectedId(marker.id);
              }}
              aria-label={`Marker ${index + 1}: ${marker.text}`}
            >
              <span
                className={`rounded-md px-2 py-1 text-left text-[10px] leading-snug font-semibold shadow-sm ${
                  active
                    ? 'bg-teal-800 text-white'
                    : 'bg-white/95 text-teal-950 ring-1 ring-teal-200'
                }`}
              >
                {marker.text}
              </span>
              <span className="inline-flex size-6 items-center justify-center rounded-full bg-teal-700 text-[10px] font-bold text-white shadow ring-2 ring-white">
                {index + 1}
              </span>
            </motion.button>
          );
        })}
      </div>
      {markers.length > 0 && (
        <ul className="space-y-1 border-t border-teal-100 bg-teal-50/50 px-3 py-2">
          {markers.map((marker, index) => (
            <li key={marker.id} className="text-[11px] text-slate-700">
              <span className="font-bold text-teal-900">{index + 1}.</span>{' '}
              {marker.text}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
