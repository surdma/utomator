'use client';

import { useState } from 'react';
import type { ImageSource, VisualReviewDraft } from '../visual-review-panel';
import type { Platform } from './workflow-catalog';
import type { Review } from './run-models';
import { getApi } from './api-client';
import { captureSection, validateReviewImage } from './visual-review-model';

type Options = {
  platform: Platform;
  onCaptureSection: (section: string) => void;
  onSelectedNode: (node: string) => void;
  onReviewSaved: (id: string, annotationCount: number) => void;
  onInspectReview: (review: Review) => void;
  onSelectReviewAccount: (review: Review) => void;
  refresh: () => Promise<void>;
};

export function useVisualReviews({
  platform,
  onCaptureSection,
  onSelectedNode,
  onReviewSaved,
  onInspectReview,
  onSelectReviewAccount,
  refresh,
}: Options) {
  const [imageDraft, setImageDraft] = useState<ImageSource | null>(null);
  const [imageError, setImageError] = useState('');

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
    imageError,
    attachImage,
    annotateCapture,
    saveVisualReview,
    inspectReview,
    tagExistingReview,
    reviewImage,
  };
}
