'use client';

import Image from 'next/image';
import StudioDialog from '@/components/ui/studio-dialog';
import type { TaggedAnnotationReview } from './workflow-artboard-graph';

export default function WorkflowAnnotationDialog({
  open,
  onDismiss,
  taggedReviews,
  onAnnotateFurther,
}: {
  open: boolean;
  onDismiss: () => void;
  taggedReviews: TaggedAnnotationReview[];
  /**
   * Clone-mode entry: opens the saved review in the annotation studio as a
   * new version; the approved original is never edited in place.
   */
  onAnnotateFurther?: (review: TaggedAnnotationReview) => void;
}) {
  return (
    <StudioDialog
      open={open}
      onDismiss={onDismiss}
      title="Tagged image instructions"
      description="Image-position instructions linked to this workflow. They do not bypass selectors, inspection, or approval."
      size="wide"
      testId="workflow-annotation-dialog"
    >
      <div className="grid gap-3 sm:grid-cols-2">
        {taggedReviews.map((review) => (
          <div
            key={review.id}
            className="overflow-hidden rounded-xl border border-slate-200"
          >
            <Image
              unoptimized
              src={review.imageUrl}
              alt="Operator-tagged screenshot"
              width={700}
              height={460}
              className="w-full"
            />
            <div className="space-y-2 p-3">
              <p className="text-xs break-all text-slate-600">
                {review.pageUrl}
              </p>
              {review.annotations.map((a, i) => (
                <p key={a.id} className="text-xs text-slate-700">
                  {i + 1}. {a.action.replaceAll('-', ' ')}
                  {a.comment ? ` · ${a.comment}` : ''}
                </p>
              ))}
              {onAnnotateFurther && (
                <button
                  type="button"
                  data-testid="workflow-annotation-annotate-further"
                  onClick={() => onAnnotateFurther(review)}
                  className="inline-flex text-xs font-bold text-teal-700 underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-teal-700"
                >
                  Annotate further
                </button>
              )}
              <a
                href={review.yamlUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex text-xs font-bold text-teal-700 underline"
              >
                View saved annotation YAML
              </a>
            </div>
          </div>
        ))}
      </div>
    </StudioDialog>
  );
}
