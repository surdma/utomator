import type { BrowserPort } from '../browser/provider.js';

const providerHome = {
  linkedin: 'https://www.linkedin.com/feed/',
  x: 'https://x.com/home',
} as const;

const allowId = (id: string) => /^[0-9a-fA-F-]{36}$/.test(id);

/** LinkedIn cover art uses displaybackgroundimage. Profile photos use displayphoto. */
function portraitUrl(value: string | null | undefined) {
  if (!value || !value.startsWith('https://')) return undefined;
  const lower = value.toLowerCase();
  if (
    lower.includes('displaybackground') ||
    lower.includes('backgroundimage') ||
    lower.includes('cover-image') ||
    lower.includes('profile-displaybackground')
  )
    return undefined;
  return value;
}

const browserPlatforms: ReadonlySet<string> = new Set(['linkedin', 'x']);
const browserPlatform = (platform: string): boolean => browserPlatforms.has(platform);
const platformHosts: Record<string, ReadonlyArray<string>> = {
  linkedin: ['linkedin.com', 'www.linkedin.com'],
  x: ['x.com', 'www.x.com'],
};

type AuditAction =
  | 'sign-in-opened'
  | 'session-verified'
  | 'reconnect-required'
  | 'temporarily-unavailable'
  | 'connection-expired'
  | 'disconnected';

type PendingConnection = { platform: 'linkedin' | 'x'; browser: BrowserPort };

function platformLabel(platform: string): string {
  switch (platform) {
    case 'linkedin':
      return 'LinkedIn';
    case 'x':
      return 'X';
    case 'instagram':
      return 'Instagram';
    case 'github':
      return 'GitHub';
    case 'devto':
      return 'Dev.to';
    default:
      return platform;
  }
}

export {
  type AuditAction,
  allowId,
  browserPlatform,
  browserPlatforms,
  type PendingConnection,
  platformHosts,
  platformLabel,
  portraitUrl,
  providerHome,
};
