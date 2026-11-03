import { createCipheriv, createDecipheriv, randomBytes, hkdfSync } from 'node:crypto';
import { loadVaultMasterKey } from '../connect/session-vault.js';

const KEY_INFO = 'mator-secrets';

export type MatorSecretEnvelope = { ciphertext: string; iv: string; tag: string; v: 1 };

export class MatorDecryptError extends Error {
  constructor(message = 'Stored Mator secret could not be decrypted') {
    super(message);
    this.name = 'MatorDecryptError';
  }
}

/** Prefer UTOMATOR_MATOR_ENCRYPTION_KEY; fall back to the session vault master when set. */
export function loadMatorMasterKey(env: NodeJS.ProcessEnv = process.env): Buffer | null {
  const dedicated = env.UTOMATOR_MATOR_ENCRYPTION_KEY || '';
  if (dedicated) {
    if (!/^[a-fA-F0-9]{64}$/.test(dedicated)) throw Error('Invalid UTOMATOR_MATOR_ENCRYPTION_KEY');
    return Buffer.from(dedicated, 'hex');
  }
  return loadVaultMasterKey(env);
}

export function matorEncryptionConfigured(env: NodeJS.ProcessEnv = process.env): boolean {
  return loadMatorMasterKey(env) !== null;
}

function masterKey(env: NodeJS.ProcessEnv = process.env): Buffer {
  const key = loadMatorMasterKey(env);
  if (!key) throw Error('UTOMATOR_MATOR_ENCRYPTION_KEY is not configured for Mator secrets');
  return key;
}

function deriveOwnerKey(master: Buffer, ownerId: string): Buffer {
  if (!master.length) throw Error('Mator encryption master key is unavailable');
  if (typeof ownerId !== 'string' || !ownerId)
    throw Error('Owner ID is required for Mator key derivation');
  return Buffer.from(
    hkdfSync('sha256', master, Buffer.from(ownerId, 'utf8'), Buffer.from(KEY_INFO, 'utf8'), 32),
  );
}

export function encryptSecret(ownerId: string, plaintext: string): MatorSecretEnvelope {
  const ownerKey = deriveOwnerKey(masterKey(), ownerId);
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

export function decryptSecret(ownerId: string, envelope: MatorSecretEnvelope): string {
  try {
    if (!envelope || typeof envelope !== 'object' || envelope.v !== 1)
      throw new Error('Unrecognized Mator secret envelope');
    const ownerKey = deriveOwnerKey(masterKey(), ownerId);
    const decipher = createDecipheriv('aes-256-gcm', ownerKey, Buffer.from(envelope.iv, 'base64'));
    decipher.setAuthTag(Buffer.from(envelope.tag, 'base64'));
    return Buffer.concat([
      decipher.update(Buffer.from(envelope.ciphertext, 'base64')),
      decipher.final(),
    ]).toString('utf8');
  } catch (error) {
    if (error instanceof MatorDecryptError) throw error;
    throw new MatorDecryptError();
  }
}
