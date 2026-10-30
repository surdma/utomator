import type { DocumentStore } from '../db/documents.js';
import { encryptSecret, type MatorSecretEnvelope } from './mator-crypto.js';

/** Free-tier Groq chat model (verified Oct 2026; replaces deprecated llama-3.1-8b-instant). */
export const DEFAULT_MATOR_GROQ_MODEL_ID = 'openai/gpt-oss-20b';

export const MATOR_SETTINGS_NAMESPACE = 'mator-settings';
export const MATOR_SETTINGS_KEY = 'owner';

export type MatorSettings = {
  groqKey?: MatorSecretEnvelope;
  autoApprove: boolean;
  squashPipelineHistory: boolean;
  howTtsEnabled: boolean;
  modelId: string;
};

export type MatorSettingsPatch = Partial<
  Pick<MatorSettings, 'autoApprove' | 'squashPipelineHistory' | 'howTtsEnabled' | 'modelId'>
> & {
  /** Plaintext Groq API key to encrypt at rest; null clears a stored key. */
  groqApiKey?: string | null;
};

const DEFAULTS: Omit<MatorSettings, 'groqKey'> = {
  autoApprove: false,
  squashPipelineHistory: false,
  howTtsEnabled: true,
  modelId: DEFAULT_MATOR_GROQ_MODEL_ID,
};

export function isGroqKeyConfigured(settings: MatorSettings): boolean {
  return Boolean(settings.groqKey);
}

function mergeSettings(stored: Partial<MatorSettings> | null | undefined): MatorSettings {
  if (!stored || typeof stored !== 'object') return { ...DEFAULTS };
  return {
    ...DEFAULTS,
    autoApprove: stored.autoApprove ?? DEFAULTS.autoApprove,
    squashPipelineHistory: stored.squashPipelineHistory ?? DEFAULTS.squashPipelineHistory,
    howTtsEnabled: stored.howTtsEnabled ?? DEFAULTS.howTtsEnabled,
    modelId: typeof stored.modelId === 'string' && stored.modelId ? stored.modelId : DEFAULTS.modelId,
    ...(stored.groqKey ? { groqKey: stored.groqKey } : {}),
  };
}

export async function getMatorSettings(documents: DocumentStore): Promise<MatorSettings> {
  const record = await documents.get<MatorSettings>(MATOR_SETTINGS_NAMESPACE, MATOR_SETTINGS_KEY);
  return mergeSettings(record?.value);
}

export async function putMatorSettings(
  documents: DocumentStore,
  patch: MatorSettingsPatch,
  expectedVersion: number,
): Promise<number> {
  const current = mergeSettings(
    (await documents.get<MatorSettings>(MATOR_SETTINGS_NAMESPACE, MATOR_SETTINGS_KEY))?.value,
  );
  const next: MatorSettings = {
    autoApprove: patch.autoApprove ?? current.autoApprove,
    squashPipelineHistory: patch.squashPipelineHistory ?? current.squashPipelineHistory,
    howTtsEnabled: patch.howTtsEnabled ?? current.howTtsEnabled,
    modelId: patch.modelId ?? current.modelId,
  };
  if (patch.groqApiKey === null) {
    // explicit clear
  } else if (typeof patch.groqApiKey === 'string') {
    if (!patch.groqApiKey) throw Error('Groq API key cannot be empty');
    next.groqKey = encryptSecret(documents.ownerId, patch.groqApiKey);
  } else if (current.groqKey) {
    next.groqKey = current.groqKey;
  }
  return documents.put(MATOR_SETTINGS_NAMESPACE, MATOR_SETTINGS_KEY, next, expectedVersion);
}
