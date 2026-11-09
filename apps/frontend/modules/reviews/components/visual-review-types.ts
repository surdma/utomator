export type ImageSource =
  | { kind: 'capture'; src: string; runId: string; fileName: string }
  | {
      kind: 'upload';
      src: string;
      imageData: string;
      /** Operator draft carried into the review note. Not posted as image source. */
      draftNote?: string;
    }
  | {
      kind: 'review';
      src: string;
      reviewId: string;
      initialAnnotations?: VisualAnnotation[];
    };
export type Region = {
  x: number;
  y: number;
  width: number;
  height: number;
  label: string;
  request: string;
};
export type AnnotationAction =
  | 'inspect'
  | 'suggest'
  | 'audit-page'
  | 'edit-profile'
  | 'edit-experience'
  | 'edit-website'
  | 'edit-services'
  | 'add-project'
  | 'add-featured'
  | 'add-skill'
  | 'compose-post'
  | 'pin-post'
  | 'delete-post'
  | 'upload-banner';
export type VisualAnnotation = {
  id: string;
  shape: 'rectangle' | 'ellipse' | 'freehand';
  x: number;
  y: number;
  width: number;
  height: number;
  points?: Array<{ x: number; y: number }>;
  action: AnnotationAction;
  comment: string;
};
export type AnnotationEditEvent = {
  kind: 'draw' | 'action' | 'comment' | 'remove' | 'undo' | 'tag';
  annotationId: string;
  at: string;
  annotation?: VisualAnnotation | null;
};
export type VisualReviewDraft = {
  platform: 'linkedin' | 'x';
  handle: string;
  pageUrl: string;
  nodeId: string;
  note: string;
  annotations: VisualAnnotation[];
  editEvents: AnnotationEditEvent[];
  source:
    | { kind: 'capture'; runId: string; fileName: string }
    | { kind: 'upload'; imageData: string }
    | { kind: 'review'; reviewId: string };
};
