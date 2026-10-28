import {createHash, createHmac, createPublicKey, randomBytes, timingSafeEqual, verify} from 'node:crypto';

const b64 = value => Buffer.from(value).toString('base64url');
const json64 = value => b64(JSON.stringify(value));
const seconds = () => Math.floor(Date.now() / 1000);
const requireText = (value, label) => {
  if (typeof value !== 'string' || !value.trim()) throw Error('Missing ' + label);
  return value.trim();
};
const parseJson = value => {
  try { return JSON.parse(Buffer.from(value, 'base64url').toString('utf8')); }
  catch { return null; }
};
const equal = (left, right) => {
  const a = Buffer.from(left), b = Buffer.from(right);
  return a.length === b.length && timingSafeEqual(a, b);
};
const absoluteHttps = (text, label) => {
  const url = new URL(requireText(text, label));
  if (url.protocol !== 'https:' || url.username || url.password || url.hash || url.search)
    throw Error(label + ' must be an HTTPS URL without credentials or query');
  return url;
};
const requestJson = async (url, init) => {
  const response = await fetch(url, {...init, redirect:'error', signal: AbortSignal.timeout(10000)});
  if (!response.ok) throw Error('Identity provider returned HTTP ' + response.status);
  const text = await response.text();
  if (text.length > 262144) throw Error('Identity provider response too large');
  return JSON.parse(text);
};
const cookiePart = (name, value, maxAge, secure) =>
  name + '=' + encodeURIComponent(value) + '; Path=/; HttpOnly; SameSite=Lax' +
  (secure ? '; Secure' : '') + '; Max-Age=' + maxAge;
const cookies = header => Object.fromEntries(
  (header || '').split(';').map(pair => {
    const index = pair.indexOf('=');
    if (index < 0) return ['', ''];
    try { return [pair.slice(0, index).trim(), decodeURIComponent(pair.slice(index + 1).trim())]; }
    catch { return ['', '']; }
  }).filter(([name]) => name)
);

