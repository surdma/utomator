
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test, expect } from 'vitest';
import type { DocumentRecord, DocumentStore } from '../src/db/documents.js';
import {
  getAttachmentFile,
  getAttachmentMeta,
  MATOR_ATTACHMENT_IMAGE_MAX_BYTES,
  MATOR_ATTACHMENTS_NAMESPACE,
  saveAttachment,
  upsertMarkers,
  validateMatorAsset,
} from '../src/mator/mator-attachments.js';
import { createConversation } from '../src/mator/mator-conversations.js';

type Row = { version: number; value: unknown };
class FakeDocuments implements DocumentStore {
  readonly dialect = 'sqlite' as const;
  readonly rows = new Map<string, Row>();
  constructor(readonly ownerId: string) {}
  async get<T>(namespace: string, key: string): Promise<DocumentRecord<T> | null> {
    const row = this.rows.get(`${namespace}:${key}`);
    return row ? { key, version: row.version, value: row.value as T } : null;
  }
  async put<T>(namespace: string, key: string, value: T, expectedVersion: number) {
    const id = `${namespace}:${key}`,
      existing = this.rows.get(id);
    if (!expectedVersion) {
      if (existing) throw Error('Database document changed. Reload before saving.');
      this.rows.set(id, { version: 1, value });
      return 1;
    }
    if (!existing || existing.version !== expectedVersion)
      throw Error('Database document changed. Reload before saving.');
    existing.version = expectedVersion + 1;
    existing.value = value;
    return existing.version;
  }
  async list<T>(namespace: string) {
    return [...this.rows.entries()]
      .filter(([id]) => id.startsWith(`${namespace}:`))
      .map(([id, row]) => ({
        key: id.slice(namespace.length + 1),
        version: row.version,
        value: row.value as T,
      }));
  }
  async remove(namespace: string, key: string, expectedVersion: number) {
    const id = `${namespace}:${key}`,
      existing = this.rows.get(id);
    if (!existing || existing.version !== expectedVersion)
      throw Error('Database document changed. Reload before saving.');
    this.rows.delete(id);
  }
  async close() {}
}

