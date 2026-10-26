import { test } from 'node:test';
import assert from 'node:assert/strict';

// Import after setting NODE_ENV so the module never starts a real listening socket.
process.env.NODE_ENV = 'test';
const { buildApp } = await import('../src/main.js');

test('Fastify serves the local dashboard and health status', async () => {
  const app = buildApp();
  try {
    await app.ready();
    const health = await app.inject('/health');
    assert.equal(health.statusCode, 200);
    assert.equal(health.json().status, 'ok');
    const context = await app.inject('/context/surdma');
    assert.equal(context.statusCode, 200);
    assert.equal(context.json().projects.length, 14);
    const home = await app.inject('/');
    assert.equal(home.statusCode, 200);
    assert.match(home.body, /Utomator/);
  } finally { await app.close(); }
});

test('Fastify rejects unsupported profiles and malformed run payloads', async () => {
  const app = buildApp();
  try {
    await app.ready();
    const malformed = await app.inject({ method: 'POST', url: '/runs', payload: { platform: 'x', action: 'audit' } });
    assert.equal(malformed.statusCode, 400);
    const malicious = await app.inject({ method: 'POST', url: '/runs', payload: {
      platform: 'x', action: 'audit', profileUrl: 'https://evil.test/surdma',
    } });
    assert.equal(malicious.statusCode, 400);
    const missing = await app.inject('/events/not-a-run');
    assert.equal(missing.statusCode, 404);
  } finally { await app.close(); }
});

test('cross-origin state changes are rejected', async () => {
  const app = buildApp();
  try {
    await app.ready();
    const response = await app.inject({ method: 'POST', url: '/runs', headers: { origin: 'https://evil.test' }, payload: {
      platform: 'x', action: 'audit', profileUrl: 'https://x.com/surdma',
    } });
    assert.equal(response.statusCode, 403);
  } finally { await app.close(); }
});


test('Fastify accepts handle-only requests and rejects incomplete credential pairs', async () => {
  const app = buildApp();
  try {
    await app.ready();
    const wrong = await app.inject({ method: 'POST', url: '/runs', payload: { platform: 'linkedin', action: 'audit', handle: 'surdma', credentials: { loginId: 'account@example.test' } } });
    assert.equal(wrong.statusCode, 400);
    const invalid = await app.inject({ method: 'POST', url: '/runs', payload: { platform: 'x', action: 'audit', handle: 'wrong/account' } });
    assert.equal(invalid.statusCode, 400);
  } finally { await app.close(); }
});
