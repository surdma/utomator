import { expect, test } from 'vitest';
import { request } from '../modules/growth/model/growth-profile-client.ts';

test('Growth client sends scoped JSON mutation', async () => {
  const previous = globalThis.fetch;
  try {
    globalThis.fetch = async (url, opts) => {
      expect(url).toEqual('/api/growth/templates/profile/runs');
      expect(opts.method).toEqual('POST');
      expect(opts.cache).toEqual('no-store');
      expect(opts.headers['content-type']).toEqual('application/json');
      expect(JSON.parse(opts.body)).toEqual({ accountId: 'owner-123' });
      return { ok: true, json: async () => ({ id: 'run-1' }) };
    };
    expect(
      await request('/api/growth/templates/profile/runs', 'POST', {
        accountId: 'owner-123',
      }),
    ).toEqual({ id: 'run-1' });
  } finally {
    globalThis.fetch = previous;
  }
});

test('Growth client reports errors and forwards cancellation', async () => {
  const previous = globalThis.fetch;
  try {
    const controller = new AbortController();
    globalThis.fetch = async (_, opts) => {
      expect(opts.signal).toEqual(controller.signal);
      return {
        ok: false,
        json: async () => ({ error: 'Missing account scope' }),
      };
    };
    await expect(
      request(
        '/api/growth/templates/profile',
        'GET',
        undefined,
        controller.signal,
      ),
    ).rejects.toThrow(/Missing account scope/);
  } finally {
    globalThis.fetch = previous;
  }
});
