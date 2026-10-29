import assert from 'node:assert/strict';
import { test } from 'node:test';
import { fetchGrowthRunJournal } from '../lib/growth-run-journal.ts';

test('journal request uses the child run identifier and forwards cancellation', async () => {
  const previous = globalThis.fetch;
  try {
    const controller = new AbortController();
    const entries = [{ kind: 'step', message: 'Started' }];
    globalThis.fetch = async (path, options) => {
      assert.equal(path, '/api/runs/run%2Fone/logs');
      assert.equal(options.cache, 'no-store');
      assert.equal(options.signal, controller.signal);
      return { ok: true, json: async () => entries };
    };
    assert.deepEqual(
      await fetchGrowthRunJournal('run/one', controller.signal),
      entries
    );
  } finally {
    globalThis.fetch = previous;
  }
});

test('journal request reports server errors without claiming tasks completed', async () => {
  const previous = globalThis.fetch;
  try {
    globalThis.fetch = async () => ({ ok: false, status: 503 });
    await assert.rejects(
      fetchGrowthRunJournal('run-one', new AbortController().signal),
      /Runner event journal unavailable \(HTTP 503\)/
    );
    globalThis.fetch = async () => ({
      ok: true,
      json: async () => ({ task: 'fake' }),
    });
    await assert.rejects(
      fetchGrowthRunJournal('run-one', new AbortController().signal),
      /Invalid Runner journal/
    );
  } finally {
    globalThis.fetch = previous;
  }
});