test('saveAttachment roundtrips bytes and metadata via getAttachmentFile', async () => {
  const root = await mkdtemp(join(tmpdir(), 'mator-attach-'));
  try {
    const docs = new FakeDocuments('local-owner');
    const conv = await createConversation(docs, 'wf-attachments');
    const bytes = Buffer.from('fake-png-bytes');
    const saved = await saveAttachment(
      docs,
      {
        conversationId: conv.id,
        filename: 'screenshot.png',
        mime: 'image/png',
        bytes,
      },
      { root },
    );

    expect(saved.kind).toEqual('image');
    expect(saved.mime).toEqual('image/png');
    expect(saved.size).toEqual(bytes.length);

    const loaded = await getAttachmentFile(docs, saved.id, { root });
    expect(loaded.bytes).toEqual(bytes);
    expect(loaded.meta.conversationId).toEqual(conv.id);
    expect(loaded.meta.filename).toEqual('screenshot.png');
    expect(docs.rows.has(`${MATOR_ATTACHMENTS_NAMESPACE}:${saved.id}`)).toBeTruthy();
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test('upsertMarkers clamps x/y to [0,1] and requires text', async () => {
  const root = await mkdtemp(join(tmpdir(), 'mator-attach-'));
  try {
    const docs = new FakeDocuments('local-owner');
    const conv = await createConversation(docs, 'wf-markers');
    const saved = await saveAttachment(
      docs,
      {
        conversationId: conv.id,
        filename: 'frame.jpg',
        mime: 'image/jpeg',
        bytes: Buffer.from([1, 2, 3]),
      },
      { root },
    );

    const updated = await upsertMarkers(docs, saved.id, [
      { id: 'm1', x: -0.25, y: 1.75, text: '  pin here  ' },
    ]);
    expect(updated.markers?.length).toEqual(1);
    expect(updated.markers?.[0]).toEqual({ id: 'm1', x: 0, y: 1, text: 'pin here' });

    await expect(() => upsertMarkers(docs, saved.id, [{ id: 'm2', x: 0.5, y: 0.5, text: '   ' }])).rejects.toThrow(/Marker text is required/);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test('upsertMarkers validates and persists review references', async () => {
  const root = await mkdtemp(join(tmpdir(), 'mator-review-'));
  try {
    const docs = new FakeDocuments('local-owner');
    const conv = await createConversation(docs, 'wf-reviews');
    const savedA = await saveAttachment(
      docs,
      {
        conversationId: conv.id,
        filename: 'one.png',
        mime: 'image/png',
        bytes: Buffer.from([1]),
      },
      { root },
    );
    const savedB = await saveAttachment(
      docs,
      {
        conversationId: conv.id,
        filename: 'two.png',
        mime: 'image/png',
        bytes: Buffer.from([2]),
      },
      { root },
    );
    const reviewId = '123e4567-e89b-42d3-a456-426614174000';

    await expect(() => upsertMarkers(docs, savedA.id, [], 'not-a-review-id')).rejects.toThrow(/Invalid review reference/);
    const linked = await upsertMarkers(docs, savedA.id, [], reviewId);
    expect(linked.reviewId).toEqual(reviewId);
    const unrelated = await getAttachmentMeta(docs, savedB.id);
    expect(unrelated.reviewId).toEqual(undefined);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test('saveAttachment rejects unknown conversation', async () => {
  const root = await mkdtemp(join(tmpdir(), 'mator-attach-'));
  try {
    const docs = new FakeDocuments('local-owner');
    await expect(() =>
        saveAttachment(
          docs,
          {
            conversationId: '00000000-0000-4000-8000-000000000099',
            filename: 'orphan.png',
            mime: 'image/png',
            bytes: Buffer.from('x'),
          },
          { root },
        )).rejects.toThrow(/Conversation not found/);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test('getAttachmentFile is scoped to document owner', async () => {
  const root = await mkdtemp(join(tmpdir(), 'mator-attach-'));
  try {
    const ownerA = new FakeDocuments('00000000-0000-4000-8000-0000000000aa');
    const ownerB = new FakeDocuments('00000000-0000-4000-8000-0000000000bb');
    const conv = await createConversation(ownerA, 'wf-owner-scope');
    const saved = await saveAttachment(
      ownerA,
      {
        conversationId: conv.id,
        filename: 'secret.png',
        mime: 'image/png',
        bytes: Buffer.from('secret'),
      },
      { root },
    );

    await expect(() => getAttachmentFile(ownerB, saved.id, { root })).rejects.toThrow(/Attachment not found/);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test('saveAttachment rejects oversized images', async () => {
  const root = await mkdtemp(join(tmpdir(), 'mator-attach-'));
  try {
    const docs = new FakeDocuments('local-owner');
    const conv = await createConversation(docs, 'wf-oversize');
    const tooLarge = Buffer.alloc(MATOR_ATTACHMENT_IMAGE_MAX_BYTES + 1);
    await expect(() =>
        saveAttachment(
          docs,
          {
            conversationId: conv.id,
            filename: 'huge.png',
            mime: 'image/png',
            bytes: tooLarge,
          },
          { root },
        )).rejects.toThrow(/Attachment size limit exceeded/);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test('supports raster images and TXT/README assets but rejects active or unsupported types', () => {
  for (const [filename, mime] of [
    ['diagram.png', 'image/png'],
    ['photo.jpeg', 'image/jpeg'],
    ['figure.webp', 'image/webp'],
    ['notes.txt', 'text/plain'],
    ['README', 'application/octet-stream'],
    ['README.md', 'text/markdown'],
  ]) {
    expect(() => validateMatorAsset(filename, mime)).not.toThrow();
  }
  for (const [filename, mime] of [
    ['attack.svg', 'image/svg+xml'],
    ['page.html', 'text/html'],
    ['report.pdf', 'application/pdf'],
    ['movie.mp4', 'video/mp4'],
    ['fake.png', 'text/html'],
    ['page.html', 'image/png'],
  ]) {
    expect(() => validateMatorAsset(filename, mime)).toThrow(/Unsupported attachment type/);
  }
});

test('attachment metadata is owner scoped and retains the original filename', async () => {
  const docs = new FakeDocuments('owner-metadata');
  const root = await mkdtemp(join(tmpdir(), 'mator-assets-'));
  try {
    const conv = await createConversation(docs, 'wf-metadata');
    const result = await saveAttachment(
      docs,
      {
        conversationId: conv.id,
        filename: 'README.md',
        mime: 'text/markdown',
        bytes: Buffer.from('# Project'),
      },
      { root },
    );
    const meta = await getAttachmentMeta(docs, result.id);
    expect(meta.filename).toEqual('README.md');
    expect(meta.mime).toEqual('text/markdown');
    expect(meta.conversationId).toEqual(conv.id);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
