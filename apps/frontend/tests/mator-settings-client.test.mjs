import assert from 'node:assert/strict';
import { afterEach, test } from 'node:test';
import {
  fetchMatorSettings,
  matorSettingsUrl,
  saveMatorSettings,
} from '../components/mator/mator-api.ts';

const originalFetch = globalThis.fetch;
afterEach(() => {
  globalThis.fetch = originalFetch;
});

test('mator settings use the same-origin API proxy path', () => {
  assert.equal(matorSettingsUrl(), '/api/mator/settings');
});

test('fetchMatorSettings returns masked settings from GET', async () => {
  globalThis.fetch = async (url, options) => {
    assert.equal(url, '/api/mator/settings');
    assert.equal(options.cache, 'no-store');
    return new Response(
      JSON.stringify({
        groqKeyConfigured: true,
        autoApprove: false,
        squashPipelineHistory: true,
        howTtsEnabled: true,
        modelId: 'openai/gpt-oss-20b',
      }),
      { status: 200 }
    );
  };
  assert.deepEqual(await fetchMatorSettings(), {
    groqKeyConfigured: true,
    autoApprove: false,
    squashPipelineHistory: true,
    howTtsEnabled: true,
    modelId: 'openai/gpt-oss-20b',
  });
});

test('saveMatorSettings PUTs JSON and returns masked response without echoing key', async () => {
  globalThis.fetch = async (url, options) => {
    assert.equal(url, '/api/mator/settings');
    assert.equal(options.method, 'PUT');
    assert.deepEqual(JSON.parse(options.body), {
      groqApiKey: 'gsk_secret',
      autoApprove: true,
    });
    return new Response(
      JSON.stringify({
        groqKeyConfigured: true,
        autoApprove: true,
        squashPipelineHistory: false,
        howTtsEnabled: true,
        modelId: 'openai/gpt-oss-20b',
      }),
      { status: 200 }
    );
  };
  const saved = await saveMatorSettings({
    groqApiKey: 'gsk_secret',
    autoApprove: true,
  });
  assert.equal(saved.groqKeyConfigured, true);
  assert.equal('groqApiKey' in saved, false);
});

test('saveMatorSettings surfaces backend errors', async () => {
  globalThis.fetch = async () =>
    new Response(JSON.stringify({ error: 'Groq API key cannot be empty' }), {
      status: 400,
    });
  await assert.rejects(
    saveMatorSettings({ groqApiKey: '' }),
    /Groq API key cannot be empty/
  );
});
