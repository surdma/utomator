import { createCipheriv, createDecipheriv, randomBytes, randomUUID } from 'node:crypto';
import type { DocumentStore } from '../db/documents.js';
import type { LinkedInEditorialStore } from './linkedin-editorial.js';

type Accounts = {
  get(): Promise<{
    socialAccounts: Array<{ id: string; platform: string; profileUrl: string }>;
  }>;
};
type Credentials = {
  token: string;
  subject: string;
  expiresAt: string;
  scopes: string[];
};
type Pending = { accountId: string; expiresAt: string };
type StoredGrant = {
  accountId: string;
  subject: string;
  expiresAt: string;
  scopes: string[];
  ciphertext: string;
  iv: string;
  tag: string;
};
type Fetcher = typeof fetch;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const POST_URN = /^urn:li:(?:share|ugcPost):[0-9]+$/;
export class LinkedInProviderError extends Error {
  constructor(
    message: string,
    readonly httpStatus: number = 400,
    readonly uncertain = false,
  ) {
    super(message);
  }
}
const checkedVersion = (value: string) => {
  if (!/^20[2-9][0-9](?:0[1-9]|1[0-2])$/.test(value))
    throw Error('LINKEDIN_API_VERSION must use YYYYMM');
  return value;
};
export class LinkedInPublishingProvider {
  private store?: DocumentStore;
  private readonly fetcher: Fetcher;
  private readonly key: Buffer | null;
  private readonly settings: {
    clientId: string;
    clientSecret: string;
    redirectUri: string;
    version: string;
  };
  constructor(
    private accounts: Accounts,
    private drafts: LinkedInEditorialStore,
    env: NodeJS.ProcessEnv = process.env,
    fetcher: Fetcher = fetch,
  ) {
    this.fetcher = fetcher;
    const key = env.LINKEDIN_TOKEN_ENCRYPTION_KEY || '';
    if (key && !/^[a-fA-F0-9]{64}$/.test(key)) throw Error('Invalid LINKEDIN_TOKEN_ENCRYPTION_KEY');
    this.key = key ? Buffer.from(key, 'hex') : null;
    this.settings = {
      clientId: env.LINKEDIN_CLIENT_ID || '',
      clientSecret: env.LINKEDIN_CLIENT_SECRET || '',
      redirectUri: env.LINKEDIN_REDIRECT_URI || '',
      version: checkedVersion(env.LINKEDIN_API_VERSION || '202610'),
    };
  }
  setDocuments(documents: DocumentStore) {
    this.store = documents;
  }
  private documents(): DocumentStore {
    if (!this.store) throw new LinkedInProviderError('Publishing storage is unavailable', 503);
    return this.store;
  }
  private configured() {
    const { clientId, clientSecret, redirectUri } = this.settings;
    if (!this.key || !clientId || !clientSecret || !redirectUri)
      throw new LinkedInProviderError(
        'LinkedIn OAuth is not configured. Set the client, redirect URL and encryption key.',
        503,
      );
    const u = new URL(redirectUri);
    if (u.protocol !== 'https:' || u.username || u.password || u.hash || u.search)
      throw new LinkedInProviderError('LinkedIn redirect URL must be an exact HTTPS callback', 503);
  }
  private async account(id: string) {
    if (!UUID.test(id)) throw new LinkedInProviderError('Invalid saved LinkedIn account');
    const row = (await this.accounts.get()).socialAccounts.find(
      (x) => x.id === id && x.platform === 'linkedin',
    );
    if (!row) throw new LinkedInProviderError('Saved LinkedIn account is unavailable', 404);
    return row;
  }
  private encrypt(token: string) {
    if (!this.key) throw new LinkedInProviderError('OAuth encryption is unavailable', 503);
    const iv = randomBytes(12),
      cipher = createCipheriv('aes-256-gcm', this.key, iv);
    const payload = Buffer.concat([cipher.update(token, 'utf8'), cipher.final()]);
    return {
      iv: iv.toString('base64'),
      tag: cipher.getAuthTag().toString('base64'),
      ciphertext: payload.toString('base64'),
    };
  }
  private decrypt(grant: StoredGrant) {
    if (!this.key) throw new LinkedInProviderError('OAuth encryption is unavailable', 503);
    const decipher = createDecipheriv('aes-256-gcm', this.key, Buffer.from(grant.iv, 'base64'));
    decipher.setAuthTag(Buffer.from(grant.tag, 'base64'));
    return Buffer.concat([
      decipher.update(Buffer.from(grant.ciphertext, 'base64')),
      decipher.final(),
    ]).toString('utf8');
  }
  async status(accountId: string) {
    await this.account(accountId);
    const record = await this.documents().get<StoredGrant>('linkedin-oauth-grants', accountId);
    if (!record)
      return {
        connected: false,
        configured: Boolean(
          this.key && this.settings.clientId && this.settings.clientSecret && this.settings.redirectUri,
        ),
      };
    const g = record.value;
    return {
      connected: new Date(g.expiresAt).getTime() > Date.now() + 30000,
      configured: true,
      subject: g.subject,
      expiresAt: g.expiresAt,
      scopes: g.scopes,
    };
  }
  async begin(accountId: string) {
    this.configured();
    await this.account(accountId);
    const id = randomUUID();
    const pending: Pending = {
      accountId,
      expiresAt: new Date(Date.now() + 10 * 60 * 1000).toISOString(),
    };
    await this.documents().put('linkedin-oauth-pending', id, pending, 0);
    const params = new URLSearchParams({
      response_type: 'code',
      client_id: this.settings.clientId,
      redirect_uri: this.settings.redirectUri,
      state: id,
      scope: 'openid profile w_member_social',
    });
    return {
      authorizationUrl: 'https://www.linkedin.com/oauth/v2/authorization?' + params.toString(),
      expiresAt: pending.expiresAt,
    };
  }
  private async request(url: string, options: RequestInit, timeoutMs = 12000): Promise<Response> {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), timeoutMs);
    try {
      return await this.fetcher(url, {
        ...options,
        signal: controller.signal,
        redirect: 'error',
      });
    } catch (error) {
      throw new LinkedInProviderError(
        'LinkedIn request outcome is unknown; do not retry publishing automatically',
        502,
        true,
      );
    } finally {
      clearTimeout(timeout);
    }
  }
  async callback(state: string, code: string) {
    this.configured();
    if (!UUID.test(state) || typeof code !== 'string' || code.length < 5 || code.length > 2048)
      throw new LinkedInProviderError('Invalid OAuth callback');
    const pending = await this.documents().get<Pending>('linkedin-oauth-pending', state);
    if (!pending || Date.parse(pending.value.expiresAt) < Date.now())
      throw new LinkedInProviderError('OAuth authorization expired or already used');
    // Consume the CSRF state before exchanging credentials. A callback can never be replayed.
    await this.documents().remove('linkedin-oauth-pending', state, pending.version);
    await this.account(pending.value.accountId);
    const response = await this.request('https://www.linkedin.com/oauth/v2/accessToken', {
      method: 'POST',
      headers: { 'content-type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        grant_type: 'authorization_code',
        code,
        redirect_uri: this.settings.redirectUri,
        client_id: this.settings.clientId,
        client_secret: this.settings.clientSecret,
      }).toString(),
    });
    if (!response.ok)
      throw new LinkedInProviderError(
        'LinkedIn rejected the OAuth authorization; reconnect the account',
        401,
      );
    const token = (await response.json()) as Partial<{
      access_token: string;
      expires_in: number;
      scope: string;
    }>;
    if (
      typeof token.access_token !== 'string' ||
      token.access_token.length < 10 ||
      typeof token.expires_in !== 'number' ||
      !Number.isFinite(token.expires_in) ||
      token.expires_in <= 0
    )
      throw new LinkedInProviderError('LinkedIn returned an invalid authorization grant', 502);
    const scopes = (token.scope || '').split(' ').filter(Boolean);
    if (!['openid', 'profile', 'w_member_social'].every((x) => scopes.includes(x)))
      throw new LinkedInProviderError(
        'LinkedIn did not grant all required account and publishing permissions',
        403,
      );
    const info = await this.request('https://api.linkedin.com/v2/userinfo', {
      headers: {
        authorization: 'Bearer ' + token.access_token,
        accept: 'application/json',
      },
    });
    if (!info.ok) throw new LinkedInProviderError('LinkedIn did not confirm the consented member', 401);
    const identity = (await info.json()) as { sub?: unknown };
    if (typeof identity.sub !== 'string' || !/^[a-zA-Z0-9_-]{3,128}$/.test(identity.sub))
      throw new LinkedInProviderError('LinkedIn member identity response was invalid', 502);
    const grant: StoredGrant = {
      accountId: pending.value.accountId,
      subject: identity.sub,
      expiresAt: new Date(Date.now() + Math.floor(token.expires_in) * 1000).toISOString(),
      scopes,
      ...this.encrypt(token.access_token),
    };
    const doc = await this.documents().get<StoredGrant>('linkedin-oauth-grants', grant.accountId);
    // Keep a saved account bound to one OAuth member unless explicitly disconnected.
    if (doc && doc.value.subject !== grant.subject)
      throw new LinkedInProviderError(
        'Another LinkedIn member was previously authorized; disconnect before switching',
        409,
      );
    await this.documents().put('linkedin-oauth-grants', grant.accountId, grant, doc?.version ?? 0);
    return {
      connected: true,
      accountId: grant.accountId,
      subject: grant.subject,
      expiresAt: grant.expiresAt,
    };
  }
  async disconnect(accountId: string) {
    await this.account(accountId);
    const doc = await this.documents().get<StoredGrant>('linkedin-oauth-grants', accountId);
    if (doc) await this.documents().remove('linkedin-oauth-grants', accountId, doc.version);
    return { connected: false };
  }
  private async credentials(accountId: string): Promise<Credentials> {
    this.configured();
    const doc = await this.documents().get<StoredGrant>('linkedin-oauth-grants', accountId);
    if (!doc || new Date(doc.value.expiresAt).getTime() <= Date.now() + 30000)
      throw new LinkedInProviderError('LinkedIn publishing authorization is missing or expired', 401);
    if (!doc.value.scopes.includes('w_member_social'))
      throw new LinkedInProviderError('Publishing permission is missing', 403);
    return {
      token: this.decrypt(doc.value),
      subject: doc.value.subject,
      expiresAt: doc.value.expiresAt,
      scopes: doc.value.scopes,
    };
  }
  async publish(draftId: string, expectedVersion: number, confirmed: boolean) {
    if (confirmed !== true)
      throw new LinkedInProviderError('Explicit publication confirmation is required', 400);
    const draft = await this.drafts.get(draftId);
    if (!draft) throw new LinkedInProviderError('Draft not found', 404);
    await this.account(draft.accountId);
    if (draft.status !== 'approved' || draft.version !== expectedVersion)
      throw new LinkedInProviderError('Publish requires the current approved draft revision', 409);
    const grant = await this.credentials(draft.accountId);
    const claim = await this.drafts.beginPublication(draftId, expectedVersion);
    const attemptId = claim.publication!.attemptId;
    try {
      const res = await this.request('https://api.linkedin.com/rest/posts', {
        method: 'POST',
        headers: {
          authorization: 'Bearer ' + grant.token,
          'content-type': 'application/json',
          'Linkedin-Version': this.settings.version,
          'X-Restli-Protocol-Version': '2.0.0',
        },
        body: JSON.stringify({
          author: 'urn:li:person:' + grant.subject,
          commentary: claim.content.body,
          visibility: 'PUBLIC',
          distribution: {
            feedDistribution: 'MAIN_FEED',
            targetEntities: [],
            thirdPartyDistributionChannels: [],
          },
          lifecycleState: 'PUBLISHED',
          isReshareDisabledByAuthor: false,
        }),
      });
      if (res.status === 201) {
        const urn = res.headers.get('x-restli-id') || '';
        if (!POST_URN.test(urn))
          throw new LinkedInProviderError(
            'LinkedIn accepted the publication but returned no verifiable post identifier',
            502,
            true,
          );
        return await this.drafts.finishPublication(draftId, attemptId, {
          status: 'published',
          postUrn: urn,
        });
      }
      if ([400, 401, 403, 404, 422, 429].includes(res.status)) {
        await this.drafts.finishPublication(draftId, attemptId, {
          status: 'publish-failed',
        });
        throw new LinkedInProviderError(
          res.status === 403
            ? 'LinkedIn denied Posts API access for this application'
            : res.status === 429
              ? 'LinkedIn rate limit reached; retry only after explicit review'
              : 'LinkedIn rejected the publication request (HTTP ' + res.status + ')',
          res.status,
        );
      }
      throw new LinkedInProviderError(
        'LinkedIn publication outcome is uncertain (HTTP ' + res.status + ')',
        502,
        true,
      );
    } catch (error) {
      if (error instanceof LinkedInProviderError && !error.uncertain) throw error;
      await this.drafts
        .finishPublication(draftId, attemptId, {
          status: 'publication-uncertain',
        })
        .catch(() => undefined);
      throw new LinkedInProviderError(
        'Publication outcome is uncertain. Do not republish until verified on LinkedIn.',
        502,
        true,
      );
    }
  }
}
