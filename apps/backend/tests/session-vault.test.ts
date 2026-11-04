
import { createHash } from 'node:crypto';
import { test, expect } from 'vitest';
import type { Cookie } from 'playwright';
import type { VaultPayload } from '../src/connect/session-vault.js';
import {
  decryptSession,
  deleteVault,
  deriveOwnerKey,
  encryptSession,
  hasVault,
  loadVaultMasterKey,
  loadVaultPayload,
  MAX_VAULT_PLAINTEXT_BYTES,
  saveVaultPayload,
  serializeVaultPayload,
  VAULT_NAMESPACE,
  VaultDecryptError,
  vaultKeyConfigured,
} from '../src/connect/session-vault.js';
import type { DocumentRecord, DocumentStore } from '../src/db/documents.js';

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
  expect(loadVaultMasterKey({})).toEqual(null);
  expect(vaultKeyConfigured({})).toEqual(false);
  expect(loadVaultMasterKey({
      UTOMATOR_SESSION_ENCRYPTION_KEY: hex(MASTER),
    })?.equals(MASTER)).toEqual(true);
  expect(vaultKeyConfigured({ UTOMATOR_SESSION_ENCRYPTION_KEY: hex(MASTER) })).toEqual(true);
  expect(() => loadVaultMasterKey({ UTOMATOR_SESSION_ENCRYPTION_KEY: 'nothex' })).toThrow(/Invalid UTOMATOR_SESSION_ENCRYPTION_KEY/);
});

test('owner subkeys are deterministic, 32 bytes, and isolated per owner', () => {
  const first = deriveOwnerKey(MASTER, '11111111-1111-4111-8111-111111111111');
  const repeat = deriveOwnerKey(MASTER, '11111111-1111-4111-8111-111111111111');
  const other = deriveOwnerKey(MASTER, '22222222-2222-4222-8222-222222222222');
  expect(first.length).toEqual(32);
  expect(repeat.equals(first)).toEqual(true);
  expect(other.equals(first)).toEqual(false);
  expect(() => deriveOwnerKey(MASTER, '')).toThrow(/Owner ID/);
  expect(() => deriveOwnerKey(Buffer.alloc(0), 'x')).toThrow(/master key/);
});

test('session envelope roundtrips and a foreign owner key cannot decrypt it', () => {
  const ownerA = deriveOwnerKey(MASTER, 'aaaaaaaa-1111-4111-8111-111111111111');
  const ownerB = deriveOwnerKey(MASTER, 'bbbbbbbb-2222-4222-8222-222222222222');
  const envelope = encryptSession(ownerA, '{"secret":"session"}');
  expect(envelope.v).toEqual(1);
  expect(decryptSession(ownerA, envelope)).toEqual('{"secret":"session"}');
  expect(() => decryptSession(ownerB, envelope)).toThrow(VaultDecryptError);
});

test('oversized plaintext is rejected before encryption', () => {
  const owner = deriveOwnerKey(MASTER, 'cccccccc-3333-4111-8111-111111111111');
  expect(() => encryptSession(owner, 'x'.repeat(MAX_VAULT_PLAINTEXT_BYTES + 1))).toThrow(/too large/);
  expect(() => encryptSession(owner, 'ok')).not.toThrow();
});

test('payload shape validation rejects malformed captures', () => {
  const valid = samplePayload();
  expect(serializeVaultPayload(valid).startsWith('{"platform":"linkedin"')).toEqual(true);
  expect(() =>
      serializeVaultPayload({
        ...valid,
        platform: 'instagram' as unknown as 'linkedin',
      })).toThrow(/Unsupported vault platform/);
  expect(() => serializeVaultPayload({ ...valid, cookies: null as unknown as Cookie[] })).toThrow(/no cookies/);
  expect(() =>
      serializeVaultPayload({
        ...valid,
        browserHints: {
          ...valid.browserHints,
          viewport: { width: 0, height: 850 },
        },
      })).toThrow(/hints are invalid/);
  expect(() =>
      serializeVaultPayload({
        ...valid,
        originState: [{ origin: 'http://insecure.com', localStorage: [] }],
      })).toThrow(/HTTPS origins/);
  expect(() =>
      serializeVaultPayload({
        ...valid,
        lastVerified: {
          at: new Date().toISOString(),
          method: 'api-required' as unknown as 'owner-control',
        },
      })).toThrow(/owner-control verification/);
});

test('storage adapter roundtrips through the document store and deletes cleanly', async () => {
  const documents = new FakeDocuments('33333333-3333-4333-8333-333333333333');
  const payload = samplePayload();
  expect(await hasVault(documents, 'conn-1')).toEqual(false);
  await saveVaultPayload(documents, 'conn-1', payload, MASTER);
  expect(await hasVault(documents, 'conn-1')).toEqual(true);
  const restored = await loadVaultPayload(documents, 'conn-1', MASTER);
  expect(restored).toEqual(payload);
  await deleteVault(documents, 'conn-1');
  expect(await hasVault(documents, 'conn-1')).toEqual(false);
  expect(await loadVaultPayload(documents, 'conn-1', MASTER)).toEqual(null);
  // A missing master key is a configuration failure, not a silent plaintext write.
  await expect(async () => {
    await saveVaultPayload(documents, 'conn-1', payload, null as unknown as Buffer);
  }).rejects.toThrow(/not configured/);
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
  await expect(() => loadVaultPayload(ownerB, 'conn-1', MASTER)).rejects.toThrow(VaultDecryptError);
  // And the real owner still decrypts the same envelope without change.
  ownerA.rows.set(`${VAULT_NAMESPACE}:conn-1`, { version: 1, value: leaked });
  expect((await loadVaultPayload(ownerA, 'conn-1', MASTER))?.platform).toEqual('linkedin');
});
