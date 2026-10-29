import type { RunRequest } from './types.js';

export function profileUrlForHandle(platform: 'linkedin' | 'x', rawHandle: string): string {
  const handle = rawHandle.trim().replace(/^@/, '');
  const pattern = platform === 'linkedin' ? /^[a-zA-Z0-9_-]{3,100}$/ : /^[a-zA-Z0-9_]{1,15}$/;
  if (!pattern.test(handle)) throw new Error('Enter a valid profile handle, not a URL or email address');
  return platform === 'linkedin'
    ? 'https://www.linkedin.com/in/' + handle + '/'
    : 'https://x.com/' + handle;
}

export function validateProfileUrl(platform: 'linkedin' | 'x', input: string): URL {
  const url = new URL(input);
  const hosts = platform === 'linkedin' ? ['www.linkedin.com', 'linkedin.com'] : ['x.com', 'www.x.com'];
  if (
    url.protocol !== 'https:' ||
    !hosts.includes(url.hostname) ||
    url.username ||
    url.password ||
    url.port
  ) {
    throw new Error('Only official HTTPS profile URLs are allowed');
  }
  const pattern = platform === 'linkedin' ? /^\/in\/[a-zA-Z0-9_-]+\/?$/ : /^\/[a-zA-Z0-9_]{1,15}\/?$/;
  if (!pattern.test(url.pathname) || url.search || url.hash) {
    throw new Error('Enter a direct profile URL, without search parameters');
  }
  return url;
}

export function validatePageScope(platform: 'linkedin' | 'x', profile: URL, raw: string): URL {
  const target = new URL(raw);
  if (
    target.protocol !== 'https:' ||
    target.username ||
    target.password ||
    target.port ||
    target.search ||
    target.hash ||
    target.hostname !== profile.hostname
  )
    throw new Error('Only the official selected profile page is allowed');
  const base = profile.pathname.replace(/\/$/, '');
  const path = target.pathname.replace(/\/$/, '');
  if (platform === 'linkedin') {
    if (
      path !== base &&
      !['experience', 'skills', 'projects', 'featured'].some(
        (section) => path === base + '/details/' + section,
      )
    )
      throw new Error('Unsupported LinkedIn details page');
  } else if (path.toLowerCase() !== base.toLowerCase()) {
    throw new Error('Only the selected X profile is supported');
  }
  return target;
}

export function validatePostUrl(profileUrl: URL, postUrl: string): URL {
  const url = new URL(postUrl);
  const match = url.pathname.match(/^\/([a-zA-Z0-9_]{1,15})\/status\/(\d+)\/?$/);
  if (
    url.protocol !== 'https:' ||
    !['x.com', 'www.x.com'].includes(url.hostname) ||
    url.username ||
    url.password ||
    url.port ||
    !match ||
    url.search ||
    url.hash ||
    match[1]?.toLowerCase() !== profileUrl.pathname.slice(1).replace(/\/$/, '').toLowerCase()
  ) {
    throw new Error('Post URL must belong to the selected X profile');
  }
  return url;
}

export function validateRun(input: RunRequest): URL {
  const profile = validateProfileUrl(input.platform, input.profileUrl);
  if (input.action === 'audit-page') {
    if (!input.pageUrl) throw new Error('Choose a supported page to inspect');
    validatePageScope(input.platform, profile, input.pageUrl);
  } else if (input.pageUrl) throw new Error('Page scope is available only for read-only inspection');
  if (
    input.login &&
    (!input.login.identifier.trim() ||
      !input.login.password ||
      input.login.identifier.length > 320 ||
      input.login.password.length > 512)
  ) {
    throw new Error('Enter a login identifier and password, or disable automatic login');
  }
  if (
    input.platform === 'linkedin' &&
    ![
      'audit',
      'audit-page',
      'edit-profile',
      'add-skill',
      'edit-experience',
      'edit-website',
      'edit-services',
      'add-project',
      'add-featured',
    ].includes(input.action)
  ) {
    throw new Error('This workflow is not supported on LinkedIn');
  }
  if (
    input.platform === 'x' &&
    ![
      'audit',
      'audit-page',
      'edit-profile',
      'compose-post',
      'pin-post',
      'delete-post',
      'upload-banner',
    ].includes(input.action)
  ) {
    throw new Error('This workflow is not supported on X');
  }
  if (input.action === 'edit-profile') {
    if (input.platform === 'linkedin' && !input.headline && !input.about)
      throw new Error('Supply a headline or About text');
    if (input.platform === 'x' && !input.bio && !input.location && !input.website)
      throw new Error('Supply at least one X profile field');
    if (input.headline && input.headline.length > 220)
      throw new Error('LinkedIn headline exceeds 220 characters');
    if (input.bio && input.bio.length > 160) throw new Error('X bio exceeds 160 characters');
    if (input.website && (!input.website.startsWith('https://') || !URL.canParse(input.website)))
      throw new Error('Website must be HTTPS');
  }
  if (input.action === 'add-skill' && !input.skill?.trim()) throw new Error('Skill is required');
  if (input.action === 'compose-post' && !input.postText?.trim())
    throw new Error('Post text is required');
  if (input.action === 'compose-post' && (input.postText?.length || 0) > 280)
    throw new Error('Post text exceeds 280 characters');
  if (input.action === 'pin-post' || input.action === 'delete-post') {
    if (!input.postUrl) throw new Error('Exact post URL required');
    validatePostUrl(profile, input.postUrl);
  }
  if (input.action === 'edit-experience') {
    if (!input.positionId || !/^\d{3,20}$/.test(input.positionId) || !input.description?.trim())
      throw new Error('Existing numeric position ID and description are required');
    if (!!input.startMonth !== !!input.startYear)
      throw new Error('Supply both start month and year, or neither');
    if (
      input.startMonth &&
      !/^(January|February|March|April|May|June|July|August|September|October|November|December)$/.test(
        input.startMonth,
      )
    )
      throw new Error('Enter full calendar month');
    if (input.startYear && !/^(19|20)\d{2}$/.test(input.startYear))
      throw new Error('Invalid start year');
  }
  if (input.action === 'edit-services' && !input.description?.trim())
    throw new Error('Service description is required');
  if (input.action === 'edit-website') {
    if (!input.website || !/^https:\/\//.test(input.website) || !URL.canParse(input.website))
      throw new Error('Website must be valid HTTPS');
    if (
      !Number.isInteger(input.websiteIndex ?? 0) ||
      (input.websiteIndex ?? 0) < 0 ||
      (input.websiteIndex ?? 0) > 9
    )
      throw new Error('Website index must be 0–9');
  }
  if (input.action === 'add-project' && (!input.projectName?.trim() || !input.description?.trim()))
    throw new Error('Project name and description are required');
  if (input.action === 'add-featured' && (!input.projectUrl || !input.featuredTitle?.trim()))
    throw new Error('Featured link and title are required');
  if (input.action === 'upload-banner' && !input.bannerPath?.trim())
    throw new Error('Banner image path is required');
  if (
    input.projectUrl &&
    (!URL.canParse(input.projectUrl) || new URL(input.projectUrl).protocol !== 'https:')
  )
    throw new Error('Project URL must be HTTPS');
  return profile;
}
