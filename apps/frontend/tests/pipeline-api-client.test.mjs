
import { afterEach, test, expect } from 'vitest';
import {
  apiPost,
  getApi,
} from '../components/dashboard/pipeline/api-client.ts';

const originalFetch = globalThis.fetch;
afterEach(() => {
  globalThis.fetch = originalFetch;
});

test('dashboard API paths remain relative to the same-origin proxy', () => {
  expect(getApi('health')).toEqual('/api/health');
  expect(getApi('runs/abc')).toEqual('/api/runs/abc');
});

test('dashboard mutations send JSON and return the API response', async () => {
  globalThis.fetch = async (url, options) => {
    expect(url).toEqual('/api/runs');
    expect(options.method).toEqual('POST');
    expect(options.headers['content-type']).toEqual('application/json');
    expect(JSON.parse(options.body)).toEqual({ platform: 'linkedin' });
    return new Response(JSON.stringify({ id: 'run-1' }), { status: 201 });
  };
  expect(await apiPost('runs', { platform: 'linkedin' })).toEqual({
    id: 'run-1',
  });
});

test('dashboard mutations preserve backend error messages', async () => {
  globalThis.fetch = async () =>
    new Response(JSON.stringify({ error: 'Approval is required' }), {
      status: 409,
    });
  await expect((apiPost('runs/abc/approve'))).rejects.toThrow(/Approval is required/);
});
