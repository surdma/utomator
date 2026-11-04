import { createCipheriv, createDecipheriv, hkdfSync, randomBytes, timingSafeEqual } from 'node:crypto';
import type { Cookie } from 'playwright';
import type { DocumentStore } from '../db/documents.js';

/**
 * Encrypted session vault for hosted browser connectors.
 *
 * The vault is the ONLY durable home of a connector's provider session:
 * cookies, provider origin storage and the browser hints used to restore it.
 * Everything written here is encrypted per owner; a leaked subkey can never
 * decrypt another tenant's session. The plaintext session payload never
 * reaches the database — only an AES-256-GCM envelope (ciphertext/iv/tag).
 */

export const VAULT_NAMESPACE = 'connector-session-vault';
/** Pre-encrypt size guard so one bloated profile cannot exceed the DB payload cap. */
export const MAX_VAULT_PLAINTEXT_BYTES = 350 * 1024;
const KEY_INFO = 'connector-session-vault';
const PLATFORMS = new Set(['linkedin', 'x']);

export type VaultPayload = {
  platform: 'linkedin' | 'x';
  capturedAt: string;
  cookies: Cookie[];
  originState: Array<{
    origin: string;
    localStorage: Array<{ name: string; value: string }>;
    sessionStorage?: Array<{ name: string; value: string }>;
  }>;
  browserHints: {
    userAgent: string;
    viewport: { width: number; height: number };
    locale?: string;
    timezone?: string;
    deviceScaleFactor?: number;
  };
  lastVerified: { at: string; method: 'owner-control' };
};

export type VaultRecord = { ciphertext: string; iv: string; tag: string; v: 1 };

/** Decryption failure is a lifecycle event (re-auth), never a server error. */
export class VaultDecryptError extends Error {
  constructor(message = 'Stored session could not be decrypted') {
    super(message);
    this.name = 'VaultDecryptError';
  }
}

/** Per-owner subkey; secrets are isolated between tenants. */
function masterFor(documents: DocumentStore, master: Buffer | null): Buffer {
  const effective = master || loadVaultMasterKey();
  if (!effective) throw Error('UTOMATOR_SESSION_ENCRYPTION_KEY is not configured for the session vault');
  return deriveOwnerKey(effective, documents.ownerId);
}

/** Hex keys are validated exactly like LINKEDIN_TOKEN_ENCRYPTION_KEY. */
export function loadVaultMasterKey(env: NodeJS.ProcessEnv = process.env): Buffer | null {
  const key = env.UTOMATOR_SESSION_ENCRYPTION_KEY || '';
  if (!key) return null;
  if (!/^[a-fA-F0-9]{64}$/.test(key)) throw Error('Invalid UTOMATOR_SESSION_ENCRYPTION_KEY');
  return Buffer.from(key, 'hex');
}

export function vaultKeyConfigured(env: NodeJS.ProcessEnv = process.env): boolean {
  return loadVaultMasterKey(env) !== null;
}

/** Per-owner subkey via HKDF-SHA256; secrets are isolated between tenants. */
export function deriveOwnerKey(master: Buffer, ownerId: string): Buffer {
  if (!master || master.length === 0) throw Error('Session vault master key is unavailable');
  if (typeof ownerId !== 'string' || !ownerId)
    throw Error('Owner ID is required for vault key derivation');
  return Buffer.from(
    hkdfSync('sha256', master, Buffer.from(ownerId, 'utf8'), Buffer.from(KEY_INFO, 'utf8'), 32),
  );
}

export function encryptSession(ownerKey: Buffer, plaintext: string): VaultRecord {
  if (plaintext.length > MAX_VAULT_PLAINTEXT_BYTES)
    throw Error('LinkedIn session snapshot too large to store');
  const iv = randomBytes(12),
    cipher = createCipheriv('aes-256-gcm', ownerKey, iv);
  const ciphertext = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
  return {
    ciphertext: ciphertext.toString('base64'),
    iv: iv.toString('base64'),
    tag: cipher.getAuthTag().toString('base64'),
    v: 1,
  };
}

/** Throws VaultDecryptError on any auth/format failure. Callers map it to re-auth-required. */
export function decryptSession(ownerKey: Buffer, record: VaultRecord): string {
  try {
    if (!record || typeof record !== 'object' || record.v !== 1)
      throw new Error('Unrecognized vault record');
    const decipher = createDecipheriv('aes-256-gcm', ownerKey, Buffer.from(record.iv, 'base64'));
    decipher.setAuthTag(Buffer.from(record.tag, 'base64'));
    return Buffer.concat([
      decipher.update(Buffer.from(record.ciphertext, 'base64')),
      decipher.final(),
    ]).toString('utf8');
  } catch {
    throw new VaultDecryptError();
  }
}

