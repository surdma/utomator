import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { afterEach, test } from 'node:test';
import { patchMatorMarkers } from '../components/mator/mator-api.ts';

const root = resolve(import.meta.dirname, '..');
const mator = (name) => resolve(root, 'components/mator', name);
const workflows = (name) =>
  resolve(root, 'components/dashboard/workflows', name);

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
    assert.equal(
      url,
      '/api/mator/attachments/att-1/markers',
      'marker links use the same allowlisted proxy path',
    );
    assert.equal(options.method, 'PATCH');
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
  assert.deepEqual(payload.markers, [
    { id: 'm1', x: 0.5, y: 0.5, text: 'here' },
  ]);
  assert.equal(
    payload.reviewId,
    '123e4567-e89b-42d3-a456-426614174000',
    'the saved review reference travels with the markers',
  );
  assert.equal(saved.reviewId, '123e4567-e89b-42d3-a456-426614174000');
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
  assert.deepEqual(Object.keys(payload), ['markers']);
});

test('a failed review link rejects with the backend message (no fake success)', async () => {
  globalThis.fetch = async () =>
    new Response(JSON.stringify({ error: 'Review does not exist' }), {
      status: 400,
      headers: { 'content-type': 'application/json' },
    });
  await assert.rejects(
    patchMatorMarkers('att-1', [], '00000000-0000-4000-8000-000000000000'),
    /Review does not exist/,
  );
});

test('annotate flow resolves honestly: dismissed studio yields null', () => {
  const source = readFileSync(mator('use-visual-reviews.ts'), 'utf8');
  assert.match(
    source,
    /annotateChatAsset[\s\S]*?new Promise/,
    'annotateChatAsset resolves through a pending promise',
  );
  assert.match(
    source,
    /closeImageDraft[\s\S]*?resolve\(null\)/,
    'closing the studio resolves null instead of inventing a review id',
  );
  assert.match(
    source,
    /saveVisualReview[\s\S]*?resolve\(\{ reviewId: json\.id \}\)/,
    'only a real saved POST resolves with a review id',
  );
});

test('sent attachments link the saved review through saveMarkers', () => {
  const panel = readFileSync(mator('operator-chat-panel.tsx'), 'utf8');
  assert.match(
    panel,
    /annotateAsset[\s\S]*?onSaveMarkers\(asset\.id, asset\.markers \?\? \[\], result\.reviewId\)/,
    'the existing markers are preserved when linking the review',
  );
  assert.match(
    panel,
    /mator-annotate-attachment-error/,
    'link failures surface instead of being swallowed',
  );
  assert.match(
    panel,
    /Saved as review \$\{result\.reviewId\} but could not link to the chat message\. Re-open the annotation editor to retry\./,
    'a saved review whose asset link fails is reported as a failed link',
  );
});

test('the shell awaits marker links instead of discarding them', () => {
  const shell = readFileSync(
    resolve(root, 'components/dashboard/dashboard-shell.tsx'),
    'utf8',
  );
  assert.doesNotMatch(
    shell,
    /void saveMarkers\(/,
    'discarding the markers promise would hide a failed review link',
  );
  assert.match(shell, /return saveMarkers\(attachmentId, markers, reviewId\)/);
});

test('fetched chat images use the same size and type rules as uploads', () => {
  const shell = readFileSync(
    resolve(root, 'components/dashboard/dashboard-shell.tsx'),
    'utf8',
  );
  assert.match(
    shell,
    /validateReviewImage\(\{\s*size: blob\.size,\s*type: blob\.type/,
    'an oversized or non-image attachment is an error, not a silent studio open',
  );
});

test('chat annotation carries the typed draft into the review note', () => {
  const reviews = readFileSync(mator('use-visual-reviews.ts'), 'utf8');
  const panel = readFileSync(
    resolve(root, 'components/dashboard/reviews/visual-review-panel.tsx'),
    'utf8',
  );
  assert.match(reviews, /draftNote: request\.note/);
  assert.match(
    panel,
    /note: source\.kind === 'upload' \? \(source\.draftNote \?\? ''\) : ''/,
    'the YAML note is the operator draft, and only on chat uploads',
  );
  assert.match(
    panel,
    /kind: 'upload', imageData: source\.imageData/,
    'the posted source stays image bytes and does not include the draft note',
  );
});

test('workflow annotation dialog links saved YAML without touching approval', () => {
  const dialog = readFileSync(
    workflows('workflow-artboard-annotation-dialog.tsx'),
    'utf8',
  );
  assert.match(dialog, /View saved annotation YAML/);
  assert.match(dialog, /Annotate further/);
  assert.match(dialog, /onAnnotateFurther/);
});
