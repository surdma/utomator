import { randomUUID } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { basename, extname, join, resolve } from 'node:path';
import { MATOR_CONVERSATIONS_NAMESPACE } from './mator-conversations.js';
import type { DocumentStore } from '../db/documents.js';

export const MATOR_ATTACHMENTS_NAMESPACE = 'mator-attachments';

/** Chat assets are limited to safe raster images and plain-text/README files. */
export const MATOR_ATTACHMENT_IMAGE_MAX_BYTES = 20 * 1024 * 1024;
export const MATOR_ATTACHMENT_VIDEO_MAX_BYTES = 50 * 1024 * 1024;

export type MatorAttachmentKind = 'image' | 'video' | 'other';

export type MatorImageMarker = { id: string; x: number; y: number; text: string };

/** Review records use the randomUUID shape; YAML only exists for tagged reviews. */
export const MATOR_REVIEW_ID_PATTERN = /^[a-f0-9-]{36}$/i;

export type MatorAttachmentMeta = {
  id: string;
  conversationId: string;
  filename: string;
  mime: string;
  size: number;
  kind: MatorAttachmentKind;
  relativePath: string;
  markers: MatorImageMarker[];
  /** Saved visual review (annotation YAML) linked from the operator studio. */
  reviewId?: string;
  createdAt: string;
};

type WorkflowConversationIndex = {
  currentId: string | null;
  items: Array<{ id: string }>;
};

const defaultAttachmentRoot = () => resolve(process.cwd(), '.runtime', 'mator-attachments');

const nowIso = () => new Date().toISOString();

const safeImages: Record<string, string[]> = {
  'image/png': ['.png'],
  'image/jpeg': ['.jpg', '.jpeg'],
  'image/webp': ['.webp'],
  'image/gif': ['.gif'],
  'image/avif': ['.avif'],
  'image/bmp': ['.bmp'],
  'image/tiff': ['.tif', '.tiff'],
  'image/heic': ['.heic'],
  'image/heif': ['.heif'],
};

export function validateMatorAsset(filename: string, mime: string): void {
  const name = basename(filename).toLowerCase();
  const ext = extname(name);
  const acceptedImageExtensions = safeImages[mime.toLowerCase()];
  if (acceptedImageExtensions?.includes(ext)) return;
  const isText = ['text/plain', 'text/markdown', 'application/octet-stream'].includes(mime.toLowerCase());
  const safeTextName = ['.txt', '.md', '.markdown', '.readme'].includes(ext) ||
    /^readme(?:\.[a-z0-9_-]+)?$/.test(name);
  if (isText && safeTextName) return;
  throw Error('Unsupported attachment type. Use a raster image, TXT or README file.');
}

const kindFromMime = (mime: string): MatorAttachmentKind => {
  if (mime.startsWith('image/')) return 'image';
  if (mime.startsWith('video/')) return 'video';
  return 'other';
};

const maxBytesForKind = (kind: MatorAttachmentKind) =>
  kind === 'video' ? MATOR_ATTACHMENT_VIDEO_MAX_BYTES : MATOR_ATTACHMENT_IMAGE_MAX_BYTES;

const sanitizeFilename = (filename: string) => {
  const base = basename(filename.trim() || 'attachment');
  const cleaned = base.replace(/[^\w.\-()+@ ]+/g, '_').slice(0, 120);
  return cleaned || 'attachment';
};

async function conversationExists(docs: DocumentStore, conversationId: string): Promise<boolean> {
  const records = await docs.list<WorkflowConversationIndex>(MATOR_CONVERSATIONS_NAMESPACE);
  for (const record of records) {
    if (!record.key.startsWith('workflow:')) continue;
    if (record.value.items.some((item) => item.id === conversationId)) return true;
  }
  return false;
}

