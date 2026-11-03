import type { DocumentStore } from '../db/documents.js';
import { encryptSecret, type MatorSecretEnvelope } from './mator-crypto.js';
import { assertModelRole, type MatorReasoningEffort } from './mator-models.js';

/** Lowest-price Groq chat model (verified Oct 2026). */
export const DEFAULT_MATOR_GROQ_MODEL_ID = 'openai/gpt-oss-20b';
export const DEFAULT_MATOR_VISION_MODEL_ID = 'qwen/qwen3.8-27b';
export const DEFAULT_MATOR_STT_MODEL_ID = 'whisper-large-v3-turbo';
export const DEFAULT_MATOR_TTS_MODEL_ID = 'canopylabs/orpheus-v1-english';
export const DEFAULT_MATOR_TTS_VOICE = 'hannah';

export const MATOR_SETTINGS_NAMESPACE = 'mator-settings';
export const MATOR_SETTINGS_KEY = 'owner';

export type MatorSettings = {
  groqKey?: MatorSecretEnvelope;
  autoApprove: boolean;
  squashPipelineHistory: boolean;
  howTtsEnabled: boolean;
  moderationEnabled: boolean;
  modelId: string;
  reasoningEffort: MatorReasoningEffort;
  visionModelId: string;
  sttModelId: string;
  ttsModelId: string;
  ttsVoice: string;
};

export type MatorSettingsPatch = Partial<
  Pick<
    MatorSettings,
    | 'autoApprove'
    | 'squashPipelineHistory'
    | 'howTtsEnabled'
    | 'moderationEnabled'
    | 'modelId'
    | 'reasoningEffort'
    | 'visionModelId'
    | 'sttModelId'
    | 'ttsModelId'
    | 'ttsVoice'
  >
> & {
  /** Plaintext Groq API key to encrypt at rest; null clears a stored key. */
  groqApiKey?: string | null;
};

const DEFAULTS: Omit<MatorSettings, 'groqKey'> = {
  autoApprove: false,
  squashPipelineHistory: false,
  howTtsEnabled: true,
  moderationEnabled: true,
  modelId: DEFAULT_MATOR_GROQ_MODEL_ID,
  reasoningEffort: 'low',
  visionModelId: DEFAULT_MATOR_VISION_MODEL_ID,
  sttModelId: DEFAULT_MATOR_STT_MODEL_ID,
  ttsModelId: DEFAULT_MATOR_TTS_MODEL_ID,
  ttsVoice: DEFAULT_MATOR_TTS_VOICE,
};

const EFFORTS = new Set<MatorReasoningEffort>(['low', 'medium', 'high']);
const VOICES = new Set(['hannah', 'troy', 'austin']);

export function readEnvGroqApiKey(env: NodeJS.ProcessEnv = process.env): string | null {
  const value = (env.UTOMATOR_GROQ_API_KEY || env.GROQ_API_KEY || '').trim();
  return value || null;
}

export function groqKeySource(settings: MatorSettings, env: NodeJS.ProcessEnv = process.env) {
  if (settings.groqKey) return 'stored' as const;
  if (readEnvGroqApiKey(env)) return 'environment' as const;
  return 'none' as const;
}

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
    moderationEnabled: stored.moderationEnabled ?? DEFAULTS.moderationEnabled,
    modelId: typeof stored.modelId === 'string' && stored.modelId ? stored.modelId : DEFAULTS.modelId,
    reasoningEffort: EFFORTS.has(stored.reasoningEffort as MatorReasoningEffort)
      ? (stored.reasoningEffort as MatorReasoningEffort)
      : DEFAULTS.reasoningEffort,
    visionModelId: stored.visionModelId || DEFAULTS.visionModelId,
    sttModelId: stored.sttModelId || DEFAULTS.sttModelId,
    ttsModelId: stored.ttsModelId || DEFAULTS.ttsModelId,
    ttsVoice: stored.ttsVoice || DEFAULTS.ttsVoice,
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
  const modelId = patch.modelId ?? current.modelId;
  const visionModelId = patch.visionModelId ?? current.visionModelId;
  const sttModelId = patch.sttModelId ?? current.sttModelId;
  const ttsModelId = patch.ttsModelId ?? current.ttsModelId;
  const ttsVoice = patch.ttsVoice ?? current.ttsVoice;
  const reasoningEffort = patch.reasoningEffort ?? current.reasoningEffort;
  assertModelRole(modelId, 'chat');
  assertModelRole(visionModelId, 'vision');
  assertModelRole(sttModelId, 'speech-to-text');
  assertModelRole(ttsModelId, 'text-to-speech');
  if (!EFFORTS.has(reasoningEffort)) throw Error('Unknown reasoning effort');
  if (!VOICES.has(ttsVoice)) throw Error('Unknown speech voice');
  const next: MatorSettings = {
    autoApprove: patch.autoApprove ?? current.autoApprove,
    squashPipelineHistory: patch.squashPipelineHistory ?? current.squashPipelineHistory,
    howTtsEnabled: patch.howTtsEnabled ?? current.howTtsEnabled,
    moderationEnabled: patch.moderationEnabled ?? current.moderationEnabled,
    modelId,
    reasoningEffort,
    visionModelId,
    sttModelId,
    ttsModelId,
    ttsVoice,
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
