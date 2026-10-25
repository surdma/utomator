import type { RunRequest } from './types.js';
import type { Platform } from './types.js';


/** A handle is a user identifier, not a URL. Old profileUrl requests remain supported. */
export function profileFromIdentity(platform: Platform, handle?: string, profileUrl?: string): URL {
  if (!handle && !profileUrl) throw new Error('Enter your LinkedIn username or X handle');
  if (!handle) return validateExistingUrl(platform, profileUrl!);
  const clean = handle.trim().replace(/^@/, '');
  const allowed = platform === 'linkedin' ? /^[a-zA-Z0-9_-]{1,100}$/ : /^[a-zA-Z0-9_]{1,15}$/;
  if (!allowed.test(clean)) throw new Error(`Invalid ${platform === 'x' ? 'X handle' : 'LinkedIn username'}`);
  const url = new URL(platform === 'linkedin' ? `https://www.linkedin.com/in/${clean}/` : `https://x.com/${clean}`);
  if (profileUrl && validateExistingUrl(platform, profileUrl).pathname.replace(/\/$/, '').toLowerCase() !== url.pathname.replace(/\/$/, '').toLowerCase()) {
    throw new Error('Username and profile URL must refer to the same account');
  }
  return url;
}

function validateExistingUrl(platform: Platform, input: string): URL {
  const url = new URL(input);
  const hosts = platform === 'linkedin' ? ['www.linkedin.com', 'linkedin.com'] : ['x.com', 'www.x.com'];
  if (url.protocol !== 'https:' || !hosts.includes(url.hostname) || url.username || url.password || url.port || url.search || url.hash) {
    throw new Error('Only direct official HTTPS profile URLs are allowed');
  }
  const pattern = platform === 'linkedin' ? /^\/in\/[a-zA-Z0-9_-]+\/?$/ : /^\/[a-zA-Z0-9_]{1,15}\/?$/;
  if (!pattern.test(url.pathname)) throw new Error('Enter your profile URL or username');
  return url;
}

export function validateProfileUrl(platform: 'linkedin' | 'x', input: string): URL {
  const url = new URL(input);
  const hosts = platform === 'linkedin' ? ['www.linkedin.com', 'linkedin.com'] : ['x.com', 'www.x.com'];
  if (url.protocol !== 'https:' || !hosts.includes(url.hostname) || url.username || url.password || url.port) {
    throw new Error('Only official HTTPS profile URLs are allowed');
  }
  const pattern = platform === 'linkedin' ? /^\/in\/[a-zA-Z0-9_-]+\/?$/ : /^\/[a-zA-Z0-9_]{1,15}\/?$/;
  if (!pattern.test(url.pathname) || url.search || url.hash) {
    throw new Error('Enter a direct profile URL, without search parameters');
  }
  return url;
}

export function validatePostUrl(profileUrl: URL, postUrl: string): URL {
  const url = new URL(postUrl);
  const match = url.pathname.match(/^\/([a-zA-Z0-9_]{1,15})\/status\/(\d+)\/?$/);
  if (url.protocol !== 'https:' || !['x.com', 'www.x.com'].includes(url.hostname) ||
      url.username || url.password || url.port || !match || url.search || url.hash || match[1]?.toLowerCase() !== profileUrl.pathname.slice(1).replace(/\/$/, '').toLowerCase()) {
    throw new Error('Post URL must belong to the selected X profile');
  }
  return url;
}

export function validateRun(input: RunRequest): URL {
  const profile = profileFromIdentity(input.platform, input.handle, input.profileUrl);
  if (input.credentials) {
    if (!input.credentials.loginId?.trim() || !input.credentials.password) throw new Error('Both sign-in identifier and password are required');
    if (input.credentials.loginId.length > 254 || input.credentials.password.length > 512) throw new Error('Sign-in fields are too long');
  }
  if (input.platform === 'linkedin' && !['audit', 'edit-profile', 'add-skill', 'edit-experience', 'edit-website', 'edit-services', 'add-project', 'add-featured'].includes(input.action)) {
    throw new Error('This workflow is not supported on LinkedIn');
  }
  if (input.platform === 'x' && !['audit', 'edit-profile', 'compose-post', 'pin-post', 'delete-post', 'upload-banner'].includes(input.action)) {
    throw new Error('This workflow is not supported on X');
  }
  if (input.action === 'edit-profile') {
    if (input.platform === 'linkedin' && !input.headline && !input.about) throw new Error('Supply a headline or About text');
    if (input.platform === 'x' && !input.bio && !input.location && !input.website) throw new Error('Supply at least one X profile field');
    if (input.headline && input.headline.length > 220) throw new Error('LinkedIn headline exceeds 220 characters');
    if (input.bio && input.bio.length > 160) throw new Error('X bio exceeds 160 characters');
    if (input.website && (!input.website.startsWith('https://') || !URL.canParse(input.website))) throw new Error('Website must be HTTPS');
  }
  if (input.action === 'add-skill' && !input.skill?.trim()) throw new Error('Skill is required');
  if (input.action === 'compose-post' && !input.postText?.trim()) throw new Error('Post text is required');
  if (input.action === 'compose-post' && (input.postText?.length || 0) > 280) throw new Error('Post text exceeds 280 characters');
  if (input.action === 'pin-post' || input.action === 'delete-post') {
    if (!input.postUrl) throw new Error('Exact post URL required');
    validatePostUrl(profile, input.postUrl);
  }
  if (input.action === 'edit-experience') {
    if (!input.positionId || !/^\d{3,20}$/.test(input.positionId) || !input.description?.trim()) throw new Error('Existing numeric position ID and description are required');
    if (!!input.startMonth !== !!input.startYear) throw new Error('Supply both start month and year, or neither');
    if (input.startMonth && !/^(January|February|March|April|May|June|July|August|September|October|November|December)$/.test(input.startMonth)) throw new Error('Enter full calendar month');
    if (input.startYear && !/^(19|20)\d{2}$/.test(input.startYear)) throw new Error('Invalid start year');
  }
  if (input.action === 'edit-services' && !input.description?.trim()) throw new Error('Service description is required');
  if (input.action === 'edit-website') {
    if (!input.website || !/^https:\/\//.test(input.website) || !URL.canParse(input.website)) throw new Error('Website must be valid HTTPS');
    if (!Number.isInteger(input.websiteIndex ?? 0) || (input.websiteIndex ?? 0) < 0 || (input.websiteIndex ?? 0) > 9) throw new Error('Website index must be 0–9');
  }
  if (input.action === 'add-project' && (!input.projectName?.trim() || !input.description?.trim())) throw new Error('Project name and description are required');
  if (input.action === 'add-featured' && (!input.projectUrl || !input.featuredTitle?.trim())) throw new Error('Featured link and title are required');
  if (input.action === 'upload-banner' && !input.bannerPath?.trim()) throw new Error('Banner image path is required');
  if (input.projectUrl && (!URL.canParse(input.projectUrl) || new URL(input.projectUrl).protocol !== 'https:')) throw new Error('Project URL must be HTTPS');
  return profile;
}
