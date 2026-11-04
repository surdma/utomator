
import { afterEach, test, expect } from 'vitest';
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
    expect(url).toEqual('/api/crafts');
    return Response.json([]);
  };
  const result = await executeCraftCommand('/craft help', null);
  expect(result.kind).toEqual('list');
  expect(result.notice).toMatch(/Crafts opened/);
  expect(calls).toEqual(1);
});

test('craft open resolves an existing slug without writing', async () => {
  globalThis.fetch = async () => Response.json([craft]);
  const result = await executeCraftCommand(
    '/craft open candidate-profile',
    null,
  );
  expect(result.kind).toEqual('open');
  expect(result.id).toEqual(craft.id);
  expect(result.slug).toEqual(craft.slug);
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
    craft.id,
  );
  expect(result.kind).toEqual('updated');
  expect(result.id).toEqual(craft.id);
  expect(result.notice).toMatch(/v8/);
  expect(requests[1].url).toEqual('/api/crafts/craft-one');
  expect(requests[1].options.method).toEqual('PUT');
  expect(JSON.parse(requests[1].options.body)).toEqual({
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
  await expect((executeCraftCommand('/craft open absent', null))).rejects.toThrow(/No craft matches/);
  await expect((executeCraftCommand('/craft rename X', 'absent'))).rejects.toThrow(/Select a craft/);
  globalThis.fetch = async () =>
    Response.json({ error: 'Conflict' }, { status: 409 });
  await expect((executeCraftCommand('/craft help', null))).rejects.toThrow(/Craft library is unavailable/);
});
