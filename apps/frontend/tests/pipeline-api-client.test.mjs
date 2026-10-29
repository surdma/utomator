import assert from 'node:assert/strict';
import { afterEach, test } from 'node:test';
import { apiPost, getApi } from '../components/dashboard/pipeline/api-client.ts';

const originalFetch = globalThis.fetch;
afterEach(() => {
  globalThis.fetch = originalFetch;
});

test('dashboard API paths remain relative to the same-origin proxy', () => {
  assert.equal(getApi('health'), '/api/health');
  assert.equal(getApi('runs/abc'), '/api/runs/abc');
});

test('dashboard mutations send JSON and return the API response', async () => {
  globalThis.fetch = async (url, options) => {
    assert.equal(url, '/api/runs');
    assert.equal(options.method, 'POST');
    assert.equal(options.headers['content-type'], 'application/json');
    assert.deepEqual(JSON.parse(options.body), { platform: 'linkedin' });
    return new Response(JSON.stringify({ id: 'run-1' }), { status: 201 });
  };
  assert.deepEqual(await apiPost('runs', { platform: 'linkedin' }), {
    id: 'run-1',
  });
});

test('dashboard mutations preserve backend error messages', async () => {
  globalThis.fetch = async () =>
    new Response(JSON.stringify({ error: 'Approval is required' }), {
      status: 409,
    });
  await assert.rejects(apiPost('runs/abc/approve'), /Approval is required/);
});
