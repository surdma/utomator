import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import {
  encryptSecret,
  decryptSecret,
  MatorDecryptError,
  loadMatorMasterKey,
  matorEncryptionConfigured,
} from '../src/mator/mator-crypto.js';
import {
  DEFAULT_MATOR_GROQ_MODEL_ID,
  getMatorSettings,
  putMatorSettings,
  isGroqKeyConfigured,
  MATOR_SETTINGS_NAMESPACE,
  MATOR_SETTINGS_KEY,
} from '../src/mator/mator-settings.js';
import type { DocumentStore, DocumentRecord } from '../src/db/documents.js';

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
  assert.equal(matorEncryptionConfigured(envWithKey()), true);
  assert.deepEqual(loadMatorMasterKey(envWithKey()), MASTER);
  assert.throws(
    () => loadMatorMasterKey({ UTOMATOR_MATOR_ENCRYPTION_KEY: 'bad' }),
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
    assert.equal(envelope.v, 1);
    assert.match(envelope.ciphertext, /^[A-Za-z0-9+/=]+$/);
    assert.equal(decryptSecret(ownerA, envelope), secret);
    assert.throws(() => decryptSecret(ownerB, envelope), MatorDecryptError);
  } finally {
    if (previous === undefined) delete process.env.UTOMATOR_MATOR_ENCRYPTION_KEY;
    else process.env.UTOMATOR_MATOR_ENCRYPTION_KEY = previous;
  }
});

test('getMatorSettings returns defaults when document is missing', async () => {
  const docs = new FakeDocuments('local-owner');
  const settings = await getMatorSettings(docs);
  assert.deepEqual(settings, {
    autoApprove: false,
    squashPipelineHistory: false,
    howTtsEnabled: true,
    moderationEnabled: true,
    modelId: DEFAULT_MATOR_GROQ_MODEL_ID,
    reasoningEffort: 'low',
    visionModelId: 'qwen/qwen3.8-27b',
    sttModelId: 'whisper-large-v3-turbo',
    ttsModelId: 'canopylabs/orpheus-v1-english',
    ttsVoice: 'hannah',
  });
  assert.equal(isGroqKeyConfigured(settings), false);
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
    assert.equal(version, 1);
    const settings = await getMatorSettings(docs);
    assert.equal(isGroqKeyConfigured(settings), true);
    assert.ok(settings.groqKey);
    assert.equal(settings.groqKey!.v, 1);
    assert.equal(settings.autoApprove, true);
    assert.equal(settings.modelId, 'openai/gpt-oss-20b');
    assert.doesNotMatch(JSON.stringify(settings), new RegExp(plaintextKey));
    const raw = await docs.get(MATOR_SETTINGS_NAMESPACE, MATOR_SETTINGS_KEY);
    assert.doesNotMatch(JSON.stringify(raw?.value), new RegExp(plaintextKey));

    const nextVersion = await putMatorSettings(docs, { groqApiKey: null }, version);
    assert.equal(nextVersion, 2);
    const cleared = await getMatorSettings(docs);
    assert.equal(cleared.groqKey, undefined);
    assert.equal(isGroqKeyConfigured(cleared), false);
  } finally {
    if (previous === undefined) delete process.env.UTOMATOR_MATOR_ENCRYPTION_KEY;
    else process.env.UTOMATOR_MATOR_ENCRYPTION_KEY = previous;
  }
});
