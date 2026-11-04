
import { afterEach, test, expect } from 'vitest';
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
  expect(matorSettingsUrl()).toEqual('/api/mator/settings');
});

test('fetchMatorSettings returns masked settings from GET', async () => {
  globalThis.fetch = async (url, options) => {
    expect(url).toEqual('/api/mator/settings');
    expect(options.cache).toEqual('no-store');
    return new Response(
      JSON.stringify({
        groqKeyConfigured: true,
        autoApprove: false,
        squashPipelineHistory: true,
        howTtsEnabled: true,
        modelId: 'openai/gpt-oss-20b',
      }),
      { status: 200 },
    );
  };
  expect(await fetchMatorSettings()).toEqual({
    groqKeyConfigured: true,
    autoApprove: false,
    squashPipelineHistory: true,
    howTtsEnabled: true,
    modelId: 'openai/gpt-oss-20b',
  });
});

test('saveMatorSettings PUTs JSON and returns masked response without echoing key', async () => {
  globalThis.fetch = async (url, options) => {
    expect(url).toEqual('/api/mator/settings');
    expect(options.method).toEqual('PUT');
    expect(JSON.parse(options.body)).toEqual({
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
      { status: 200 },
    );
  };
  const saved = await saveMatorSettings({
    groqApiKey: 'gsk_secret',
    autoApprove: true,
  });
  expect(saved.groqKeyConfigured).toEqual(true);
  expect('groqApiKey' in saved).toEqual(false);
});

test('saveMatorSettings surfaces backend errors', async () => {
  globalThis.fetch = async () =>
    new Response(JSON.stringify({ error: 'Groq API key cannot be empty' }), {
      status: 400,
    });
  await expect((saveMatorSettings({ groqApiKey: '' }))).rejects.toThrow(/Groq API key cannot be empty/);
});
