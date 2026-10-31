import assert from 'node:assert/strict';
import { test } from 'node:test';
import { request } from '../lib/growth-profile-client.ts';

test('Growth client sends scoped JSON mutation', async () => {
  const previous = globalThis.fetch;
  try {
    globalThis.fetch = async (url, opts) => {
      assert.equal(url, '/api/growth/templates/profile/runs');
      assert.equal(opts.method, 'POST');
      assert.equal(opts.cache, 'no-store');
      assert.equal(opts.headers['content-type'], 'application/json');
      assert.deepEqual(JSON.parse(opts.body), { accountId: 'owner-123' });
      return { ok: true, json: async () => ({ id: 'run-1' }) };
    };
    assert.deepEqual(
      await request('/api/growth/templates/profile/runs', 'POST', {
        accountId: 'owner-123',
      }),
      { id: 'run-1' }
    );
  } finally {
    globalThis.fetch = previous;
  }
});

test('Growth client reports errors and forwards cancellation', async () => {
  const previous = globalThis.fetch;
  try {
    const controller = new AbortController();
    globalThis.fetch = async (_, opts) => {
      assert.equal(opts.signal, controller.signal);
      return {
        ok: false,
        json: async () => ({ error: 'Missing account scope' }),
      };
    };
    await assert.rejects(
      request(
        '/api/growth/templates/profile',
        'GET',
        undefined,
        controller.signal
      ),
      /Missing account scope/
    );
  } finally {
    globalThis.fetch = previous;
  }
});