export function serializeVaultPayload(payload: VaultPayload): string {
  assertPayloadShape(payload);
  const serialized = JSON.stringify(payload);
  if (typeof serialized !== 'string') throw Error('LinkedIn session snapshot could not be serialized');
  return serialized;
}

function assertPayloadShape(payload: VaultPayload) {
  if (!payload || typeof payload !== 'object') throw Error('Vault payload is unavailable');
  if (!PLATFORMS.has(payload.platform)) throw Error('Unsupported vault platform');
  if (!Array.isArray(payload.cookies)) throw Error('Vault payload has no cookies');
  if (!Array.isArray(payload.originState)) throw Error('Vault payload has no origin state');
  const hints = payload.browserHints;
  if (
    !hints ||
    typeof hints !== 'object' ||
    typeof hints.userAgent !== 'string' ||
    !hints.userAgent ||
    !hints.viewport ||
    !Number.isInteger(hints.viewport.width) ||
    !Number.isInteger(hints.viewport.height) ||
    hints.viewport.width <= 0 ||
    hints.viewport.height <= 0
  )
    throw Error('Vault payload browser hints are invalid');
  const originSet = new Set<string>();
  for (const origin of payload.originState) {
    if (!origin || typeof origin.origin !== 'string' || !/^https:\/\//.test(origin.origin))
      throw Error('Vault origin state entries must use HTTPS origins');
    if (originSet.has(origin.origin)) throw Error('Vault origin state contains duplicate origins');
    originSet.add(origin.origin);
    if (origin.localStorage && !Array.isArray(origin.localStorage))
      throw Error('Invalid origin storage shape');
  }
  if (!payload.lastVerified || payload.lastVerified.method !== 'owner-control')
    throw Error('Vault payload must record owner-control verification');
}

/** Storage adapter over the per-owner document store. Every function mirrors the
 * CAS discipline ConnectorService uses for its own records. An explicit master
 * key keeps callers (and tests) independent of process env snapshots. */
export function saveVaultPayload(
  documents: DocumentStore,
  connectorId: string,
  payload: VaultPayload,
  master: Buffer | null = loadVaultMasterKey(),
): Promise<number> {
  const plaintext = serializeVaultPayload(payload);
  const ownerKey = masterFor(documents, master);
  const envelope = encryptSession(ownerKey, plaintext);
  return documents
    .put(VAULT_NAMESPACE, connectorId, envelope, 0)
    .then(() => 1)
    .catch(() => putExisting());
  async function putExisting() {
    const existing = await documents.get<VaultRecord>(VAULT_NAMESPACE, connectorId);
    return documents.put(VAULT_NAMESPACE, connectorId, envelope, existing?.version ?? 0);
  }
}

export function loadVaultPayload(
  documents: DocumentStore,
  connectorId: string,
  master: Buffer | null = loadVaultMasterKey(),
): Promise<VaultPayload | null> {
  return documents.get<VaultRecord>(VAULT_NAMESPACE, connectorId).then((record) => {
    // The version pin travels with the parsed payload so callers can still
    // CAS-update the same record they loaded.
    if (!record) return null;
    const ownerKey = masterFor(documents, master);
    let payload: VaultPayload;
    try {
      payload = JSON.parse(decryptSession(ownerKey, record.value)) as VaultPayload;
    } catch (error) {
      if (error instanceof VaultDecryptError) throw error;
      throw new VaultDecryptError();
    }
    assertPayloadShape(payload);
    return payload;
  });
}

/** Deletes by its stored version; a concurrent vault write stops the delete. */
export function deleteVault(documents: DocumentStore, connectorId: string): Promise<void> {
  return documents
    .get<VaultRecord>(VAULT_NAMESPACE, connectorId)
    .then((record) =>
      record ? documents.remove(VAULT_NAMESPACE, connectorId, record.version) : undefined,
    );
}

export function hasVault(documents: DocumentStore, connectorId: string): Promise<boolean> {
  return documents.get<VaultRecord>(VAULT_NAMESPACE, connectorId).then((record) => Boolean(record));
}

export const ownerKeyMatches = (left: Buffer, right: Buffer): boolean =>
  left.length === right.length && timingSafeEqual(left, right);