/** OIDC Authorization Code + PKCE, RS256 ID token verification and signed short-lived sessions. */
export function createHostedAuth(config, io = {requestJson}) {
  const issuer = absoluteHttps(config.issuer, 'OIDC_ISSUER').href.replace(/\/$/, '');
  const redirectUrl=absoluteHttps(config.redirectUri, 'OIDC_REDIRECT_URI');
  if(redirectUrl.pathname!=='/auth/callback')throw Error('OIDC redirect path must be /auth/callback');
  const redirect=redirectUrl.href;
  const audience = requireText(config.clientId, 'OIDC_CLIENT_ID');
  const secret = Buffer.from(requireText(config.sessionSecret, 'HOSTED_SESSION_SECRET'), 'utf8');
  if (secret.byteLength < 32) throw Error('HOSTED_SESSION_SECRET must be at least 32 UTF-8 bytes');
  const ownerKey=Buffer.from(requireText(config.ownerKey,'HOSTED_OWNER_KEY'),'utf8');
  if(ownerKey.byteLength < 32)throw Error('HOSTED_OWNER_KEY must be at least 32 UTF-8 bytes');
  const origin = new URL(redirect).origin;
  const secure = true;
  const cookieSession = '__Host-utomator_session';
  const cookieFlow = '__Host-utomator_oidc_state';
  const lifetime = 8 * 60 * 60;
  // A signed cookie alone cannot be logged out; keep a fail-closed server allowlist.
  // Restarting this single-node gateway intentionally invalidates all sessions.
  const activeSessions=new Map();
  let metadata;
  let keys;
  let keysUntil = 0;

  const sign = data => {
    const body = json64(data);
    return body + '.' + createHmac('sha256', secret).update(body).digest('base64url');
  };
  const decodeSigned = token => {
    if (typeof token !== 'string' || token.length > 8192) return null;
    const pieces = token.split('.');
    if (pieces.length !== 2 || !pieces[0] || !pieces[1]) return null;
    const expected = createHmac('sha256', secret).update(pieces[0]).digest('base64url');
    if (!equal(pieces[1], expected)) return null;
    const value = parseJson(pieces[0]);
    return value && typeof value === 'object' && !Array.isArray(value) ? value : null;
  };

  const discovery = async () => {
    if (metadata) return metadata;
    const found = await io.requestJson(issuer + '/.well-known/openid-configuration');
    if (found.issuer !== issuer) throw Error('OIDC discovery issuer mismatch');
    for (const key of ['authorization_endpoint', 'token_endpoint', 'jwks_uri']) {
      absoluteHttps(found[key], 'OIDC ' + key);
    }
    metadata = found;
    return metadata;
  };
  const jwks = async () => {
    if (keys && keysUntil > Date.now()) return keys;
    const document = await io.requestJson((await discovery()).jwks_uri);
    if (!Array.isArray(document.keys) || document.keys.length > 64) throw Error('Invalid OIDC JWKS');
    keys = document.keys;
    keysUntil = Date.now() + 5 * 60 * 1000;
    return keys;
  };
  const verifyIdToken = async (token, nonce) => {
    if (typeof token !== 'string' || token.length > 16000) throw Error('Missing signed ID token');
    const pieces = token.split('.');
    if (pieces.length !== 3) throw Error('Malformed ID token');
    const header = parseJson(pieces[0]), claims = parseJson(pieces[1]);
    if (!header || header.alg !== 'RS256' || typeof header.kid !== 'string' || !claims)
      throw Error('Unsupported ID token signing algorithm or header');
    const key = (await jwks()).find(item =>
      item.kid === header.kid && item.kty === 'RSA' &&
      (!item.use || item.use === 'sig') && (!item.alg || item.alg === 'RS256'));
    if (!key) throw Error('OIDC signing key not found');
    let publicKey;
    try { publicKey = createPublicKey({key, format: 'jwk'}); }
    catch { throw Error('Invalid OIDC public key'); }
    const verified = verify('RSA-SHA256', Buffer.from(pieces[0] + '.' + pieces[1]),
      publicKey, Buffer.from(pieces[2], 'base64url'));
    if (!verified) throw Error('ID token signature invalid');
    const now = seconds();
    if (claims.iss !== issuer || !(claims.aud === audience ||
      (Array.isArray(claims.aud) && claims.aud.includes(audience)))) throw Error('ID token audience or issuer invalid');
    if (claims.azp !== undefined && claims.azp !== audience)
      throw Error('ID token authorized party invalid');
    if (Array.isArray(claims.aud) && claims.aud.length > 1 && claims.azp !== audience)
      throw Error('ID token authorized party invalid');
    if (typeof claims.sub !== 'string' || !claims.sub || claims.sub.length > 256 ||
      typeof claims.nonce !== 'string' || !equal(claims.nonce, nonce) ||
      !Number.isSafeInteger(claims.exp) || claims.exp <= now ||
      !Number.isSafeInteger(claims.iat) || claims.iat > now + 60 ||
      (claims.nbf !== undefined && (!Number.isSafeInteger(claims.nbf) || claims.nbf > now + 60)))
      throw Error('ID token claims invalid or expired');
    return claims;
  };
  const ownerFromClaims = claims => {
    // Stable opaque tenant UUID. Never take this value from a client-controlled header.
    const digest = createHmac('sha256', ownerKey).update('utomator:owner:' + claims.iss + '\0' + claims.sub).digest();
    const bytes = Buffer.from(digest.subarray(0, 16));
    bytes[6] = (bytes[6] & 0x0f) | 0x40;
    bytes[8] = (bytes[8] & 0x3f) | 0x80;
    const hex = bytes.toString('hex');
    return [hex.slice(0,8),hex.slice(8,12),hex.slice(12,16),hex.slice(16,20),hex.slice(20)].join('-');
  };
  const begin = async () => {
    const config = await discovery();
    const state = b64(randomBytes(32));
    const nonce = b64(randomBytes(32));
    const verifier = b64(randomBytes(48));
    const challenge = createHash('sha256').update(verifier).digest('base64url');
    const url = new URL(config.authorization_endpoint);
    for (const [key, value] of Object.entries({
      response_type: 'code',client_id: audience,redirect_uri: redirect,
      scope: 'openid profile email',state,nonce,code_challenge: challenge,
      code_challenge_method: 'S256',
    })) url.searchParams.set(key,value);
    return {url: url.href, cookie: cookiePart(cookieFlow,
      sign({state,nonce,verifier,exp:seconds()+600}),600,secure)};
  };
  const callback = async (query, cookieHeader) => {
    const flow = decodeSigned(cookies(cookieHeader)[cookieFlow]);
    if (!flow || !Number.isSafeInteger(flow.exp) || flow.exp <= seconds() ||
      typeof query.state !== 'string' || !equal(query.state,flow.state) ||
      typeof query.code !== 'string' || !query.code || query.code.length > 4096)
      throw Error('OIDC callback state invalid or expired');
    const form = new URLSearchParams({
      grant_type:'authorization_code',code:query.code,redirect_uri:redirect,
      client_id:audience,code_verifier:flow.verifier,
    });
    if (config.clientSecret) form.set('client_secret',config.clientSecret);
    const result = await io.requestJson((await discovery()).token_endpoint,{
      method:'POST',headers:{'content-type':'application/x-www-form-urlencoded'},
      body:form.toString(),
    });
    const claims = await verifyIdToken(result.id_token,flow.nonce);
    const ownerId = ownerFromClaims(claims);
    const expiry = Math.min(seconds() + lifetime, claims.exp);
    for(const [id,expires] of activeSessions)if(expires<=seconds())activeSessions.delete(id);
    if(activeSessions.size>=20000)throw Error('Hosted session capacity reached');
    const sessionId=b64(randomBytes(32));
    activeSessions.set(sessionId,expiry);
    return {ownerId,cookies:[
      cookiePart(cookieSession,sign({ownerId,exp:expiry,iss:claims.iss,sub:claims.sub,sessionId}),expiry-seconds(),secure),
      cookiePart(cookieFlow,'',0,secure),
    ]};
  };
  const session = header => {
    const payload = decodeSigned(cookies(header)[cookieSession]);
    if (!payload || !Number.isSafeInteger(payload.exp) || payload.exp <= seconds() ||
      payload.iss !== issuer || typeof payload.sub !== 'string' || !payload.sub ||
      activeSessions.get(payload.sessionId)!==payload.exp ||
      payload.ownerId !== ownerFromClaims(payload)) return null;
    return {ownerId:payload.ownerId,sub:payload.sub,expiresAt:payload.exp};
  };
  const revoke=header=>{
    const sessionToken=decodeSigned(cookies(header)[cookieSession]);
    if(sessionToken && typeof sessionToken.sessionId==='string')
      activeSessions.delete(sessionToken.sessionId);
  };
  const logoutCookie = () => cookiePart(cookieSession,'',0,secure);
  const requireOrigin = header => header === origin;
  return {begin,callback,session,revoke,logoutCookie,requireOrigin,verifyIdToken,ownerFromClaims,origin,discovery};
}
