'use client';

import { useRef, useState } from 'react';
import type {
  ImageSource,
  VisualReviewDraft,
} from '../reviews/visual-review-panel';
import type { Platform } from './workflow-catalog';
import type { Review } from './run-models';
import { getApi } from './api-client';
import { captureSection, validateReviewImage } from './visual-review-model';

/** Chat assets that can open the full review studio. */
export type ChatAnnotationRequest = {
  file?: File;
  attachmentId?: string;
};
/**
 * The created review id, or null when the studio closed without saving.
 * Pending (unsent) drafts link the review through their send-time markers
 * PATCH; sent attachments link immediately through saveMarkers.
 */
export type ChatAnnotationResult = { reviewId: string } | null;

/**
 * Shell-owned builder: reads image bytes and enforces the pipeline page
 * context. Returns null when the operator cancelled the source step.
 */
export type ChatAnnotationBuilder = (
  request: ChatAnnotationRequest
) => Promise<{ imageDataUrl: string } | null>;

type Options = {
  platform: Platform;
  onCaptureSection: (section: string) => void;
  onSelectedNode: (node: string) => void;
  onReviewSaved: (id: string, annotationCount: number) => void;
  onInspectReview: (review: Review) => void;
  onSelectReviewAccount: (review: Review) => void;
  refresh: () => Promise<void>;
  annotateChatImage?: ChatAnnotationBuilder;
};

/** Serialized blob/image bytes as a data URL for the review studio upload. */
export function imageDataUrlFromBlob(blob: Blob, mime: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      if (typeof reader.result === 'string') {
        resolve(reader.result);
        return;
      }
      reject(new Error('Could not read the chosen image'));
    };
    reader.onerror = () => reject(new Error('Could not read the chosen image'));
    // Re-serialize as a data URL carrying the actual file mime.
    const bytes = new Blob([blob], { type: mime || 'image/png' });
    reader.readAsDataURL(bytes);
  });
}

export function useVisualReviews({
  platform,
  onCaptureSection,
  onSelectedNode,
  onReviewSaved,
  onInspectReview,
  onSelectReviewAccount,
  refresh,
  annotateChatImage,
}: Options) {
  const [imageDraft, setImageDraft] = useState<ImageSource | null>(null);
  const [imageError, setImageError] = useState('');
  // Rendered closures are recreated per render; the pending resolver must
  // survive across the annotate → save lifecycle, so it lives in a ref.
  const chatAnnotationResolver = useRef<
    ((result: ChatAnnotationResult) => void) | null
  >(null);

  async function attachImage(file?: File) {
    if (!file) return;
    const error = validateReviewImage(file);
    if (error) {
      setImageError(error);
      return;
    }
    const reader = new FileReader();
    reader.onload = () => {
      if (typeof reader.result === 'string') {
        setImageDraft({
          kind: 'upload',
          src: reader.result,
          imageData: reader.result,
        });
        setImageError('');
      }
    };
    reader.onerror = () => setImageError('Could not read the selected image');
    reader.readAsDataURL(file);
  }

  function annotateCapture(runId: string, fileName: string) {
    const section = captureSection(fileName);
    if (section && platform === 'linkedin') onCaptureSection(section);
    const src = getApi('runs/' + runId + '/evidence/' + fileName);
    onSelectedNode('annotation');
    setImageDraft({ kind: 'capture', src, runId, fileName });
  }

  /**
   * Open the YAML-driven annotation studio for a chat image. Resolves with
   * the created review id after the operator saves, or null when dismissed.
   */
  async function annotateChatAsset(
    request: ChatAnnotationRequest
  ): Promise<ChatAnnotationResult> {
    if (!annotateChatImage) {
      throw new Error('Full-image annotation is unavailable in this workspace');
    }
    const built = await annotateChatImage(request);
    if (!built) return null;
    return new Promise((resolve) => {
      chatAnnotationResolver.current = resolve;
      setImageError('');
      setImageDraft({
        kind: 'upload',
        src: built.imageDataUrl,
        imageData: built.imageDataUrl,
      });
    });
  }

  /**
   * Panel dismiss hook. A pending chat annotation resolves as cancelled —
   * a dismissed studio is never reported as a saved review.
   */
  function closeImageDraft() {
    setImageDraft(null);
    if (chatAnnotationResolver.current) {
      const resolve = chatAnnotationResolver.current;
      chatAnnotationResolver.current = null;
      resolve(null);
    }
  }

  async function saveVisualReview(draft: VisualReviewDraft) {
    const response = await fetch(getApi('visual-reviews'), {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(draft),
    });
    const json = (await response.json()) as {
      error?: string;
      id?: string;
    };
    if (!response.ok || !json.id)
      throw new Error(json.error || 'Could not save visual review');
    setImageDraft(null);
    onSelectedNode('annotation');
    onReviewSaved(json.id, draft.annotations.length);
    await refresh();
    if (chatAnnotationResolver.current) {
      const resolve = chatAnnotationResolver.current;
      chatAnnotationResolver.current = null;
      resolve({ reviewId: json.id });
    }
  }

  function inspectReview(review: Review) {
    onInspectReview(review);
  }

  const reviewImage = (review: Review) =>
    getApi('visual-reviews/' + review.id + '/image');

  function tagExistingReview(review: Review) {
    onSelectReviewAccount(review);
    setImageDraft({
      kind: 'review',
      src: reviewImage(review),
      reviewId: review.id,
      initialAnnotations: review.annotations,
    });
    onSelectedNode('annotation');
  }

  return {
    imageDraft,
    setImageDraft,
    closeImageDraft,
    imageError,
    attachImage,
    annotateCapture,
    annotateChatAsset,
    saveVisualReview,
    inspectReview,
    tagExistingReview,
    reviewImage,
  };
}
