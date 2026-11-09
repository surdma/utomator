import { randomBytes } from 'node:crypto';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createClient } from '@libsql/client';
import { expect, test } from 'vitest';
import { AccountStore } from '../src/infrastructure/profile/account-store.js';
import { removeTemp } from './support/remove-temp.js';

process.env.NODE_ENV = 'test';
const { buildApp } = await import('../src/main.js');
const text =
  'Original explanatory post about reproducible engineering, community learning, and effective teamwork.';
const editorial = {
  goal: 'Publish engineering insight',
  pillar: 'Software education',
  body: text,
  sourceUrls: [],
  researchRunId: null,
};
const originalEnv = { ...process.env };
const version = '202610';
function mockTransport(
  outcome: 'success' | 'rejected' | 'uncertain',
  received: Array<{ url: string; request: RequestInit }>,
): typeof fetch {
  return (async (input: RequestInfo | URL, request?: RequestInit) => {
    const url = String(input);
    received.push({ url, request: request || {} });
    if (url.endsWith('/oauth/v2/accessToken'))
      return new Response(
        JSON.stringify({
          access_token: 'secret-oauth-token-12345',
          expires_in: 3600,
          scope: 'openid profile w_member_social',
        }),
        { status: 200, headers: { 'content-type': 'application/json' } },
      );
    if (url.endsWith('/v2/userinfo'))
      return new Response(JSON.stringify({ sub: 'memberA123' }), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      });
    if (url.endsWith('/rest/posts')) {
      if (outcome === 'uncertain') throw Error('connection reset after upload');
      if (outcome === 'rejected')
        return new Response(JSON.stringify({ message: 'not allowed' }), {
          status: 403,
        });
      return new Response('', {
        status: 201,
        headers: { 'x-restli-id': 'urn:li:share:1234567890123' },
      });
    }
    throw Error(`Unexpected provider request ${url}`);
  }) as typeof fetch;
}
async function fixture(outcome: 'success' | 'rejected' | 'uncertain') {
  const root = await mkdtemp(join(tmpdir(), 'utomator-li-publisher-'));
  const database = `file:${join(root, 'provider.db')}`,
    client = createClient({ url: database });
  await client.execute(
    'CREATE TABLE utomator_documents(' +
      'owner_id TEXT NOT NULL,namespace TEXT NOT NULL,record_key TEXT NOT NULL,' +
      'version INTEGER NOT NULL,payload TEXT NOT NULL,updated_at TEXT NOT NULL,' +
      'PRIMARY KEY(owner_id,namespace,record_key))',
  );
  Object.assign(process.env, {
    UTOMATOR_TEST_DATABASE: 'true',
    DB_FILE_NAME: database,
    LINKEDIN_CLIENT_ID: 'example-client',
    LINKEDIN_CLIENT_SECRET: 'test-client-secret',
    LINKEDIN_REDIRECT_URI: 'https://example.test/api/linkedin/oauth/callback',
    LINKEDIN_TOKEN_ENCRYPTION_KEY: randomBytes(32).toString('hex'),
    LINKEDIN_API_VERSION: version,
  });
  const received: Array<{ url: string; request: RequestInit }> = [];
  const app = buildApp({
    socialWorkspaceRoot: root,
    linkedInFetch: mockTransport(outcome, received),
  });
  await app.ready();
  const handle = 'example-editor';
  const seeded = await new AccountStore(root).addSocial(0, {
    platform: 'linkedin',
    label: 'Editor',
    handle,
    profileUrl: `https://www.linkedin.com/in/${handle}/`,
  });
  const accountId = seeded.socialAccounts[0]!.id;
  const draft = await app.inject({
    method: 'POST',
    url: '/linkedin/drafts',
    payload: { accountId, content: editorial },
  });
  expect(draft.statusCode).toEqual(201);
  const approved = await app.inject({
    method: 'POST',
    url: `/linkedin/drafts/${draft.json().id}/transition`,
    payload: { expectedVersion: 1, action: 'approve' },
  });
  expect(approved.statusCode).toEqual(200);
  const id = approved.json().id as string,
    revision = approved.json().version as number;
  const start = await app.inject({
    method: 'POST',
    url: '/linkedin/oauth/start',
    payload: { accountId },
  });
  expect(start.statusCode).toEqual(200);
  const url = new URL(start.json().authorizationUrl);
  expect(url.host).toEqual('www.linkedin.com');
  expect(url.searchParams.get('scope')).toEqual('openid profile w_member_social');
  expect(url.searchParams.get('redirect_uri')).toEqual(process.env.LINKEDIN_REDIRECT_URI);
  const nonce = url.searchParams.get('state');
  const cb = await app.inject(`/linkedin/oauth/callback?state=${nonce}&code=code-12345`);
  expect(cb.statusCode).toEqual(200);
  const replay = await app.inject(`/linkedin/oauth/callback?state=${nonce}&code=code-12345`);
  expect(replay.statusCode).toEqual(400);
  return { app, client, root, received, id, revision, accountId };
}
async function cleanup(o: Awaited<ReturnType<typeof fixture>>) {
  try {
    await o.app.close();
  } finally {
    await o.client.close();
    await removeTemp(o.root);
    for (const key of [
      'UTOMATOR_TEST_DATABASE',
      'DB_FILE_NAME',
      'LINKEDIN_CLIENT_ID',
      'LINKEDIN_CLIENT_SECRET',
      'LINKEDIN_REDIRECT_URI',
      'LINKEDIN_TOKEN_ENCRYPTION_KEY',
      'LINKEDIN_API_VERSION',
    ]) {
      if (originalEnv[key] === undefined) delete process.env[key];
      else process.env[key] = originalEnv[key];
    }
  }
}
test('OAuth consent -> member identity -> encrypted grant -> text publication -> receipt; no duplicate submission', async () => {
  const f = await fixture('success');
  try {
    const grant = await f.client.execute(
      "SELECT payload FROM utomator_documents WHERE namespace='linkedin-oauth-grants'",
    );
    expect(grant.rows.length).toEqual(1);
    expect(!String(grant.rows[0]!.payload).includes('secret-oauth-token-12345')).toBeTruthy();
    const status = await f.app.inject(`/linkedin/oauth/status?accountId=${f.accountId}`);
    expect(status.json().connected).toEqual(true);
    expect(!status.body.includes('secret-oauth-token')).toBeTruthy();
    const refused = await f.app.inject({
      method: 'POST',
      url: `/linkedin/drafts/${f.id}/publish`,
      payload: { expectedVersion: f.revision, confirmed: false },
    });
    expect(refused.statusCode).toEqual(400);
    const result = await f.app.inject({
      method: 'POST',
      url: `/linkedin/drafts/${f.id}/publish`,
      payload: { expectedVersion: f.revision, confirmed: true },
    });
    expect(result.statusCode).toEqual(200);
    expect(result.json().status).toEqual('published');
    expect(result.json().publication.postUrn).toEqual('urn:li:share:1234567890123');
    const post = f.received.filter((x) => x.url.endsWith('/rest/posts'));
    expect(post.length).toEqual(1);
    const request = post[0]!.request;
    expect((request.headers as Record<string, string>)['Linkedin-Version']).toEqual(version);
    expect(
      (
        JSON.parse(String(request.body)) as {
          author: string;
          commentary: string;
        }
      ).author,
    ).toEqual('urn:li:person:memberA123');
    expect((JSON.parse(String(request.body)) as { commentary: string }).commentary).toEqual(text);
    const duplicate = await f.app.inject({
      method: 'POST',
      url: `/linkedin/drafts/${f.id}/publish`,
      payload: { expectedVersion: f.revision, confirmed: true },
    });
    expect(duplicate.statusCode).toEqual(409);
    expect(f.received.filter((x) => x.url.endsWith('/rest/posts')).length).toEqual(1);
    const receipt = await f.app.inject(`/linkedin/drafts/${f.id}/yaml`);
    expect(receipt.body).toMatch(/externalPublishing: "confirmed"/);
    expect(receipt.body).toMatch(/urn:li:share:1234567890123/);
    const disconnected = await f.app.inject({
      method: 'POST',
      url: '/linkedin/oauth/disconnect',
      payload: { accountId: f.accountId },
    });
    expect(disconnected.statusCode).toEqual(200);
    expect(
      (await f.app.inject(`/linkedin/oauth/status?accountId=${f.accountId}`)).json().connected,
    ).toEqual(false);
  } finally {
    await cleanup(f);
  }
});
test('Provider refuses unauthorized publication and preserves terminal failure evidence', async () => {
  const f = await fixture('rejected');
  try {
    const result = await f.app.inject({
      method: 'POST',
      url: `/linkedin/drafts/${f.id}/publish`,
      payload: { expectedVersion: f.revision, confirmed: true },
    });
    expect(result.statusCode).toEqual(403);
    expect(result.body).toMatch(/denied Posts API access/);
    const persisted = (await f.app.inject(`/linkedin/drafts/${f.id}`)).json();
    expect(persisted.status).toEqual('publish-failed');
    expect(persisted.publication.status).toEqual('publish-failed');
    expect(f.received.filter((x) => x.url.endsWith('/rest/posts')).length).toEqual(1);
  } finally {
    await cleanup(f);
  }
});
test('Uncertain upstream post response is never retried or misreported as published', async () => {
  const f = await fixture('uncertain');
  try {
    const result = await f.app.inject({
      method: 'POST',
      url: `/linkedin/drafts/${f.id}/publish`,
      payload: { expectedVersion: f.revision, confirmed: true },
    });
    expect(result.statusCode).toEqual(502);
    const saved = (await f.app.inject(`/linkedin/drafts/${f.id}`)).json();
    expect(saved.status).toEqual('publication-uncertain');
    expect(saved.publication.postUrn).toEqual(undefined);
    const again = await f.app.inject({
      method: 'POST',
      url: `/linkedin/drafts/${f.id}/publish`,
      payload: { expectedVersion: saved.version, confirmed: true },
    });
    expect(again.statusCode).toEqual(409);
    expect(f.received.filter((x) => x.url.endsWith('/rest/posts')).length).toEqual(1);
  } finally {
    await cleanup(f);
  }
});
