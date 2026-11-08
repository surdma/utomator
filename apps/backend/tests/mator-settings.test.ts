import { createHash } from 'node:crypto';
import { expect, test } from 'vitest';
import type { DocumentRecord, DocumentStore } from '../src/infrastructure/db/documents.js';
import {
  decryptSecret,
  encryptSecret,
  loadMatorMasterKey,
  MatorDecryptError,
  matorEncryptionConfigured,
} from '../src/infrastructure/mator/mator-crypto.js';
import {
  DEFAULT_MATOR_GROQ_MODEL_ID,
  getMatorSettings,
  isGroqKeyConfigured,
  MATOR_SETTINGS_KEY,
  MATOR_SETTINGS_NAMESPACE,
  putMatorSettings,
} from '../src/infrastructure/mator/mator-settings.js';

const MASTER = Buffer.from(createHash('sha256').update('mator-test-master').digest());
const hex = (buffer: Buffer) => buffer.toString('hex');
const envWithKey = () => ({ UTOMATOR_MATOR_ENCRYPTION_KEY: hex(MASTER) });

type Row = { version: number; value: unknown };
class FakeDocuments implements DocumentStore {
  readonly dialect = 'sqlite' as const;
  readonly rows = new Map<string, Row>();
  constructor(readonly ownerId: string) {}
  async get<T>(namespace: string, key: string): Promise<DocumentRecord<T> | null> {
    const row = this.rows.get(`${namespace}:${key}`);
    return row ? { key, version: row.version, value: row.value as T } : null;
  }
  async put<T>(namespace: string, key: string, value: T, expectedVersion: number) {
    const id = `${namespace}:${key}`,
      existing = this.rows.get(id);
    if (!expectedVersion) {
      if (existing) throw Error('Database document changed. Reload before saving.');
      this.rows.set(id, { version: 1, value });
      return 1;
    }
    if (!existing || existing.version !== expectedVersion)
      throw Error('Database document changed. Reload before saving.');
    existing.version = expectedVersion + 1;
    existing.value = value;
    return existing.version;
  }
  async list<T>(namespace: string) {
    return [...this.rows.entries()]
      .filter(([id]) => id.startsWith(`${namespace}:`))
      .map(([id, row]) => ({
        key: id.slice(namespace.length + 1),
        version: row.version,
        value: row.value as T,
      }));
  }
  async remove(namespace: string, key: string, expectedVersion: number) {
    const id = `${namespace}:${key}`,
      existing = this.rows.get(id);
    if (!existing || existing.version !== expectedVersion)
      throw Error('Database document changed. Reload before saving.');
    this.rows.delete(id);
  }
  async close() {}
}

test('mator master key prefers UTOMATOR_MATOR_ENCRYPTION_KEY and validates hex', () => {
  expect(matorEncryptionConfigured(envWithKey())).toEqual(true);
  expect(loadMatorMasterKey(envWithKey())).toEqual(MASTER);
  expect(() => loadMatorMasterKey({ UTOMATOR_MATOR_ENCRYPTION_KEY: 'bad' })).toThrow(
    /Invalid UTOMATOR_MATOR_ENCRYPTION_KEY/,
  );
});

test('encryptSecret roundtrips and isolates owners', () => {
  const previous = process.env.UTOMATOR_MATOR_ENCRYPTION_KEY;
  process.env.UTOMATOR_MATOR_ENCRYPTION_KEY = hex(MASTER);
  try {
    const ownerA = '00000000-0000-4000-8000-0000000000aa';
    const ownerB = '00000000-0000-4000-8000-0000000000bb';
    const secret = 'gsk_test_roundtrip_key';
    const envelope = encryptSecret(ownerA, secret);
    expect(envelope.v).toEqual(1);
    expect(envelope.ciphertext).toMatch(/^[A-Za-z0-9+/=]+$/);
    expect(decryptSecret(ownerA, envelope)).toEqual(secret);
    expect(() => decryptSecret(ownerB, envelope)).toThrow(MatorDecryptError);
  } finally {
    if (previous === undefined) delete process.env.UTOMATOR_MATOR_ENCRYPTION_KEY;
    else process.env.UTOMATOR_MATOR_ENCRYPTION_KEY = previous;
  }
});

test('getMatorSettings returns defaults when document is missing', async () => {
  const docs = new FakeDocuments('local-owner');
  const settings = await getMatorSettings(docs);
  expect(settings).toEqual({
    autoApprove: false,
    squashPipelineHistory: false,
    howTtsEnabled: true,
    moderationEnabled: true,
    modelId: DEFAULT_MATOR_GROQ_MODEL_ID,
    temperature: 0.2,
    reasoningEffort: 'low',
    visionModelId: 'qwen/qwen3.8-27b',
    sttModelId: 'whisper-large-v3-turbo',
    ttsModelId: 'canopylabs/orpheus-v1-english',
    ttsVoice: 'hannah',
  });
  expect(isGroqKeyConfigured(settings)).toEqual(false);
});

test('temperature accepts finite values from 0 to 2 and persists the chosen value', async () => {
  const docs = new FakeDocuments('local-owner');
  for (const temperature of [-0.1, 2.1, Number.NaN, Number.POSITIVE_INFINITY]) {
    await expect(
      putMatorSettings(docs, { temperature }, 0),
    ).rejects.toThrow(/Temperature/);
  }
  const revision = await putMatorSettings(docs, { temperature: 0.7 }, 0);
  expect(revision).toBe(1);
  expect((await getMatorSettings(docs)).temperature).toBe(0.7);
});

test('putMatorSettings stores encrypted groq key envelope, never plaintext', async () => {
  const previous = process.env.UTOMATOR_MATOR_ENCRYPTION_KEY;
  process.env.UTOMATOR_MATOR_ENCRYPTION_KEY = hex(MASTER);
  const docs = new FakeDocuments('00000000-0000-4000-8000-0000000000cc');
  const plaintextKey = 'gsk_live_never_persist_plain';
  try {
    const version = await putMatorSettings(
      docs,
      { groqApiKey: plaintextKey, autoApprove: true, modelId: 'openai/gpt-oss-20b' },
      0,
    );
    expect(version).toEqual(1);
    const settings = await getMatorSettings(docs);
    expect(isGroqKeyConfigured(settings)).toEqual(true);
    expect(settings.groqKey).toBeTruthy();
    expect(settings.groqKey!.v).toEqual(1);
    expect(settings.autoApprove).toEqual(true);
    expect(settings.modelId).toEqual('openai/gpt-oss-20b');
    expect(JSON.stringify(settings)).not.toMatch(new RegExp(plaintextKey));
    const raw = await docs.get(MATOR_SETTINGS_NAMESPACE, MATOR_SETTINGS_KEY);
    expect(JSON.stringify(raw?.value)).not.toMatch(new RegExp(plaintextKey));

    const nextVersion = await putMatorSettings(docs, { groqApiKey: null }, version);
    expect(nextVersion).toEqual(2);
    const cleared = await getMatorSettings(docs);
    expect(cleared.groqKey).toEqual(undefined);
    expect(isGroqKeyConfigured(cleared)).toEqual(false);
  } finally {
    if (previous === undefined) delete process.env.UTOMATOR_MATOR_ENCRYPTION_KEY;
    else process.env.UTOMATOR_MATOR_ENCRYPTION_KEY = previous;
  }
});
