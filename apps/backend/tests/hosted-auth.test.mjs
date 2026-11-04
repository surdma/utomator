import assert from 'node:assert/strict';
import { createHash, generateKeyPairSync, sign } from 'node:crypto';
import test from 'node:test';
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
        assert.equal(options.method, 'POST');
        const form = new URLSearchParams(options.body);
        assert.equal(form.get('grant_type'), 'authorization_code');
        assert.equal(form.get('client_id'), config.clientId);
        assert.equal(form.get('redirect_uri'), redirect);
        assert(form.get('code_verifier').length >= 43);
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
  assert.equal(url.searchParams.get('code_challenge_method'), 'S256');
  assert.equal(
    url.searchParams.get('code_challenge'),
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
  assert.match(result.ownerId, /^[a-f0-9-]{36}$/);
  assert.notEqual(result.ownerId, 'local-owner');
  const sessionCookie = result.cookies[0].split(';')[0];
  const session = verified.session(sessionCookie);
  assert.equal(session.ownerId, result.ownerId);
  assert.equal(session.sub, 'alice-subject');
  assert.equal(verified.session(sessionCookie.replace(/.$/, 'x')), null);
  assert.equal(verified.session(''), null);
  verified.revoke(sessionCookie);
  assert.equal(
    verified.session(sessionCookie),
    null,
    'logout invalidates even an unexpired copied cookie',
  );
  assert.match(result.cookies[0], /HttpOnly/);
  assert.match(result.cookies[0], /Secure/);
  assert.match(result.cookies[0], /SameSite=Lax/);
  assert.equal(verified.requireOrigin('https://utomator.example.test'), true);
  assert.equal(verified.requireOrigin('https://other.example.test'), false);
  assert.equal(verified.ownerFromClaims(claims(first.payload.nonce)), result.ownerId);
  assert.notEqual(
    verified.ownerFromClaims(claims(first.payload.nonce, { sub: 'bob-subject' })),
    result.ownerId,
  );
  const rotated = createHostedAuth({
    ...config,
    sessionSecret: 'rotated-session-secret-at-least-32-bytes-1234',
  });
  assert.equal(
    rotated.ownerFromClaims(claims(first.payload.nonce)),
    result.ownerId,
    'rotating cookie keys must not orphan existing tenant records',
  );
});

test('OIDC callback rejects altered state, missing cookie, expired nonce or incorrect signature', async () => {
  const auth = create({ nonce: 'incorrect' });
  const started = await flow(auth);
  await assert.rejects(auth.callback({ state: 'changed', code: 'code' }, started.cookie), /state/);
  await assert.rejects(auth.callback({ state: started.payload.state, code: 'code' }, ''), /state/);
  await assert.rejects(
    auth.callback({ state: started.payload.state, code: 'code' }, started.cookie),
    /claims/,
  );
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
  for (const mismatch of cases)
    await assert.rejects(auth.verifyIdToken(signed(claims(nonce, mismatch)), nonce));
  await assert.rejects(auth.verifyIdToken('eyJhbGciOiJub25lIn0.eyJzdWIiOiJ4In0.', nonce));
  const token = signed(claims(nonce));
  await assert.rejects(auth.verifyIdToken(`${token.slice(0, -2)}xx`, nonce), /signature/);
  assert.equal((await auth.verifyIdToken(token, nonce)).sub, 'alice-subject');
});

test('hosted authentication validates deployment configuration before serving traffic', () => {
  assert.throws(() => createHostedAuth({ ...config, sessionSecret: 'short' }), /32/);
  assert.throws(() => createHostedAuth({ ...config, issuer: 'http://localhost:9000' }), /HTTPS/);
  assert.throws(
    () => createHostedAuth({ ...config, redirectUri: 'http://localhost:3200/auth/callback' }),
    /HTTPS/,
  );
});
