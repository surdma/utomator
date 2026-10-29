import type { WorkflowPlan } from '../workflow-plan-editor';

export const REVIEW_IMAGE_ERROR = 'Choose a PNG, JPEG or WebP file under 2 MB.';

export function validateReviewImage(file: {
  size: number;
  type: string;
}): string | null {
  return file.size > 2 * 1024 * 1024 ||
    !['image/png', 'image/jpeg', 'image/webp'].includes(file.type)
    ? REVIEW_IMAGE_ERROR
    : null;
}

export function captureSection(fileName: string): string | null {
  return (
    /^audit-(experience|skills|projects|featured)\.png$/.exec(fileName)?.[1] ??
    null
  );
}

export function reviewSection(pageUrl: string): string {
  return (
    pageUrl.match(/\/details\/(experience|skills|projects|featured)\/?$/)?.[1] ??
    'profile'
  );
}

export function appendVisualReviewStep(
  plan: WorkflowPlan,
  reviewId: string,
  annotationCount: number
): WorkflowPlan {
  const id = 'review-' + reviewId.slice(0, 8);
  if (plan.steps.some((step) => step.id === id)) return plan;
  const steps = [...plan.steps];
  const index = steps.findIndex((step) => step.id === 'action');
  steps.splice(index, 0, {
    id,
    kind: 'note',
    title: 'Tagged image instruction',
    message:
      'Image review ' +
      reviewId +
      ' · ' +
      annotationCount +
      ' location actions; approval still required',
  });
  return {
    ...plan,
    steps,
    links: steps
      .slice(1)
      .map((step, i) => ({ source: steps[i]!.id, target: step.id })),
  };
}
