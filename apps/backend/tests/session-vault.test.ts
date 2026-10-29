import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import {
  VAULT_NAMESPACE,
  MAX_VAULT_PLAINTEXT_BYTES,
  VaultDecryptError,
  loadVaultMasterKey,
  vaultKeyConfigured,
  deriveOwnerKey,
  encryptSession,
  decryptSession,
  serializeVaultPayload,
  saveVaultPayload,
  loadVaultPayload,
  deleteVault,
  hasVault,
} from '../src/core/session-vault.js';
import type { DocumentStore, DocumentRecord } from '../src/db/documents.js';
import type { Cookie } from 'playwright';
import type { VaultPayload } from '../src/core/session-vault.js';

const MASTER = Buffer.from(createHash('sha256').update('test-master').digest().slice(0, 32)).subarray(
  0,
  32,
);
const hex = (buffer: Buffer) => buffer.toString('hex');
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

const cookie = (name: string): Cookie =>
  ({
    name,
    value: `v-${name}`,
    domain: '.linkedin.com',
    path: '/',
    secure: true,
    httpOnly: true,
    sameSite: 'Lax',
  }) as unknown as Cookie;
const samplePayload = (): VaultPayload => ({
  platform: 'linkedin',
  capturedAt: new Date(0).toISOString(),
  cookies: [cookie('li_at'), cookie('bcookie')],
  originState: [
    {
      origin: 'https://www.linkedin.com',
      localStorage: [{ name: 'theme', value: 'dark' }],
    },
  ],
  browserHints: {
    userAgent: 'UA-TEST',
    viewport: { width: 1366, height: 850 },
    locale: 'en-US',
    timezone: 'Africa/Lagos',
    deviceScaleFactor: 1,
  },
  lastVerified: { at: new Date(0).toISOString(), method: 'owner-control' },
});

test('vault key loading validates 64-hex and reports configurability', () => {
  assert.equal(loadVaultMasterKey({}), null);
  assert.equal(vaultKeyConfigured({}), false);
  assert.equal(
    loadVaultMasterKey({
      UTOMATOR_SESSION_ENCRYPTION_KEY: hex(MASTER),
    })?.equals(MASTER),
    true,
  );
  assert.equal(vaultKeyConfigured({ UTOMATOR_SESSION_ENCRYPTION_KEY: hex(MASTER) }), true);
  assert.throws(
    () => loadVaultMasterKey({ UTOMATOR_SESSION_ENCRYPTION_KEY: 'nothex' }),
    /Invalid UTOMATOR_SESSION_ENCRYPTION_KEY/,
  );
});

test('owner subkeys are deterministic, 32 bytes, and isolated per owner', () => {
  const first = deriveOwnerKey(MASTER, '11111111-1111-4111-8111-111111111111');
  const repeat = deriveOwnerKey(MASTER, '11111111-1111-4111-8111-111111111111');
  const other = deriveOwnerKey(MASTER, '22222222-2222-4222-8222-222222222222');
  assert.equal(first.length, 32);
  assert.equal(repeat.equals(first), true);
  assert.equal(other.equals(first), false);
  assert.throws(() => deriveOwnerKey(MASTER, ''), /Owner ID/);
  assert.throws(() => deriveOwnerKey(Buffer.alloc(0), 'x'), /master key/);
});

test('session envelope roundtrips and a foreign owner key cannot decrypt it', () => {
  const ownerA = deriveOwnerKey(MASTER, 'aaaaaaaa-1111-4111-8111-111111111111');
  const ownerB = deriveOwnerKey(MASTER, 'bbbbbbbb-2222-4222-8222-222222222222');
  const envelope = encryptSession(ownerA, '{"secret":"session"}');
  assert.equal(envelope.v, 1);
  assert.equal(decryptSession(ownerA, envelope), '{"secret":"session"}');
  assert.throws(() => decryptSession(ownerB, envelope), VaultDecryptError);
});

test('oversized plaintext is rejected before encryption', () => {
  const owner = deriveOwnerKey(MASTER, 'cccccccc-3333-4111-8111-111111111111');
  assert.throws(() => encryptSession(owner, 'x'.repeat(MAX_VAULT_PLAINTEXT_BYTES + 1)), /too large/);
  assert.doesNotThrow(() => encryptSession(owner, 'ok'));
});

test('payload shape validation rejects malformed captures', () => {
  const valid = samplePayload();
  assert.equal(serializeVaultPayload(valid).startsWith('{"platform":"linkedin"'), true);
  assert.throws(
    () =>
      serializeVaultPayload({
        ...valid,
        platform: 'instagram' as unknown as 'linkedin',
      }),
    /Unsupported vault platform/,
  );
  assert.throws(
    () => serializeVaultPayload({ ...valid, cookies: null as unknown as Cookie[] }),
    /no cookies/,
  );
  assert.throws(
    () =>
      serializeVaultPayload({
        ...valid,
        browserHints: {
          ...valid.browserHints,
          viewport: { width: 0, height: 850 },
        },
      }),
    /hints are invalid/,
  );
  assert.throws(
    () =>
      serializeVaultPayload({
        ...valid,
        originState: [{ origin: 'http://insecure.com', localStorage: [] }],
      }),
    /HTTPS origins/,
  );
  assert.throws(
    () =>
      serializeVaultPayload({
        ...valid,
        lastVerified: {
          at: new Date().toISOString(),
          method: 'api-required' as unknown as 'owner-control',
        },
      }),
    /owner-control verification/,
  );
});

test('storage adapter roundtrips through the document store and deletes cleanly', async () => {
  const documents = new FakeDocuments('33333333-3333-4333-8333-333333333333');
  const payload = samplePayload();
  assert.equal(await hasVault(documents, 'conn-1'), false);
  await saveVaultPayload(documents, 'conn-1', payload, MASTER);
  assert.equal(await hasVault(documents, 'conn-1'), true);
  const restored = await loadVaultPayload(documents, 'conn-1', MASTER);
  assert.deepEqual(restored, payload);
  await deleteVault(documents, 'conn-1');
  assert.equal(await hasVault(documents, 'conn-1'), false);
  assert.equal(await loadVaultPayload(documents, 'conn-1', MASTER), null);
  // A missing master key is a configuration failure, not a silent plaintext write.
  await assert.rejects(async () => {
    await saveVaultPayload(documents, 'conn-1', payload, null as unknown as Buffer);
  }, /not configured/);
});

test('vault records stored for one owner are unreadable under another owner store', async () => {
  const ownerA = new FakeDocuments('aaaaaaaa-1111-4111-8111-111111111111');
  const ownerB = new FakeDocuments('bbbbbbbb-2222-4222-8222-222222222222');
  // Simulate a cross-tenant leak: owner B's store somehow holds A's envelope.
  const leaked = encryptSession(
    deriveOwnerKey(MASTER, ownerA.ownerId),
    serializeVaultPayload(samplePayload()),
  );
  ownerB.rows.set(`${VAULT_NAMESPACE}:conn-1`, { version: 1, value: leaked });
  await assert.rejects(() => loadVaultPayload(ownerB, 'conn-1', MASTER), VaultDecryptError);
  // And the real owner still decrypts the same envelope without change.
  ownerA.rows.set(`${VAULT_NAMESPACE}:conn-1`, { version: 1, value: leaked });
  assert.equal((await loadVaultPayload(ownerA, 'conn-1', MASTER))?.platform, 'linkedin');
});
