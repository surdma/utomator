import { randomUUID } from 'node:crypto';
import { mkdir, readFile, rename, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { isOwnedBy, isTrustedOwnerId } from '../../domain/ownership.js';
import type { Platform } from '../../domain/types.js';
import { profileUrlForHandle, validatePageScope } from '../../domain/validate.js';
import { runtimePath } from '../runtime/paths.js';

export type VisualRegion = {
  x: number;
  y: number;
  width: number;
  height: number;
  label: string;
  request: string;
};
// Coordinates are normalized to the source image, not CSS pixels.
// Annotation intent is operator-authored; it is NEVER a browser selector.
export type VisualAnnotation = {
  id: string;
  shape: 'rectangle' | 'ellipse' | 'freehand';
  x: number;
  y: number;
  width: number;
  height: number;
  points?: Array<{ x: number; y: number }>;
  action:
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
  comment: string;
};
export type AnnotationEditEvent = {
  kind: 'draw' | 'action' | 'comment' | 'remove' | 'undo' | 'tag';
  annotationId: string;
  at: string;
  annotation?: VisualAnnotation | null;
};
export type ReviewRecord = {
  id: string;
  ownerId?: string;
  createdAt: string;
  platform: Platform;
  handle: string;
  pageUrl: string;
  nodeId: string;
  note: string;
  regions: VisualRegion[];
  annotations?: VisualAnnotation[];
  editEvents?: AnnotationEditEvent[];
  source:
    | { kind: 'capture'; runId: string; fileName: string }
    | { kind: 'upload' }
    | { kind: 'review'; reviewId: string };
};
export type IdentityNote = {
  id: string;
  ownerId?: string;
  createdAt: string;
  platform: Platform;
  scope: string;
  text: string;
};

const root = runtimePath('visual');
const recordFile = resolve(root, 'reviews.json');
const memoryFile = resolve(root, 'identity-notes.json');
const png = /^data:image\/(png|jpeg|webp);base64,([a-zA-Z0-9+/=]+)$/;
const allowedNode = new Set([
  'start',
  'session',
  'inspect',
  'annotation',
  'action',
  'approval',
  'verify',
  'finish',
]);
const captureFilename = /^[a-zA-Z0-9_-]+\.png$/;
const uuid = /^[a-f0-9-]{36}$/i;
const annotationId = /^[a-zA-Z0-9_-]{1,64}$/;
const annotationActions = new Set([
  'inspect',
  'suggest',
  'audit-page',
  'edit-profile',
  'edit-experience',
  'edit-website',
  'edit-services',
  'add-project',
  'add-featured',
  'add-skill',
  'compose-post',
  'pin-post',
  'delete-post',
  'upload-banner',
]);
function unit(n: unknown): n is number {
  return typeof n === 'number' && Number.isFinite(n) && n >= 0 && n <= 1;
}
function validAnnotation(item: unknown): item is VisualAnnotation {
  if (!item || typeof item !== 'object') return false;
  const a = item as Partial<VisualAnnotation>;
  if (
    typeof a.id !== 'string' ||
    !annotationId.test(a.id) ||
    !['rectangle', 'ellipse', 'freehand'].includes(a.shape ?? '') ||
    !annotationActions.has(a.action ?? '') ||
    typeof a.comment !== 'string' ||
    a.comment.length > 800 ||
    ![a.x, a.y, a.width, a.height].every(unit) ||
    (a.width ?? 0) <= 0.005 ||
    (a.height ?? 0) <= 0.005 ||
    (a.x ?? 0) + (a.width ?? 0) > 1.001 ||
    (a.y ?? 0) + (a.height ?? 0) > 1.001
  )
    return false;
  if (a.shape === 'freehand')
    return (
      Array.isArray(a.points) &&
      a.points.length >= 2 &&
      a.points.length <= 250 &&
      a.points.every((p) => p && unit(p.x) && unit(p.y))
    );
  return a.points === undefined;
}
function validEditEvent(item: unknown): item is AnnotationEditEvent {
  if (!item || typeof item !== 'object') return false;
  const e = item as Partial<AnnotationEditEvent>;
  return (
    ['draw', 'action', 'comment', 'remove', 'undo', 'tag'].includes(e.kind ?? '') &&
    typeof e.annotationId === 'string' &&
    (e.annotationId === 'all' || annotationId.test(e.annotationId)) &&
    typeof e.at === 'string' &&
    !Number.isNaN(Date.parse(e.at)) &&
    (e.annotation === undefined || e.annotation === null || validAnnotation(e.annotation))
  );
}
// Serialize only validated, server-owned fields. Quoted scalars prevent YAML injection.
// Output is readable YAML 1.2 without importing a new parser at runtime.
function yamlScalar(value: unknown): string {
  if (value === null) return 'null';
  if (typeof value === 'number' || typeof value === 'boolean') return String(value);
  return JSON.stringify(String(value));
}
function yamlValue(value: unknown, indent = 0): string {
  const pad = ' '.repeat(indent);
  if (Array.isArray(value)) {
    if (!value.length) return '[]';
    return value
      .map((item) => {
        if (item !== null && typeof item === 'object') {
          return pad + '-\n' + yamlValue(item, indent + 2);
        }
        return pad + '- ' + yamlScalar(item);
      })
      .join('\n');
  }
  if (value !== null && typeof value === 'object') {
    return Object.entries(value as Record<string, unknown>)
      .filter(([, v]) => v !== undefined)
      .map(([key, v]) =>
        v !== null && typeof v === 'object' && (Array.isArray(v) ? v.length > 0 : true)
          ? pad + key + ':\n' + yamlValue(v, indent + 2)
          : pad + key + ': ' + (Array.isArray(v) && !v.length ? '[]' : yamlScalar(v)),
      )
      .join('\n');
  }
  return pad + yamlScalar(value);
}
export function reviewYaml(record: ReviewRecord): string {
  return (
    yamlValue({
      version: 1,
      reviewId: record.id,
      createdAt: record.createdAt,
      target: {
        platform: record.platform,
        handle: record.handle,
        pageUrl: record.pageUrl,
        node: record.nodeId,
      },
      image: record.source,
      annotations: record.annotations ?? [],
      events: record.editEvents ?? [],
      execution: {
        status: 'operator-plan-only',
        browserActionsExecuted: false,
        requiresExplicitApproval: true,
      },
    }) + '\n'
  );
}

export function normalizePageScope(platform: Platform, handle: string, raw: string): string {
  return validatePageScope(platform, new URL(profileUrlForHandle(platform, handle)), raw).href;
}
function validRegion(input: unknown): boolean {
  if (!input || typeof input !== 'object') return false;
  const value = input as Partial<VisualRegion>;
  return (
    [value.x, value.y, value.width, value.height].every(
      (x) => typeof x === 'number' && Number.isFinite(x) && x >= 0 && x <= 1,
    ) &&
    (value.width ?? 0) > 0.005 &&
    (value.height ?? 0) > 0.005 &&
    (value.x ?? 0) + (value.width ?? 0) <= 1.001 &&
    (value.y ?? 0) + (value.height ?? 0) <= 1.001 &&
    typeof value.label === 'string' &&
    value.label.length <= 80 &&
    typeof value.request === 'string' &&
    value.request.trim().length > 0 &&
    value.request.length <= 800
  );
}
async function readArray<T>(path: string): Promise<T[]> {
  try {
    const data: unknown = JSON.parse(await readFile(path, 'utf8'));
    return Array.isArray(data) ? (data as T[]) : [];
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return [];
    throw error;
  }
}
async function atomicJson(path: string, data: unknown) {
  await mkdir(root, { recursive: true, mode: 0o700 });
  const temp = path + '.' + randomUUID();
  await writeFile(temp, JSON.stringify(data, null, 2), { mode: 0o600 });
  await rename(temp, path);
}
function parseUpload(input: unknown): Buffer {
  if (typeof input !== 'string' || input.length > 2800000)
    throw new Error('Select a PNG, JPEG or WebP image under 2 MB');
  const match = png.exec(input);
  if (!match) throw new Error('Only PNG, JPEG and WebP image uploads are supported');
  const bytes = Buffer.from(match[2] ?? '', 'base64');
  const actual = bytes.subarray(0, 8).toString('hex');
  const format = match[1];
  const valid =
    format === 'png'
      ? actual.startsWith('89504e470d0a1a0a')
      : format === 'jpeg'
        ? actual.startsWith('ffd8ff')
        : actual.startsWith('52494646') && bytes.toString('ascii', 8, 12) === 'WEBP';
  if (!valid || bytes.length === 0 || bytes.length > 2 * 1024 * 1024)
    throw new Error('Invalid or oversized image');
  return bytes;
}
function mimeFor(bytes: Buffer): string {
  if (bytes.subarray(0, 4).toString('hex').startsWith('89504e47')) return 'image/png';
  if (bytes.subarray(0, 3).toString('hex') === 'ffd8ff') return 'image/jpeg';
  return 'image/webp';
}

// The service runs only on the single-owner loopback Fastify process.
// This serialized queue prevents concurrent local writes from losing records.
export class VisualReviewStore {
  private writeQueue: Promise<unknown> = Promise.resolve();
  constructor(
    private readonly captureAllowed: (
      runId: string,
      fileName: string,
      platform: Platform,
    ) => boolean | Promise<boolean>,
    private readonly ownerId: string,
  ) {
    if (!isTrustedOwnerId(ownerId)) throw Error('Visual reviews require an authenticated owner');
  }
  private serialize<T>(work: () => Promise<T>): Promise<T> {
    const result = this.writeQueue.then(work);
    this.writeQueue = result.catch(() => undefined);
    return result;
  }
  async listReviews(): Promise<ReviewRecord[]> {
    return (await readArray<ReviewRecord>(recordFile)).filter((review) =>
      isOwnedBy(review, this.ownerId),
    );
  }
  async addReview(input: {
    platform: Platform;
    handle: string;
    pageUrl: string;
    nodeId: string;
    note: string;
    regions?: VisualRegion[];
    annotations?: VisualAnnotation[];
    editEvents?: AnnotationEditEvent[];
    source:
      | { kind: 'capture'; runId: string; fileName: string }
      | { kind: 'upload'; imageData: string }
      | { kind: 'review'; reviewId: string };
  }): Promise<ReviewRecord> {
    if (
      !['linkedin', 'x'].includes(input?.platform) ||
      typeof input.handle !== 'string' ||
      typeof input.pageUrl !== 'string'
    )
      throw new Error('Valid platform, handle and page scope are required');
    const pageUrl = normalizePageScope(input.platform, input.handle, input.pageUrl);
    const annotations = input.annotations;
    if (
      annotations !== undefined &&
      (!Array.isArray(annotations) ||
        annotations.length < 1 ||
        annotations.length > 15 ||
        !annotations.every(validAnnotation) ||
        new Set(annotations.map((a) => a.id)).size !== annotations.length)
    ) {
      throw new Error('Provide 1–15 distinct annotations with valid image coordinates and actions');
    }
    const editEvents = input.editEvents ?? [];
    if (
      !Array.isArray(editEvents) ||
      editEvents.length > 150 ||
      !editEvents.every(validEditEvent) ||
      (annotations && !editEvents.some((e) => e.kind === 'tag'))
    )
      throw new Error('Invalid annotation edit history or missing tag event');
    const regions = annotations
      ? annotations.map((a, i) => ({
          x: a.x,
          y: a.y,
          width: a.width,
          height: a.height,
          label: 'Annotation ' + (i + 1),
          request: a.action + (a.comment ? ': ' + a.comment : ''),
        }))
      : input.regions;
    if (
      !allowedNode.has(input.nodeId) ||
      typeof input.note !== 'string' ||
      input.note.length > 1500 ||
      !Array.isArray(regions) ||
      regions.length < 1 ||
      regions.length > 15 ||
      !regions.every(validRegion)
    )
      throw new Error('Choose a graph node and at least one valid annotated region');
    let image: Buffer | undefined;
    let source: ReviewRecord['source'];
    if (input.source?.kind === 'capture') {
      const { runId, fileName } = input.source;
      if (
        !uuid.test(runId) ||
        !captureFilename.test(fileName) ||
        !(await this.captureAllowed(runId, fileName, input.platform))
      )
        throw new Error('Screenshot does not belong to a verified run');
      // Copy authorized capture bytes into the immutable review archive.
      // The original run/event journal is in-memory, but the annotated review
      // must remain viewable after restarting the engine.
      image = await readFile(runtimePath('evidence', runId, fileName));
      if (
        image.length < 8 ||
        image.subarray(0, 8).toString('hex') !== '89504e470d0a1a0a' ||
        image.length > 8 * 1024 * 1024
      )
        throw new Error('Captured PNG is invalid or too large');
      source = { kind: 'capture', runId, fileName };
    } else if (input.source?.kind === 'upload') {
      image = parseUpload(input.source.imageData);
      source = { kind: 'upload' };
    } else if (input.source?.kind === 'review') {
      const { reviewId } = input.source;
      const original = (await this.listReviews()).find((item) => item.id === reviewId);
      if (
        !uuid.test(reviewId) ||
        !original ||
        original.platform !== input.platform ||
        original.handle !== input.handle ||
        original.pageUrl !== pageUrl
      )
        throw new Error('Image review does not belong to this page and owner');
      image = await readFile(resolve(root, reviewId + '.img'));
      if (image.length > 8 * 1024 * 1024) throw new Error('Reviewed image is too large');
      source = { kind: 'review', reviewId };
    } else throw new Error('Choose an actual run screenshot or uploaded image');
    const entry: ReviewRecord = {
      id: randomUUID(),
      ownerId: this.ownerId,
      createdAt: new Date().toISOString(),
      platform: input.platform,
      handle: input.handle,
      pageUrl,
      nodeId: input.nodeId,
      note: input.note,
      regions,
      annotations,
      editEvents: annotations ? editEvents : undefined,
      source,
    };
    return this.serialize(async () => {
      const list = await readArray<ReviewRecord>(recordFile);
      if (list.filter((review) => isOwnedBy(review, this.ownerId)).length >= 200)
        throw new Error('Visual review limit reached; archive older reviews first');
      await mkdir(root, { recursive: true, mode: 0o700 });
      if (image)
        await writeFile(resolve(root, entry.id + '.img'), image, {
          mode: 0o600,
          flag: 'wx',
        });
      if (annotations)
        await writeFile(resolve(root, entry.id + '.yaml'), reviewYaml(entry), {
          mode: 0o600,
          flag: 'wx',
        });
      await atomicJson(recordFile, [...list, entry]);
      return entry;
    });
  }
  async yamlFor(id: string): Promise<string | null> {
    if (!uuid.test(id)) return null;
    const item = (await this.listReviews()).find((x) => x.id === id);
    if (!item || !item.annotations) return null;
    return readFile(resolve(root, id + '.yaml'), 'utf8');
  }
  async imageFor(id: string): Promise<{ bytes: Buffer; mime: string } | null> {
    if (!uuid.test(id)) return null;
    const item = (await this.listReviews()).find((x) => x.id === id);
    if (!item) return null;
    try {
      const bytes = await readFile(resolve(root, id + '.img'));
      return { bytes, mime: mimeFor(bytes) };
    } catch (e) {
      if ((e as NodeJS.ErrnoException).code === 'ENOENT') return null;
      throw e;
    }
  }
  async listNotes(): Promise<IdentityNote[]> {
    return (await readArray<IdentityNote>(memoryFile)).filter((note) => isOwnedBy(note, this.ownerId));
  }
  async addNote(input: {
    platform: Platform;
    handle: string;
    pageUrl: string;
    text: string;
  }): Promise<IdentityNote> {
    if (
      !['linkedin', 'x'].includes(input?.platform) ||
      typeof input.handle !== 'string' ||
      typeof input.pageUrl !== 'string'
    )
      throw new Error('Valid owner scope required');
    const scope = normalizePageScope(input.platform, input.handle, input.pageUrl);
    if (typeof input.text !== 'string' || input.text.trim().length < 3 || input.text.length > 800)
      throw new Error('Memory note must be 3–800 characters');
    const note: IdentityNote = {
      id: randomUUID(),
      ownerId: this.ownerId,
      createdAt: new Date().toISOString(),
      platform: input.platform,
      scope,
      text: input.text.trim(),
    };
    return this.serialize(async () => {
      const list = await readArray<IdentityNote>(memoryFile);
      if (list.filter((item) => isOwnedBy(item, this.ownerId)).length >= 250)
        throw new Error('Identity memory limit reached');
      await atomicJson(memoryFile, [...list, note]);
      return note;
    });
  }
}
