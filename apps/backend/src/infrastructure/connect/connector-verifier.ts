import type { Page } from 'playwright';
import { isConnectionTimeout, navigateWithRetry, streamSignInUrl } from '../browser/navigation.js';
import type { BrowserPort } from '../browser/provider.js';
import { BrowserSession } from '../browser/session.js';
import type { AccountStore, SocialAccount, SocialPlatform } from '../profile/account-store.js';
import {
  type AuditAction,
  browserPlatform,
  platformHosts,
  platformLabel,
  portraitUrl,
} from './connector-consts.js';
import type { ConnectionRecord, ConnectorRecordStore } from './store.js';

export type VerifyResult = 'verified' | 'not-authenticated' | 'temporarily-unavailable';

export type VerifierDeps = {
  accounts: AccountStore;
  store: ConnectorRecordStore;
  sessions: Map<string, BrowserPort>;
  pending: Map<string, { platform: 'linkedin' | 'x'; browser: BrowserPort }>;
  checks: Map<string, Promise<{ status: string; accountId: string }>>;
  makeBrowser: () => BrowserPort;
  audit: (action: AuditAction, account?: SocialAccount) => Promise<void>;
};

/** Provider verification, discovery, and profile absorption for the connect flow. */
export class ConnectorVerifier {
  constructor(private readonly deps: VerifierDeps) {}

  async verify(page: Page, account: SocialAccount, navigate = true): Promise<VerifyResult> {
    const { accounts } = this.deps;
    try {
      if (navigate)
        await navigateWithRetry(page, account.profileUrl, {
          waitUntil: 'domcontentloaded',
          timeout: 15000,
          maxAttempts: 2,
          baseDelayMs: 400,
        });
    } catch (error) {
      if (isConnectionTimeout(error)) return 'temporarily-unavailable';
      throw error;
    }
    const isOwnedProfilePage = () => {
      const url = new URL(page.url());
      const hosts = platformHosts[account.platform] ?? [];
      return (
        hosts.includes(url.hostname) &&
        url.protocol === 'https:' &&
        url.pathname.replace(/\/$/, '') === new URL(account.profileUrl).pathname.replace(/\/$/, '')
      );
    };
    if (!isOwnedProfilePage()) return 'not-authenticated';
    const ownerOnlyControls =
      account.platform === 'x'
        ? [page.getByRole('link', { name: /edit profile/i })]
        : [
            page.getByRole('button', { name: /edit intro/i }),
            page.getByRole('link', { name: /edit profile/i }),
            page.getByRole('button', { name: /edit profile/i }),
          ];
    for (const control of ownerOnlyControls) {
      try {
        await control.first().waitFor({ state: 'visible', timeout: 4000 });
        return isOwnedProfilePage() ? 'verified' : 'not-authenticated';
      } catch {
        /* Try the next owner-only control. */
      }
    }
    return 'not-authenticated';
  }

  private async account(id: string): Promise<SocialAccount> {
    const { accounts } = this.deps;
    if (!/^[0-9a-fA-F-]{36}$/.test(id)) throw Error('Invalid connector account');
    const row = (await accounts.get()).socialAccounts.find((row) => row.id === id);
    if (!row) throw Error('Social account not found');
    return row;
  }