async function loadMeta(docs: DocumentStore, id: string): Promise<{ version: number; value: MatorAttachmentMeta } | null> {
  const record = await docs.get<MatorAttachmentMeta>(MATOR_ATTACHMENTS_NAMESPACE, id);
  if (!record) return null;
  return { version: record.version, value: record.value };
}

const normalizeMarker = (marker: MatorImageMarker): MatorImageMarker => {
  const text = marker.text?.trim();
  if (!text) throw Error('Marker text is required');
  return {
    id: marker.id,
    x: Math.min(1, Math.max(0, marker.x)),
    y: Math.min(1, Math.max(0, marker.y)),
    text,
  };
};

export async function saveAttachment(
  docs: DocumentStore,
  input: { conversationId: string; filename: string; mime: string; bytes: Buffer | Uint8Array },
  options?: { root?: string },
): Promise<{ id: string; mime: string; size: number; kind: MatorAttachmentKind }> {
  if (!(await conversationExists(docs, input.conversationId))) throw Error('Conversation not found');

  const mime = input.mime.trim().toLowerCase() || 'application/octet-stream';
  validateMatorAsset(input.filename, mime);
  const kind = kindFromMime(mime);
  const bytes = Buffer.from(input.bytes);
  const maxBytes = maxBytesForKind(kind);
  if (bytes.length > maxBytes) throw Error('Attachment size limit exceeded');

  const id = randomUUID();
  const filename = sanitizeFilename(input.filename);
  const ext = extname(filename);
  const diskName = `${id}${ext}`;
  const relativePath = join(docs.ownerId, input.conversationId, diskName);
  const root = options?.root ?? defaultAttachmentRoot();
  const absolutePath = join(root, relativePath);

  await mkdir(join(root, docs.ownerId, input.conversationId), { recursive: true });
  await writeFile(absolutePath, bytes);

  const meta: MatorAttachmentMeta = {
    id,
    conversationId: input.conversationId,
    filename,
    mime,
    size: bytes.length,
    kind,
    relativePath,
    markers: [],
    createdAt: nowIso(),
  };
  await docs.put(MATOR_ATTACHMENTS_NAMESPACE, id, meta, 0);

  return { id, mime, size: bytes.length, kind };
}

export async function getAttachmentMeta(
  docs: DocumentStore,
  id: string
): Promise<MatorAttachmentMeta> {
  const record = await loadMeta(docs, id);
  if (!record) throw Error('Attachment not found');
  return record.value;
}

export async function getAttachmentFile(
  docs: DocumentStore,
  id: string,
  options?: { root?: string },
): Promise<{ meta: MatorAttachmentMeta; bytes: Buffer }> {
  const loaded = await loadMeta(docs, id);
  if (!loaded) throw Error('Attachment not found');

  const root = options?.root ?? defaultAttachmentRoot();
  const absolutePath = join(root, loaded.value.relativePath);
  const bytes = await readFile(absolutePath);
  return { meta: loaded.value, bytes };
}

export async function upsertMarkers(
  docs: DocumentStore,
  attachmentId: string,
  markers: MatorImageMarker[],
  reviewId?: string,
): Promise<MatorAttachmentMeta> {
  if (
    reviewId !== undefined &&
    (typeof reviewId !== 'string' || !MATOR_REVIEW_ID_PATTERN.test(reviewId))
  )
    throw Error('Invalid review reference');
  for (;;) {
    const loaded = await loadMeta(docs, attachmentId);
    if (!loaded) throw Error('Attachment not found');
    const normalized = markers.map(normalizeMarker);
    const next: MatorAttachmentMeta = {
      ...loaded.value,
      markers: normalized,
      ...(reviewId !== undefined ? { reviewId } : {}),
    };
    try {
      await docs.put(MATOR_ATTACHMENTS_NAMESPACE, attachmentId, next, loaded.version);
      return next;
    } catch (error) {
      if (!(error instanceof Error) || !/changed/i.test(error.message)) throw error;
    }
  }
}
