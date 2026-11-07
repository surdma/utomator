import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { afterEach, expect, test } from 'vitest';
import { patchMatorMarkers } from '../modules/mator/components/mator-api.ts';

const root = resolve(import.meta.dirname, '..');
const mator = (name) => resolve(root, 'modules/mator/components', name);
const workflows = (name) => resolve(root, 'modules/workflows/components', name);

const originalFetch = globalThis.fetch;
afterEach(() => {
  globalThis.fetch = originalFetch;
});

function meta(overrides = {}) {
  return {
    id: 'att-1',
    conversationId: 'conv-1',
    filename: 'shot.png',
    mime: 'image/png',
    size: 3,
    kind: 'image',
    markers: [],
    createdAt: new Date().toISOString(),
    ...overrides,
  };
}

test('saving a review link PATCHes markers together with reviewId', async () => {
  let payload;
  globalThis.fetch = async (url, options) => {
    expect(url).toEqual('/api/mator/attachments/att-1/markers');
    expect(options.method).toEqual('PATCH');
    payload = JSON.parse(options.body);
    const body = meta({
      markers: [{ id: 'm1', x: 0.5, y: 0.5, text: 'here' }],
      reviewId: '123e4567-e89b-42d3-a456-426614174000',
    });
    return new Response(JSON.stringify(body), {
      status: 200,
      headers: { 'content-type': 'application/json' },
    });
  };
  const saved = await patchMatorMarkers(
    'att-1',
    [{ id: 'm1', x: 0.5, y: 0.5, text: 'here' }],
    '123e4567-e89b-42d3-a456-426614174000',
  );
  expect(payload.markers).toEqual([{ id: 'm1', x: 0.5, y: 0.5, text: 'here' }]);
  expect(payload.reviewId).toEqual('123e4567-e89b-42d3-a456-426614174000');
  expect(saved.reviewId).toEqual('123e4567-e89b-42d3-a456-426614174000');
});

test('pre-link marker saves stay byte-identical (no reviewId field)', async () => {
  let payload;
  globalThis.fetch = async (_url, options) => {
    payload = JSON.parse(options.body);
    return new Response(
      JSON.stringify(
        meta({ markers: [{ id: 'm2', x: 0, y: 1, text: 'pin' }] }),
      ),
      { status: 200, headers: { 'content-type': 'application/json' } },
    );
  };
  await patchMatorMarkers('att-1', [{ id: 'm2', x: 0, y: 1, text: 'pin' }]);
  expect(Object.keys(payload)).toEqual(['markers']);
});

test('a failed review link rejects with the backend message (no fake success)', async () => {
  globalThis.fetch = async () =>
    new Response(JSON.stringify({ error: 'Review does not exist' }), {
      status: 400,
      headers: { 'content-type': 'application/json' },
    });
  await expect(
    patchMatorMarkers('att-1', [], '00000000-0000-4000-8000-000000000000'),
  ).rejects.toThrow(/Review does not exist/);
});

test('annotate flow resolves honestly: dismissed studio yields null', () => {
  const source = readFileSync(mator('use-visual-reviews.ts'), 'utf8');
  expect(source).toMatch(/annotateChatAsset[\s\S]*?new Promise/);
  expect(source).toMatch(/closeImageDraft[\s\S]*?resolve\(null\)/);
  expect(source).toMatch(
    /saveVisualReview[\s\S]*?resolve\(\{ reviewId: json\.id \}\)/,
  );
});

test('sent attachments link the saved review through saveMarkers', () => {
  const panel = readFileSync(mator('operator-chat-panel.tsx'), 'utf8');
  expect(panel).toMatch(
    /annotateAsset[\s\S]*?onSaveMarkers\(asset\.id, asset\.markers \?\? \[\], result\.reviewId\)/,
  );
  expect(panel).toMatch(/mator-annotate-attachment-error/);
  expect(panel).toMatch(
    /Saved as review \$\{result\.reviewId\} but could not link to the chat message\. Re-open the annotation editor to retry\./,
  );
});

test('the shell awaits marker links instead of discarding them', () => {
  const shell = readFileSync(
    resolve(root, 'modules/shell/components/dashboard-shell.tsx'),
    'utf8',
  );
  expect(shell).not.toMatch(/void saveMarkers\(/);
  expect(shell).toMatch(
    /return saveMarkers\(attachmentId, markers, reviewId\)/,
  );
});

test('fetched chat images use the same size and type rules as uploads', () => {
  const shell = readFileSync(
    resolve(root, 'modules/shell/components/dashboard-shell.tsx'),
    'utf8',
  );
  expect(shell).toMatch(
    /validateReviewImage\(\{\s*size: blob\.size,\s*type: blob\.type/,
  );
});

test('chat annotation carries the typed draft into the review note', () => {
  const reviews = readFileSync(mator('use-visual-reviews.ts'), 'utf8');
  const panel = readFileSync(
    resolve(root, 'modules/reviews/components/visual-review-panel.tsx'),
    'utf8',
  );
  expect(reviews).toMatch(/draftNote: request\.note/);
  expect(panel).toMatch(
    /note: source\.kind === 'upload' \? \(source\.draftNote \?\? ''\) : ''/,
  );
  expect(panel).toMatch(/kind: 'upload'/);
});

test('workflow annotation dialog links saved YAML without touching approval', () => {
  const dialog = readFileSync(
    workflows('workflow-artboard-annotation-dialog.tsx'),
    'utf8',
  );
  expect(dialog).toMatch(/View saved annotation YAML/);
  expect(dialog).toMatch(/Annotate further/);
  expect(dialog).toMatch(/onAnnotateFurther/);
});