  /** Extract only an owner-navigation link from an authenticated provider page. */
  async discover(
    page: Page,
    platform: 'linkedin' | 'x',
  ): Promise<{
    platform: string;
    label: string;
    handle: string;
    profileUrl: string;
    avatarUrl?: string;
  } | null> {
    const here = new URL(page.url());
    const trustedHosts = platformHosts[platform];
    if (!trustedHosts || here.protocol !== 'https:' || !trustedHosts.includes(here.hostname))
      throw Error('Provider sign-in is not complete');
    const candidates =
      platform === 'linkedin'
        ? [
            'a[data-control-name="identity_profile_photo"][href*="/in/"]',
            '.feed-identity-module a[href*="/in/"]',
            'a.global-nav__secondary-item[href*="/in/"]',
            'a.global-nav__primary-link[href*="/in/"]',
            'header a[href*="/in/"]',
            'nav a[href*="/in/"]',
          ]
        : [
            'a[data-testid="AppTabBar_Profile_Link"]',
            'a[aria-label="Profile"]',
            'nav a[data-testid="AppTabBar_Profile_Link"]',
          ];
    let profileUrl: URL | null = null;
    let avatarUrl: string | undefined;
    let displayName: string | undefined;
    for (const selector of candidates) {
      const link = page.locator(selector).first();
      const href = await link.getAttribute('href', { timeout: 1500 }).catch(() => null);
      if (!href) continue;
      const imageNode = typeof link.locator === 'function' ? link.locator('img') : null;
      const sources = imageNode
        ? await imageNode
            .evaluateAll((images) =>
              images.map((image) => ({
                src: image.getAttribute('src') || '',
                alt: image.getAttribute('alt') || '',
              })),
            )
            .catch(() => [] as Array<{ src: string; alt: string }>)
        : [];
      const portrait = sources.find((image) => Boolean(portraitUrl(image.src)));
      const image = portrait?.src ?? null;
      const alt = portrait?.alt ?? null;
      if (image) avatarUrl = image;
      const named = alt?.replace(/^photo of\s+/i, '').trim();
      if (named) displayName = named;
      try {
        const candidate = new URL(href, here.origin);
        if (
          candidate.protocol !== 'https:' ||
          !trustedHosts.includes(candidate.hostname) ||
          candidate.search ||
          candidate.hash ||
          candidate.username ||
          candidate.password ||
          candidate.port
        )
          continue;
        const path =
          platform === 'linkedin' ? /^\/in\/([a-zA-Z0-9_-]{3,100})\/?$/ : /^\/([a-zA-Z0-9_]{1,15})\/?$/;
        if (!path.test(candidate.pathname)) continue;
        profileUrl = candidate;
        break;
      } catch {
        /* Invalid provider link is not owner identity evidence. */
      }
    }
    if (!profileUrl && typeof page.evaluate === 'function') {
      const found = await page
        .evaluate((network) => {
          const anchors = Array.from(document.querySelectorAll('a[href]'));
          const rows = anchors
            .map((anchor) => {
              const href = anchor.getAttribute('href') || '';
              const img = anchor.querySelector('img');
              return {
                href,
                inChrome: Boolean(anchor.closest('header, nav, [role="banner"]')),
                avatar: img?.getAttribute('src') || '',
                alt: img?.getAttribute('alt') || '',
              };
            })
            .map((row) => ({
              ...row,
              avatar:
                row.avatar.startsWith('https://') &&
                !row.avatar.toLowerCase().includes('displaybackground') &&
                !row.avatar.toLowerCase().includes('backgroundimage')
                  ? row.avatar
                  : '',
            }))
            .filter((row) =>
              network === 'linkedin'
                ? /\/in\/[A-Za-z0-9_-]{3,100}\/?$/.test(row.href.split('?')[0] || '')
                : /^\/[A-Za-z0-9_]{1,15}\/?$/.test(row.href.split('?')[0] || ''),
            );
          return (
            rows.find((row) => row.inChrome && row.avatar.includes('displayphoto')) ||
            rows.find((row) => row.avatar.includes('displayphoto')) ||
            rows.find((row) => row.inChrome && row.avatar) ||
            rows.find((row) => row.inChrome) ||
            null
          );
        }, platform)
        .catch(() => null);
      if (found?.href) {
        try {
          const candidate = new URL(found.href, here.origin);
          const path =
            platform === 'linkedin'
              ? /^\/in\/([a-zA-Z0-9_-]{3,100})\/?$/
              : /^\/([a-zA-Z0-9_]{1,15})\/?$/;
          if (
            candidate.protocol === 'https:' &&
            trustedHosts.includes(candidate.hostname) &&
            !candidate.username &&
            !candidate.password &&
            !candidate.port &&
            path.test(candidate.pathname)
          ) {
            profileUrl = candidate;
            const src = found.avatar;
            if (portraitUrl(src)) avatarUrl = src;
            const named = found.alt.replace(/^photo of\s+/i, '').trim();
            if (named) displayName = named;
          }
        } catch {
          profileUrl = null;
        }
      }
    }
    if (!profileUrl) return null;
    const handle = profileUrl.pathname.split('/').filter(Boolean).at(-1);
    if (!handle) return null;
    const normalized =
      platform === 'linkedin' ? `https://www.linkedin.com/in/${handle}/` : `https://x.com/${handle}`;
    const safeAvatar = avatarUrl && avatarUrl.startsWith('https://') ? avatarUrl : undefined;
    const label = displayName && displayName.length <= 100 ? displayName : handle;
    const verified = await this.verify(page, {
      id: '',
      platform,
      label,
      handle,
      profileUrl: normalized,
      ...(safeAvatar ? { avatarUrl: safeAvatar } : {}),
    } as SocialAccount);
    if (verified === 'temporarily-unavailable') return null;
    if (verified !== 'verified') throw Error('Provider profile ownership could not be verified');
    return {
      platform,
      label,
      handle,
      profileUrl: normalized,
      ...(safeAvatar ? { avatarUrl: safeAvatar } : {}),
    };
  }

