import { growthCapabilities } from '@/modules/growth';
import type { MatorModelOption } from '@/modules/mator';

export type AccountSection = 'you' | 'connections' | 'mator' | 'preferences';

export type ConnectionStatus =
  | 'connected'
  | 'disconnected'
  | 'sign-in-open'
  | 'api-required';

export const senseCopy: Record<
  MatorModelOption['role'],
  { title: string; hint: string }
> = {
  chat: {
    title: 'Writing',
    hint: 'How Mator writes when you talk with it.',
  },
  vision: {
    title: 'Pictures',
    hint: 'How Mator understands images you attach.',
  },
  'speech-to-text': {
    title: 'Listening',
    hint: 'How Mator hears you when you speak.',
  },
  'text-to-speech': {
    title: 'Speaking',
    hint: 'The voice Mator uses when it talks back.',
  },
  moderation: {
    title: 'Review',
    hint: 'How Mator checks a message before preparing a step.',
  },
};

export function accountSection(pathname: string, pane: string): AccountSection {
  if (pane === 'settings' || pathname === '/dashboard/settings') return 'mator';
  if (pathname.endsWith('/connections')) return 'connections';
  return 'you';
}

export function workFor(ids: readonly string[]) {
  return ids
    .map((id) => growthCapabilities.find((item) => item.id === id)?.title)
    .filter((title): title is string => Boolean(title));
}

export function choiceLabel(model: MatorModelOption) {
  const tier = model.tier === 'free' ? 'Free' : 'Paid';
  const friendly: Record<string, string> = {
    'openai/gpt-oss-20b': 'Everyday writing',
    'openai/gpt-oss-120b': 'Deeper writing',
    'qwen/qwen3.8-27b': 'Picture understanding',
    'whisper-large-v3-turbo': 'Quick listening',
    'whisper-large-v3': 'Careful listening',
    'canopylabs/orpheus-v1-english': 'Spoken replies',
  };
  return `${friendly[model.id] ?? model.label} — ${tier}`;
}

export function portraitSrc(value?: string) {
  if (!value) return undefined;
  const lower = value.toLowerCase();
  if (lower.includes('displaybackground') || lower.includes('backgroundimage'))
    return undefined;
  return value;
}

export function statusLine(status: ConnectionStatus | undefined) {
  if (status === 'connected') return 'Connected';
  if (status === 'sign-in-open') return 'Finishing sign-in';
  if (status === 'api-required') return 'Waiting on official access';
  return 'Not connected';
}
