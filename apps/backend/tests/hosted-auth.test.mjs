import { createHash, generateKeyPairSync, sign } from 'node:crypto';
import { expect, test } from 'vitest';
import { createHostedAuth } from '../hosted/auth.mjs';

const issuer = 'https://identity.example.test';
const redirect = 'https://utomator.example.test/auth/callback';
const keys = generateKeyPairSync('rsa', { modulusLength: 2048 });
const jwk = { ...keys.publicKey.export({ format: 'jwk' }), kid: 'test-key', alg: 'RS256', use: 'sig' };
const now = () => Math.floor(Date.now() / 1000);
const signed = (claims) => {
  const header = Buffer.from(JSON.stringify({ alg: 'RS256', kid: 'test-key' })).toString('base64url');
  const payload = Buffer.from(JSON.stringify(claims)).toString('base64url');
  return (
    header +
    '.' +
    payload +
    '.' +
    sign('RSA-SHA256', Buffer.from(`${header}.${payload}`), keys.privateKey).toString('base64url')
  );
};
const config = {
  issuer,
  redirectUri: redirect,
  clientId: 'utomator-hosted-client',
  sessionSecret: 'test-secret-do-not-use-in-production-1234567890',
  ownerKey: 'stable-test-owner-key-at-least-32-bytes-1234567890',
};
const claims = (nonce, overrides = {}) => ({
  iss: issuer,
  aud: config.clientId,
  sub: 'alice-subject',
  nonce,
  iat: now(),
  exp: now() + 3600,
  ...overrides,
});
const create = (overrides) => {
  const io = {
    requestJson: async (url, options) => {
      if (url.endsWith('/.well-known/openid-configuration'))
        return {
          issuer,
          authorization_endpoint: `${issuer}/authorize`,
          token_endpoint: `${issuer}/token`,
          jwks_uri: `${issuer}/keys`,
        };
      if (url.endsWith('/keys')) return { keys: [jwk] };
      if (url.endsWith('/token')) {
        expect(options.method).toEqual('POST');
        const form = new URLSearchParams(options.body);
        expect(form.get('grant_type')).toEqual('authorization_code');
        expect(form.get('client_id')).toEqual(config.clientId);
        expect(form.get('redirect_uri')).toEqual(redirect);
        expect(form.get('code_verifier').length >= 43).toBeTruthy();
        return { id_token: signed(claims(overrides.nonce, overrides.claims)) };
      }
      throw Error(`Unexpected identity provider request: ${url}`);
    },
  };
  return createHostedAuth(config, io);
};
const flow = async (auth) => {
  const started = await auth.begin();
  const cookie = started.cookie.split(';')[0];
  const url = new URL(started.url);
  const body = cookie.split('=')[1];
  const payload = JSON.parse(
    Buffer.from(decodeURIComponent(body).split('.')[0], 'base64url').toString('utf8'),
  );
  expect(url.searchParams.get('code_challenge_method')).toEqual('S256');
  expect(url.searchParams.get('code_challenge')).toEqual(
    createHash('sha256').update(payload.verifier).digest('base64url'),
  );
  return { url, cookie, payload };
};

test('OIDC authorization-code login binds state, nonce, PKCE, JWT signature and tenant UUID', async () => {
  const auth = create({ nonce: null });
  const first = await flow(auth);
  // The mock token provider issues a signed RS256 ID token for the login nonce.
  const verified = create({ nonce: first.payload.nonce });
  const result = await verified.callback(
    {
      state: first.url.searchParams.get('state'),
      code: 'valid-auth-code',
    },
    first.cookie,
  );
  expect(result.ownerId).toMatch(/^[a-f0-9-]{36}$/);
  expect(result.ownerId).not.toEqual('local-owner');
  const sessionCookie = result.cookies[0].split(';')[0];
  const session = verified.session(sessionCookie);
  expect(session.ownerId).toEqual(result.ownerId);
  expect(session.sub).toEqual('alice-subject');
  expect(verified.session(sessionCookie.replace(/.$/, 'x'))).toEqual(null);
  expect(verified.session('')).toEqual(null);
  verified.revoke(sessionCookie);
  expect(verified.session(sessionCookie)).toEqual(null);
  expect(result.cookies[0]).toMatch(/HttpOnly/);
  expect(result.cookies[0]).toMatch(/Secure/);
  expect(result.cookies[0]).toMatch(/SameSite=Lax/);
  expect(verified.requireOrigin('https://utomator.example.test')).toEqual(true);
  expect(verified.requireOrigin('https://other.example.test')).toEqual(false);
  expect(verified.ownerFromClaims(claims(first.payload.nonce))).toEqual(result.ownerId);
  expect(verified.ownerFromClaims(claims(first.payload.nonce, { sub: 'bob-subject' }))).not.toEqual(
    result.ownerId,
  );
  const rotated = createHostedAuth({
    ...config,
    sessionSecret: 'rotated-session-secret-at-least-32-bytes-1234',
  });
  expect(rotated.ownerFromClaims(claims(first.payload.nonce))).toEqual(result.ownerId);
});

test('OIDC callback rejects altered state, missing cookie, expired nonce or incorrect signature', async () => {
  const auth = create({ nonce: 'incorrect' });
  const started = await flow(auth);
  await expect(auth.callback({ state: 'changed', code: 'code' }, started.cookie)).rejects.toThrow(
    /state/,
  );
  await expect(auth.callback({ state: started.payload.state, code: 'code' }, '')).rejects.toThrow(
    /state/,
  );
  await expect(
    auth.callback({ state: started.payload.state, code: 'code' }, started.cookie),
  ).rejects.toThrow(/claims/);
});

test('OIDC signed token rejects wrong audience, issuer, expired time and invalid algorithm', async () => {
  const auth = create({});
  const nonce = 'nonce-for-test';
  const cases = [
    { aud: 'different-client' },
    { iss: 'https://other.example.test' },
    { exp: now() - 1 },
    { nbf: now() + 1000 },
    { iat: now() + 1000 },
    { aud: ['utomator-hosted-client', 'another'], azp: 'another' },
    { azp: 'another' },
  ];
  for (const mismatch of cases) {
    let e;
    try {
      await auth.verifyIdToken(signed(claims(nonce, mismatch)), nonce)();
    } catch (caught) {
      e = caught;
    }
    expect(e).toBeDefined();
    expect(() => {
      throw e;
    }).toThrow();
  }
  let e;
  try {
    await auth.verifyIdToken('eyJhbGciOiJub25lIn0.eyJzdWIiOiJ4In0.', nonce)();
  } catch (caught) {
    e = caught;
  }
  expect(e).toBeDefined();
  expect(() => {
    throw e;
  }).toThrow();
  const token = signed(claims(nonce));
  await expect(auth.verifyIdToken(`${token.slice(0, -2)}xx`, nonce)).rejects.toThrow(/signature/);
  expect((await auth.verifyIdToken(token, nonce)).sub).toEqual('alice-subject');
});

test('hosted authentication validates deployment configuration before serving traffic', () => {
  expect(() => createHostedAuth({ ...config, sessionSecret: 'short' })).toThrow(/32/);
  expect(() => createHostedAuth({ ...config, issuer: 'http://localhost:9000' })).toThrow(/HTTPS/);
  expect(() =>
    createHostedAuth({ ...config, redirectUri: 'http://localhost:3200/auth/callback' }),
  ).toThrow(/HTTPS/);
});