  /** Scroll and scrape the owned profile page, then persist captured fields. */
  async absorbProfile(page: Page, platform: 'linkedin' | 'x'): Promise<void> {
    try {
      await page.evaluate(() => {
        (globalThis as { __name?: (target: unknown) => unknown }).__name = (target) => target;
      });
      const captured = await page.evaluate(async (network) => {
        const clean = (node: Element | null) => (node?.textContent || '').replace(/\s+/g, ' ').trim();
        const pause = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));
        const main = document.querySelector('main');
        if (main && network === 'linkedin') {
          for (let attempt = 0; attempt < 8 && !main.querySelector('h1, h2'); attempt += 1)
            await pause(250);
          const step = Math.max(main.clientHeight - 80, 400);
          const limit = Math.min(main.scrollHeight, 14000);
          for (let top = 0; top <= limit; top += step) {
            main.scrollTop = top;
            await pause(220);
          }
        }
        const images = Array.from(document.images).map((image) => image.currentSrc || image.src || '');
        const avatar =
          images.find((src) => {
            const lower = src.toLowerCase();
            if (!lower.startsWith('https://')) return false;
            if (
              lower.includes('displaybackground') ||
              lower.includes('backgroundimage') ||
              lower.includes('profile_banners')
            )
              return false;
            return (
              lower.includes('displayphoto') ||
              lower.includes('profile-framedphoto') ||
              lower.includes('profile_images') ||
              lower.includes('profile_photo')
            );
          }) || '';
        if (network === 'x') {
          return {
            displayName: clean(document.querySelector('[data-testid="UserName"]')),
            about: clean(document.querySelector('[data-testid="UserDescription"]')),
            location: clean(document.querySelector('[data-testid="UserLocation"]')),
            website:
              (document.querySelector('[data-testid="UserUrl"] a') as HTMLAnchorElement | null)?.href ||
              '',
            avatarUrl: avatar,
          };
        }
        const lines = (main?.innerText || '')
          .split('\n')
          .map((line) => line.replace(/\s+/g, ' ').trim())
          .filter(Boolean);
        const headingLabels = [
          'about',
          'services',
          'featured',
          'activity',
          'experience',
          'education',
          'skills',
          'licenses & certifications',
          'projects',
          'interests',
          'analytics',
          'profile language',
          'public profile & url',
          'suggested for you',
          'ad options',
          'connected apps',
          'you might like',
          'people you may know',
        ];
        const isHeading = (line: string) => {
          const lower = line.toLowerCase();
          return headingLabels.some((label) => lower === label || lower.startsWith(label + ' ('));
        };
        const section = (label: string) => {
          const start = lines.findIndex((line) => {
            const lower = line.toLowerCase();
            return lower === label || lower.startsWith(label + ' (');
          });
          if (start < 0) return '';
          const chunk: string[] = [];
          const limit = label === 'skills' ? 30 : 20;
          for (let index = start + 1; index < lines.length && chunk.length < limit; index += 1) {
            const line = lines[index];
            if (line === undefined) continue;
            if (isHeading(line)) break;
            if (label === 'about' && /^top skills$/i.test(line)) break;
            if (/^(show all|see more|show more|… more|\.\.\. more|\d+\s+experiences?)$/i.test(line))
              continue;
            if (line.length < 2) continue;
            chunk.push(line);
          }
          return chunk.join('\n');
        };
        const chrome =
          /^(suggested for you|analytics|about|services|featured|activity|profile language|public profile & url|ad options|experience|education|connected apps|licenses & certifications|projects|skills|interests|you might like|people you may know)/i;
        const headings = Array.from((main || document).querySelectorAll('h1, h2'))
          .map((node) => clean(node))
          .filter(Boolean);
        const displayName =
          headings.find((text) => text.length < 80 && !chrome.test(text)) ||
          clean(document.querySelector('main h1, h1'));
        const nameAt = displayName ? lines.findIndex((line) => line === displayName) : -1;
        const following = nameAt >= 0 ? lines.slice(nameAt + 1) : lines;
        const noise =
          /^(contact info|portfolio|open to|add section|show details|show all|see more|·|\d[\d,]* followers|\d[\d,]* connections)$/i;
        const headline =
          following.find(
            (line) => !noise.test(line) && !isHeading(line) && line.length > 2 && line.length < 220,
          ) || clean(document.querySelector('.text-body-medium'));
        const location =
          following.find(
            (line) =>
              line.includes(',') &&
              line.length < 90 &&
              !/follower|connection/i.test(line) &&
              !isHeading(line),
          ) ||
          clean(
            document.querySelector(
              '.text-body-small.inline, .pv-text-details__left-panel .text-body-small',
            ),
          );
        const aboutHead = Array.from((main || document).querySelectorAll('h1, h2')).find(
          (node) => clean(node).toLowerCase() === 'about',
        );
        let website = '';
        if (main) {
          const links = Array.from(main.querySelectorAll('a[href^="https://"]'));
          const top = aboutHead
            ? links.filter(
                (link) =>
                  (aboutHead.compareDocumentPosition(link) & Node.DOCUMENT_POSITION_PRECEDING) !== 0,
              )
            : links;
          website =
            top
              .map((link) => (link as HTMLAnchorElement).href)
              .find((href) => {
                try {
                  const host = new URL(href).hostname;
                  return !/(^|\.)linkedin\.com$|(^|\.)licdn\.com$/i.test(host);
                } catch {
                  return false;
                }
              }) || '';
        }
        const about = section('about');
        const experience = section('experience');
        let skills = section('skills');
        const topSkillsAt = lines.findIndex((line) => line.toLowerCase() === 'top skills');
        const topSkills = topSkillsAt >= 0 ? lines[topSkillsAt + 1] || '' : '';
        if (topSkills.includes('•') && topSkills.length > skills.length)
          skills = topSkills.replace(/ • /g, '\n');
        if (!website) {
          const mentioned = (about + '\n' + experience).match(/https:\/\/[^\s)]+/);
          if (mentioned && !/linkedin\.com|licdn\.com/i.test(mentioned[0]))
            website = mentioned[0].replace(/[.,;]+$/, '');
        }
        return {
          displayName,
          headline,
          location,
          about,
          experience,
          education: section('education'),
          skills,
          website,
          avatarUrl: avatar,
        };
      }, platform);
      const { accounts } = this.deps;
      await accounts.fillEmptyProfile(captured);
    } catch (error) {
      console.error(
        'profile-capture-failed',
        error instanceof Error ? error.message : 'unreadable profile',
      );
    }
  }

  private async checkExistingSignIn(id: string) {
    const { accounts, sessions, store, audit } = this.deps;
    const account = await this.account(id);
    const browser = sessions.get(id);
    const page = browser?.currentPage;
    if (!page || page.isClosed?.()) return { status: 'reconnect-required' as const, accountId: id };
    const here = new URL(page.url());
    const target = new URL(account.profileUrl);
    if (here.protocol !== 'https:' || !platformHosts[account.platform]?.includes(here.hostname))
      return { status: 'sign-in-open' as const, accountId: id };
    const onOwnedProfile = here.pathname.replace(/\/$/, '') === target.pathname.replace(/\/$/, '');
    if (onOwnedProfile) {
      const outcome = await this.verify(page, account, false);
      if (outcome !== 'verified')
        return {
          status:
            outcome === 'temporarily-unavailable'
              ? ('temporarily-unavailable' as const)
              : ('sign-in-open' as const),
          accountId: id,
        };
    } else {
      const owner = await this.discover(page, account.platform as 'linkedin' | 'x').catch(() => null);
      if (!owner) return { status: 'sign-in-open' as const, accountId: id };
      if (owner.profileUrl !== account.profileUrl)
        return { status: 'reconnect-required' as const, accountId: id };
    }
    await store.update(id, {
      accountId: id,
      verifiedAt: new Date().toISOString(),
      platform: account.platform,
      handle: account.handle,
      profileUrl: account.profileUrl,
    });
    sessions.delete(id);
    await browser?.close().catch(() => {});
    await audit('session-verified', account);
    return { status: 'connected' as const, accountId: id };
  }

  async check(id: string): Promise<{ status: string; accountId: string }> {
    const { checks, pending, sessions, store, accounts, makeBrowser, audit } = this.deps;
    const inFlight = checks.get(id);
    if (inFlight) return inFlight;
    const attempt = (
      pending.has(id) ? this.sync(id) : sessions.has(id) ? this.checkExistingSignIn(id) : this.sync(id)
    ).finally(() => checks.delete(id));
    checks.set(id, attempt);
    return attempt;
  }

  async sync(id: string): Promise<{ status: string; accountId: string }> {
    const { pending, sessions, store, accounts, makeBrowser, audit } = this.deps;
    const entry = pending.get(id);
    if (entry) {
      const page = entry.browser.currentPage;
      if (!page || page.isClosed?.()) throw Error('Connection window is closed. Connect again.');
      let identity: Awaited<ReturnType<ConnectorVerifier['discover']>>;
      try {
        identity = await this.discover(page, entry.platform);
      } catch (error) {
        if (isConnectionTimeout(error))
          return { status: 'temporarily-unavailable' as const, accountId: id };
        throw error;
      }
      if (!identity) return { status: 'sign-in-open' as const, accountId: id };
      await accounts.linkVerifiedSocial(id, identity);
      await store.update(id, {
        accountId: id,
        verifiedAt: new Date().toISOString(),
        ...identity,
      });
      await this.absorbProfile(page, entry.platform);
      pending.delete(id);
      await entry.browser.close().catch(() => {});
      return { status: 'connected' as const, accountId: id };
    }
    const account = await this.account(id);
    if (
      (await accounts.get()).socialAccounts.filter((item) => item.platform === account.platform).length >
      1
    )
      throw Error('Legacy duplicate accounts must be resolved before syncing');
    const current = await store.get();
    const session = sessions.get(id);
    const matching =
      current[id]?.platform === account.platform &&
      current[id]?.handle === account.handle &&
      current[id]?.profileUrl === account.profileUrl;
    if (!session && !matching) throw Error('Account is disconnected. Connect before requesting sync.');
    if (!browserPlatform(account.platform)) throw Error('Official API connector not configured');
    const browser = sessions.get(id) || makeBrowser();
    if (!sessions.has(id)) sessions.set(id, browser);
    let keepWindowOpen = false;
    try {
      const page = browser.currentPage || (await browser.open(account.platform, id));
      const outcome = await this.verify(page, account);
      if (outcome === 'temporarily-unavailable') {
        keepWindowOpen = true;
        await audit('temporarily-unavailable', account);
        return { status: 'temporarily-unavailable' as const, accountId: id };
      }
      if (outcome !== 'verified') {
        await store.update(id, null);
        keepWindowOpen = true;
        await audit('reconnect-required', account);
        return { status: 'reconnect-required' as const, accountId: id };
      }
      await store.update(id, {
        accountId: id,
        verifiedAt: new Date().toISOString(),
        platform: account.platform,
        handle: account.handle,
        profileUrl: account.profileUrl,
      });
      if (account.platform === 'linkedin' || account.platform === 'x')
        await this.absorbProfile(page, account.platform);
      await audit('session-verified', account);
      return { status: 'connected' as const, accountId: id };
    } finally {
      if (!keepWindowOpen) {
        sessions.delete(id);
        await browser.close().catch(() => {});
      }
    }
  }
}
