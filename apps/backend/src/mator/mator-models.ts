export type MatorModelTier = 'free' | 'paid';
export type MatorModelRole = 'chat' | 'vision' | 'speech-to-text' | 'text-to-speech' | 'moderation';
export type MatorReasoningEffort = 'low' | 'medium' | 'high';

export type MatorModelOption = {
  id: string;
  name: string;
  label: string;
  tier: MatorModelTier;
  role: MatorModelRole;
  price: string;
  notes: string;
};

export const MATOR_TTS_VOICES = [
  { id: 'hannah', label: 'Hannah', language: 'English' },
  { id: 'troy', label: 'Troy', language: 'English' },
  { id: 'austin', label: 'Austin', language: 'English' },
] as const;

/** Catalog from Groq's published model list (Oct 2026). Lowest price in a role is the free default. */
export const MATOR_MODEL_CATALOG: MatorModelOption[] = [
  {
    id: 'openai/gpt-oss-20b',
    name: 'GPT-OSS 20B',
    label: 'Fast reasoning chat',
    tier: 'free',
    role: 'chat',
    price: '$0.075 / 1M input tokens',
    notes: 'Default chat model. Reasoning and prompt caching.',
  },
  {
    id: 'openai/gpt-oss-120b',
    name: 'GPT-OSS 120B',
    label: 'Larger reasoning chat',
    tier: 'paid',
    role: 'chat',
    price: '$0.15 / 1M input tokens',
    notes: 'Higher quality chat. Reasoning and prompt caching.',
  },
  {
    id: 'qwen/qwen3.8-27b',
    name: 'Qwen 3.8 27B',
    label: 'Vision',
    tier: 'paid',
    role: 'vision',
    price: '$0.80 / 1M input tokens',
    notes: 'Image understanding. Up to 3 images, 20 MB each.',
  },
  {
    id: 'whisper-large-v3-turbo',
    name: 'Whisper Large V3 Turbo',
    label: 'Fast speech to text',
    tier: 'free',
    role: 'speech-to-text',
    price: '$0.04 per hour',
    notes: 'Default transcription. Multilingual.',
  },
  {
    id: 'whisper-large-v3',
    name: 'Whisper Large V3',
    label: 'Accurate speech to text',
    tier: 'paid',
    role: 'speech-to-text',
    price: '$0.111 per hour',
    notes: 'Higher accuracy transcription and translation.',
  },
  {
    id: 'canopylabs/orpheus-v1-english',
    name: 'Orpheus English',
    label: 'Text to speech',
    tier: 'paid',
    role: 'text-to-speech',
    price: '$22 per 1M characters',
    notes: 'Speaks Mator how-replies. Never speaks the user.',
  },
  {
    id: 'openai/gpt-oss-safeguard-20b',
    name: 'GPT-OSS Safeguard 20B',
    label: 'Content check',
    tier: 'paid',
    role: 'moderation',
    price: '$0.075 / 1M input tokens',
    notes: 'Checks each typed turn before an action is staged.',
  },
];

export function modelsForRole(role: MatorModelRole): MatorModelOption[] {
  return MATOR_MODEL_CATALOG.filter((model) => model.role === role);
}

export function findMatorModel(id: string): MatorModelOption | undefined {
  return MATOR_MODEL_CATALOG.find((model) => model.id === id);
}

export function assertModelRole(id: string, role: MatorModelRole): MatorModelOption {
  const model = findMatorModel(id);
  if (!model || model.role !== role) throw Error(`Unknown ${role} model: ${id}`);
  return model;
}
