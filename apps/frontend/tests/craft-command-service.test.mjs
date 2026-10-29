import assert from 'node:assert/strict';
import { afterEach, test } from 'node:test';
import { executeCraftCommand } from '../components/dashboard/pipeline/craft-command-service.ts';

const originalFetch = globalThis.fetch;
afterEach(() => {
  globalThis.fetch = originalFetch;
});

const craft = {
  id: 'craft-one',
  slug: 'candidate-profile',
  name: 'Candidate',
  description: 'Original',
  category: 'portfolio',
  enabled: false,
  version: 7,
  updatedAt: '2026-10-29',
  scope: 'personal',
  steps: [],
  links: [],
};

test('craft help opens the library without writing anything', async () => {
  let calls = 0;
  globalThis.fetch = async (url) => {
    calls++;
    assert.equal(url, '/api/crafts');
    return Response.json([]);
  };
  const result = await executeCraftCommand('/craft help', null);
  assert.equal(result.kind, 'list');
  assert.match(result.notice, /Crafts opened/);
  assert.equal(calls, 1);
});

test('craft open resolves an existing slug without writing', async () => {
  globalThis.fetch = async () => Response.json([craft]);
  const result = await executeCraftCommand(
    '/craft open candidate-profile',
    null
  );
  assert.deepEqual(result.kind, 'open');
  assert.equal(result.id, craft.id);
  assert.equal(result.slug, craft.slug);
});

test('craft updates use the selected ID and exact version', async () => {
  const requests = [];
  globalThis.fetch = async (url, options) => {
    requests.push({ url, options });
    return url === '/api/crafts'
      ? Response.json([craft])
      : Response.json({ ...craft, version: 8, name: 'Updated name' });
  };
  const result = await executeCraftCommand(
    '/craft rename Updated name',
    craft.id
  );
  assert.equal(result.kind, 'updated');
  assert.equal(result.id, craft.id);
  assert.match(result.notice, /v8/);
  assert.equal(requests[1].url, '/api/crafts/craft-one');
  assert.equal(requests[1].options.method, 'PUT');
  assert.deepEqual(JSON.parse(requests[1].options.body), {
    expectedVersion: 7,
    craft: {
      slug: craft.slug,
      name: 'Updated name',
      description: craft.description,
      category: craft.category,
      enabled: craft.enabled,
      steps: craft.steps,
      links: craft.links,
    },
  });
});

test('craft commands surface missing craft and API errors', async () => {
  globalThis.fetch = async () => Response.json([craft]);
  await assert.rejects(
    executeCraftCommand('/craft open absent', null),
    /No craft matches/
  );
  await assert.rejects(
    executeCraftCommand('/craft rename X', 'absent'),
    /Select a craft/
  );
  globalThis.fetch = async () =>
    Response.json({ error: 'Conflict' }, { status: 409 });
  await assert.rejects(
    executeCraftCommand('/craft help', null),
    /Craft library is unavailable/
  );
});
