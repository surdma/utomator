import { test } from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';

// Import after setting NODE_ENV so the module never starts a real listening socket.
process.env.NODE_ENV = 'test';
const { buildApp } = await import('../src/main.js');

test('Fastify serves the API and source-backed playbook', async () => {
  const app = buildApp();
  try {
    await app.ready();
    const health = await app.inject('/health');
    assert.equal(health.statusCode, 200);
    assert.equal(health.json().status, 'ok');
    const source = await app.inject('/playbook');
    assert.equal(source.statusCode, 200);
    assert.ok(source.json().coverage.length > 10);
    assert.equal(source.json().recommended.headline, null);
    assert.equal(source.json().recommended.about, null);
    assert.ok(!source.json().artifacts.rootSnapshots.includes('pnpm-workspace.yaml'),
      'workspace configuration must not be presented as browser evidence');
    const oldDashboard = await app.inject('/');
    assert.equal(oldDashboard.statusCode, 404);
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

test('live local requests on an ephemeral port pass origin guard while foreign origins fail', async () => {
  const app = buildApp();
  try {
    await app.listen({ host: '127.0.0.1', port: 0 });
    const address = app.server.address();
    assert.ok(address && typeof address !== 'string');
    const url = `http://127.0.0.1:${address.port}/runs`;
    const body = JSON.stringify({ platform: 'x', action: 'audit' });
    const accepted = await fetch(url, {
      method: 'POST',
      headers: { origin: `http://127.0.0.1:${address.port}`, 'content-type': 'application/json' },
      body,
    });
    assert.equal(accepted.status, 400, 'same-port local origin must reach payload validation');
    const blocked = await fetch(url, {
      method: 'POST',
      headers: { origin: 'https://attacker.test', 'content-type': 'application/json' },
      body,
    });
    assert.equal(blocked.status, 403, 'foreign origins must remain blocked');
  } finally { await app.close(); }
});

test('Fastify converts profile handles and refuses malformed handles', async () => {
  const app = buildApp();
  try {
    await app.ready();
    const invalid = await app.inject({method:'POST',url:'/runs',payload:{
      platform:'x',action:'audit',handle:'../someone',
    }});
    assert.equal(invalid.statusCode, 400);
    const context = await app.inject('/owner-context');
    assert.equal(context.statusCode, 200);
    assert.deepEqual(context.json().socialAccounts, []);
    assert.equal(context.json().profile.displayName, '');
  } finally {await app.close();}
});

test('Fastify does not return credentials after rejecting an invalid handle', async () => {
  const app = buildApp();
  try {
    await app.ready();
    const redactionSentinel = `redaction-check-${randomUUID()}`;
    const response = await app.inject({ method: 'POST', url: '/runs', payload: {
      platform: 'x', action: 'audit', handle: 'not/a/handle',
      login: { identifier: 'someone@example.test', password: redactionSentinel },
    } });
    assert.equal(response.statusCode, 400);
    assert.equal(response.body.includes(redactionSentinel), false);
  } finally { await app.close(); }
});

test('Screenshot endpoints do not disclose unknown runs or unregistered images', async () => {
  const app = buildApp();
  try {
    await app.ready();
    for (const path of [
      '/runs/00000000-0000-0000-0000-000000000000/evidence/audit-profile.png',
      '/runs/00000000-0000-0000-0000-000000000000/evidence/secret.yml',
      '/runs/00000000-0000-0000-0000-000000000000/evidence/..%2Fsecret.png',
    ]) {
      const response = await app.inject({ method: 'GET', url: path });
      assert.ok([400, 404].includes(response.statusCode), 'Evidence must be inaccessible: ' + path);
    }
  } finally { await app.close(); }
});

test('Visual review uploads real images, rejects unregistered captures, and stores identity notes', async () => {
  const app = buildApp();
  const png = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+/cWQAAAAASUVORK5CYII=';
  const scope = { platform: 'x', handle: 'review_test', pageUrl: 'https://x.com/review_test' };
  const shape = { x: 0.12, y: 0.15, width: 0.35, height: 0.25, label: 'Bio', request: 'Make the wording more specific' };
  try {
    await app.ready();
    const missing = await app.inject({ method: 'POST', url: '/visual-reviews', payload: {
      ...scope, nodeId: 'inspect', note: 'Check live DOM before doing anything', regions: [shape],
      source: { kind: 'capture', runId: '00000000-0000-0000-0000-000000000000', fileName: 'audit-profile.png' },
    } });
    assert.equal(missing.statusCode, 400);
    const wrongPage = await app.inject({ method: 'POST', url: '/visual-reviews', payload: {
      ...scope, pageUrl: 'https://x.com/another_account', nodeId: 'inspect', note: '',
      regions: [shape], source: { kind: 'upload', imageData: 'data:image/png;base64,' + png },
    } });
    assert.equal(wrongPage.statusCode, 400);
    const created = await app.inject({ method: 'POST', url: '/visual-reviews', payload: {
      ...scope, nodeId: 'inspect', note: 'Review this isolated page', regions: [shape],
      source: { kind: 'upload', imageData: 'data:image/png;base64,' + png },
    } });
    assert.equal(created.statusCode, 201, created.body);
    const record = created.json();
    assert.equal(record.regions[0].request, shape.request);
    assert.equal(record.source.kind, 'upload');
    const mark = { id: 'mark-1', shape: 'ellipse', x: 0.2, y: 0.3, width: 0.24, height: 0.15,
      action: 'edit-profile', comment: 'Rewrite this exact section after inspecting the real page' };
    const tagged = await app.inject({ method: 'POST', url: '/visual-reviews', payload: {
      ...scope, nodeId: 'annotation', note: '', annotations: [mark],
      editEvents: [
        { kind: 'draw', annotationId: mark.id, at: new Date().toISOString(), annotation: mark },
        { kind: 'tag', annotationId: 'all', at: new Date().toISOString() },
      ],
      source: { kind: 'review', reviewId: record.id },
    } });
    assert.equal(tagged.statusCode, 201, tagged.body);
    assert.equal(tagged.json().annotations[0].shape, 'ellipse');
    const yaml = await app.inject('/visual-reviews/' + tagged.json().id + '/yaml');
    assert.equal(yaml.statusCode, 200, yaml.body);
    assert.match(yaml.body, /shape: "ellipse"/);
    assert.match(yaml.body, /action: "edit-profile"/);
    assert.match(yaml.body, /browserActionsExecuted: false/);
    assert.match(yaml.body, /kind: "tag"/);
    const reusedImage = await app.inject('/visual-reviews/' + tagged.json().id + '/image');
    assert.equal(reusedImage.statusCode, 200);
    assert.equal(reusedImage.rawPayload.subarray(0,8).toString('hex'), '89504e470d0a1a0a');
    const forged = await app.inject({method:'POST',url:'/visual-reviews',payload: {
      ...scope,nodeId:'annotation',note:'',annotations:[{...mark, action:'click-anywhere'}],
      editEvents:[{kind:'tag',annotationId:'all',at:new Date().toISOString()}],
      source:{kind:'review',reviewId:record.id},
    }});
    assert.equal(forged.statusCode,400,'unknown actions cannot execute from image geometry');
    const foreign = await app.inject({method:'POST',url:'/visual-reviews',payload:{
      ...scope,handle:'another_person',pageUrl:'https://x.com/another_person',nodeId:'annotation',
      note:'',annotations:[mark],editEvents:[{kind:'tag',annotationId:'all',at:new Date().toISOString()}],
      source:{kind:'review',reviewId:record.id},
    }});
    assert.equal(foreign.statusCode,400,'never copy image evidence across account scopes');
    const missingYaml = await app.inject('/visual-reviews/' + record.id + '/yaml');
    assert.equal(missingYaml.statusCode,404,'legacy review has no fabricated annotation YAML');

    assert.equal(JSON.stringify(record).includes('base64'), false, 'return metadata only');
    const served = await app.inject('/visual-reviews/' + record.id + '/image');
    assert.equal(served.statusCode, 200);
    assert.match(String(served.headers['content-type']), /image\/png/);
    assert.equal(served.rawPayload.subarray(0, 8).toString('hex'), '89504e470d0a1a0a');
    const before = await app.inject('/identity-memory');
    assert.equal(before.statusCode, 200);
    const note = await app.inject({ method: 'POST', url: '/identity-memory', payload: {
      ...scope, text: 'Only use verified employment dates.',
    } });
    assert.equal(note.statusCode, 201, note.body);
    const after = await app.inject('/identity-memory');
    assert.equal(after.json().some((item: { id: string }) => item.id === note.json().id), true);
    const invalidRegion = await app.inject({ method: 'POST', url: '/visual-reviews', payload: {
      ...scope, nodeId: 'inspect', note: '', regions: [{ ...shape, x: -0.3 }],
      source: { kind: 'upload', imageData: 'data:image/png;base64,' + png },
    } });
    assert.equal(invalidRegion.statusCode, 400);
  } finally { await app.close(); }
});
