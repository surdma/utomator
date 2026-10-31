import { randomUUID } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { basename, extname, join, resolve } from 'node:path';
import { MATOR_CONVERSATIONS_NAMESPACE } from './mator-conversations.js';
import type { DocumentStore } from '../db/documents.js';

export const MATOR_ATTACHMENTS_NAMESPACE = 'mator-attachments';

/** Image attachments: max 20MB. Video attachments: max 50MB. Other types use the image cap. */
export const MATOR_ATTACHMENT_IMAGE_MAX_BYTES = 20 * 1024 * 1024;
export const MATOR_ATTACHMENT_VIDEO_MAX_BYTES = 50 * 1024 * 1024;

export type MatorAttachmentKind = 'image' | 'video' | 'other';

export type MatorImageMarker = { id: string; x: number; y: number; text: string };

export type MatorAttachmentMeta = {
  id: string;
  conversationId: string;
  filename: string;
  mime: string;
  size: number;
  kind: MatorAttachmentKind;
  relativePath: string;
  markers: MatorImageMarker[];
  createdAt: string;
};

type WorkflowConversationIndex = {
  currentId: string | null;
  items: Array<{ id: string }>;
};

const defaultAttachmentRoot = () => resolve(process.cwd(), '.runtime', 'mator-attachments');

const nowIso = () => new Date().toISOString();

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

  const mime = input.mime.trim() || 'application/octet-stream';
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
): Promise<MatorAttachmentMeta> {
  for (;;) {
    const loaded = await loadMeta(docs, attachmentId);
    if (!loaded) throw Error('Attachment not found');
    const normalized = markers.map(normalizeMarker);
    const next: MatorAttachmentMeta = { ...loaded.value, markers: normalized };
    try {
      await docs.put(MATOR_ATTACHMENTS_NAMESPACE, attachmentId, next, loaded.version);
      return next;
    } catch (error) {
      if (!(error instanceof Error) || !/changed/i.test(error.message)) throw error;
    }
  }
}
