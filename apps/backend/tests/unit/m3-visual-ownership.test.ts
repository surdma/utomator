import { randomUUID } from 'node:crypto';
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { resolve } from 'node:path';
import { afterAll, beforeEach, expect, test, vi } from 'vitest';

const root = await mkdtemp(resolve(tmpdir(), 'utomator-m3-visual-'));
vi.mock('../../src/infrastructure/runtime/paths.js', () => ({
  runtimePath: (...parts: string[]) => resolve(root, ...parts),
}));
const { VisualReviewStore } = await import('../../src/infrastructure/runs/visual-review.js');
const alice = '11111111-1111-4111-8111-111111111111';
const bob = '22222222-2222-4222-8222-222222222222';
const mine = randomUUID(),
  foreign = randomUUID(),
  legacy = randomUUID();
const image =
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+/cWQAAAAASUVORK5CYII=';
const scope = { platform: 'x' as const, handle: 'review_owner', pageUrl: 'https://x.com/review_owner' };
const region = { x: 0.1, y: 0.1, width: 0.4, height: 0.3, label: 'Bio', request: 'Inspect this text' };
const records = [{ id: mine, ownerId: alice }, { id: foreign, ownerId: bob }, { id: legacy }].map(
  (identity) => ({
    ...identity,
    ...scope,
    createdAt: new Date().toISOString(),
    nodeId: 'inspect',
    note: '',
    regions: [region],
    annotations: [{ id: 'mark', shape: 'rectangle', ...region, action: 'inspect', comment: 'Inspect' }],
    source: { kind: 'upload' },
  }),
);

beforeEach(async () => {
  await mkdir(resolve(root, 'visual'), { recursive: true });
  await writeFile(resolve(root, 'visual', 'reviews.json'), JSON.stringify(records));
  await writeFile(
    resolve(root, 'visual', 'identity-notes.json'),
    JSON.stringify(
      records.map(({ id, ownerId }) => ({
        id,
        ownerId,
        platform: 'x',
        createdAt: new Date().toISOString(),
        scope: scope.pageUrl,
        text: 'Private note',
      })),
    ),
  );
  for (const record of records) {
    await writeFile(resolve(root, 'visual', record.id + '.img'), Buffer.from(image, 'base64'));
    await writeFile(resolve(root, 'visual', record.id + '.yaml'), 'private: annotation\n');
  }
});

afterAll(async () => {
  await rm(root, { recursive: true, force: true });
});

test('review and note discovery expose only an explicitly matching owner', async () => {
  const store = new VisualReviewStore(() => true, alice);
  expect((await store.listReviews()).map((review) => review.id)).toEqual([mine]);
  expect((await store.listNotes()).map((note) => note.id)).toEqual([mine]);
});

test.each([foreign, legacy])(
  'denies image, annotation YAML and reuse for unowned review %s',
  async (id) => {
    const store = new VisualReviewStore(() => true, alice);
    expect(await store.imageFor(id)).toBeNull();
    expect(await store.yamlFor(id)).toBeNull();
    await expect(
      store.addReview({
        ...scope,
        nodeId: 'inspect',
        note: '',
        regions: [region],
        source: { kind: 'review', reviewId: id },
      }),
    ).rejects.toThrow(/owner|review/i);
  },
);

test('new visual records use the trusted owner and retain foreign archive records', async () => {
  const store = new VisualReviewStore(() => true, alice);
  const created = await store.addReview({
    ...scope,
    nodeId: 'inspect',
    note: '',
    regions: [region],
    source: { kind: 'upload', imageData: 'data:image/png;base64,' + image },
  });
  expect(created.ownerId).toBe(alice);
  expect(await store.imageFor(created.id)).not.toBeNull();
  const persisted = JSON.parse(await readFile(resolve(root, 'visual', 'reviews.json'), 'utf8'));
  expect(persisted.some((entry: { id: string }) => entry.id === foreign)).toBe(true);
  expect(persisted.some((entry: { id: string }) => entry.id === legacy)).toBe(true);
  const note = await store.addNote({ ...scope, text: 'Keep actual evidence visible' });
  expect(note.ownerId).toBe(alice);
});
