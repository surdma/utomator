'use client';

import Image from 'next/image';
import type { Review } from '@/modules/pipeline';

export function ReviewImage({ review, src }: { review: Review; src: string }) {
  return (
    <Image
      unoptimized
      src={src}
      alt={`Annotated ${review.pageUrl}`}
      width={640}
      height={400}
      className="pointer-events-none max-h-44 w-full object-contain select-none"
    />
  );
}
