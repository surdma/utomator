import { rm } from 'node:fs/promises';
import { resolve } from 'node:path';
import { expect, test } from 'vitest';

// Import after setting NODE_ENV so the module never starts a real listening socket.
process.env.NODE_ENV = 'test';
const { buildApp } = await import('../src/main.js');

// Ensure each test starts from a clean account store (file persists across runs).
await rm(resolve(process.cwd(), '.runtime', 'account-studio.json'), {
  force: true,
  recursive: false,
}).catch(() => {});

test('Fastify serves the API and source-backed playbook', async () => {
  const app = buildApp();
  try {
    await app.ready();
    const health = await app.inject('/health');
    expect(health.statusCode).toEqual(200);
    expect(health.json().status).toEqual('ok');
    const source = await app.inject('/playbook');
    expect(source.statusCode).toEqual(200);
    expect(source.json().coverage.length > 10).toBeTruthy();
    expect(source.json().recommended.headline).toEqual(null);
    expect(source.json().recommended.about).toEqual(null);
    expect(source.json().artifacts.rootSnapshots.length > 0).toBeTruthy();
    const oldDashboard = await app.inject('/');
    expect(oldDashboard.statusCode).toEqual(404);
  } finally {
    await app.close();
  }
});

test('Fastify rejects unsupported profiles and malformed run payloads', async () => {
  const app = buildApp();
  try {
    await app.ready();
    const malformed = await app.inject({
      method: 'POST',
      url: '/runs',
      payload: { platform: 'x', action: 'audit' },
    });
    expect(malformed.statusCode).toEqual(400);
    const malicious = await app.inject({
      method: 'POST',
      url: '/runs',
      payload: {
        platform: 'x',
        action: 'audit',
        profileUrl: 'https://evil.test/surdma',
      },
    });
    expect(malicious.statusCode).toEqual(400);
    const missing = await app.inject('/events/not-a-run');
    expect(missing.statusCode).toEqual(404);
  } finally {
    await app.close();
  }
});

test('cross-origin state changes are rejected', async () => {
  const app = buildApp();
  try {
    await app.ready();
    const response = await app.inject({
      method: 'POST',
      url: '/runs',
      headers: { origin: 'https://evil.test' },
      payload: {
        platform: 'x',
        action: 'audit',
        profileUrl: 'https://x.com/surdma',
      },
    });
    expect(response.statusCode).toEqual(403);
  } finally {
    await app.close();
  }
});

test('live local requests on an ephemeral port pass origin guard while foreign origins fail', async () => {
  const app = buildApp();
  try {
    await app.listen({ host: '127.0.0.1', port: 0 });
    const address = app.server.address();
    expect(address && typeof address !== 'string').toBeTruthy();
    const url = `http://127.0.0.1:${address.port}/runs`;
    const body = JSON.stringify({ platform: 'x', action: 'audit' });
    const accepted = await fetch(url, {
      method: 'POST',
      headers: {
        origin: `http://127.0.0.1:${address.port}`,
        'content-type': 'application/json',
      },
      body,
    });
    expect(accepted.status).toEqual(400);
    const blocked = await fetch(url, {
      method: 'POST',
      headers: {
        origin: 'https://attacker.test',
        'content-type': 'application/json',
      },
      body,
    });
    expect(blocked.status).toEqual(403);
  } finally {
    await app.close();
  }
});

test('Fastify converts profile handles and refuses malformed handles', async () => {
  const app = buildApp();
  try {
    await app.ready();
    const invalid = await app.inject({
      method: 'POST',
      url: '/runs',
      payload: {
        platform: 'x',
        action: 'audit',
        handle: '../someone',
      },
    });
    expect(invalid.statusCode).toEqual(400);
    const context = await app.inject('/owner-context');
    expect(context.statusCode).toEqual(200);
    expect(context.json().socialAccounts).toEqual([]);
    expect(context.json().profile.displayName).toEqual('');
  } finally {
    await app.close();
  }
});

test('Fastify does not return credentials after rejecting an invalid handle', async () => {
  const app = buildApp();
  try {
    await app.ready();
    const password = 'must-not-appear-in-response-4820';
    const response = await app.inject({
      method: 'POST',
      url: '/runs',
      payload: {
        platform: 'x',
        action: 'audit',
        handle: 'not/a/handle',
        login: { identifier: 'someone@example.test', password },
      },
    });
    expect(response.statusCode).toEqual(400);
    expect(response.body.includes(password)).toEqual(false);
  } finally {
    await app.close();
  }
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
      expect([400, 404].includes(response.statusCode)).toBeTruthy();
    }
  } finally {
    await app.close();
  }
});

test('Visual review uploads real images, rejects unregistered captures, and stores identity notes', async () => {
  const app = buildApp();
  const png =
    'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+/cWQAAAAASUVORK5CYII=';
  const scope = {
    platform: 'x',
    handle: 'review_test',
    pageUrl: 'https://x.com/review_test',
  };
  const shape = {
    x: 0.12,
    y: 0.15,
    width: 0.35,
    height: 0.25,
    label: 'Bio',
    request: 'Make the wording more specific',
  };
  try {
    await app.ready();
    const missing = await app.inject({
      method: 'POST',
      url: '/visual-reviews',
      payload: {
        ...scope,
        nodeId: 'inspect',
        note: 'Check live DOM before doing anything',
        regions: [shape],
        source: {
          kind: 'capture',
          runId: '00000000-0000-0000-0000-000000000000',
          fileName: 'audit-profile.png',
        },
      },
    });
    expect(missing.statusCode).toEqual(400);
    const wrongPage = await app.inject({
      method: 'POST',
      url: '/visual-reviews',
      payload: {
        ...scope,
        pageUrl: 'https://x.com/another_account',
        nodeId: 'inspect',
        note: '',
        regions: [shape],
        source: { kind: 'upload', imageData: `data:image/png;base64,${png}` },
      },
    });
    expect(wrongPage.statusCode).toEqual(400);
    const created = await app.inject({
      method: 'POST',
      url: '/visual-reviews',
      payload: {
        ...scope,
        nodeId: 'inspect',
        note: 'Review this isolated page',
        regions: [shape],
        source: { kind: 'upload', imageData: `data:image/png;base64,${png}` },
      },
    });
    expect(created.statusCode).toEqual(201);
    const record = created.json();
    expect(record.regions[0].request).toEqual(shape.request);
    expect(record.source.kind).toEqual('upload');
    const mark = {
      id: 'mark-1',
      shape: 'ellipse',
      x: 0.2,
      y: 0.3,
      width: 0.24,
      height: 0.15,
      action: 'edit-profile',
      comment: 'Rewrite this exact section after inspecting the real page',
    };
    const tagged = await app.inject({
      method: 'POST',
      url: '/visual-reviews',
      payload: {
        ...scope,
        nodeId: 'annotation',
        note: '',
        annotations: [mark],
        editEvents: [
          {
            kind: 'draw',
            annotationId: mark.id,
            at: new Date().toISOString(),
            annotation: mark,
          },
          { kind: 'tag', annotationId: 'all', at: new Date().toISOString() },
        ],
        source: { kind: 'review', reviewId: record.id },
      },
    });
    expect(tagged.statusCode).toEqual(201);
    expect(tagged.json().annotations[0].shape).toEqual('ellipse');
    const yaml = await app.inject(`/visual-reviews/${tagged.json().id}/yaml`);
    expect(yaml.statusCode).toEqual(200);
    expect(yaml.body).toMatch(/shape: "ellipse"/);
    expect(yaml.body).toMatch(/action: "edit-profile"/);
    expect(yaml.body).toMatch(/browserActionsExecuted: false/);
    expect(yaml.body).toMatch(/kind: "tag"/);
    const reusedImage = await app.inject(`/visual-reviews/${tagged.json().id}/image`);
    expect(reusedImage.statusCode).toEqual(200);
    expect(reusedImage.rawPayload.subarray(0, 8).toString('hex')).toEqual('89504e470d0a1a0a');
    const forged = await app.inject({
      method: 'POST',
      url: '/visual-reviews',
      payload: {
        ...scope,
        nodeId: 'annotation',
        note: '',
        annotations: [{ ...mark, action: 'click-anywhere' }],
        editEvents: [{ kind: 'tag', annotationId: 'all', at: new Date().toISOString() }],
        source: { kind: 'review', reviewId: record.id },
      },
    });
    expect(forged.statusCode).toEqual(400);
    const foreign = await app.inject({
      method: 'POST',
      url: '/visual-reviews',
      payload: {
        ...scope,
        handle: 'another_person',
        pageUrl: 'https://x.com/another_person',
        nodeId: 'annotation',
        note: '',
        annotations: [mark],
        editEvents: [{ kind: 'tag', annotationId: 'all', at: new Date().toISOString() }],
        source: { kind: 'review', reviewId: record.id },
      },
    });
    expect(foreign.statusCode).toEqual(400);
    const missingYaml = await app.inject(`/visual-reviews/${record.id}/yaml`);
    expect(missingYaml.statusCode).toEqual(404);

    expect(JSON.stringify(record).includes('base64')).toEqual(false);
    const served = await app.inject(`/visual-reviews/${record.id}/image`);
    expect(served.statusCode).toEqual(200);
    expect(String(served.headers['content-type'])).toMatch(/image\/png/);
    expect(served.rawPayload.subarray(0, 8).toString('hex')).toEqual('89504e470d0a1a0a');
    const before = await app.inject('/identity-memory');
    expect(before.statusCode).toEqual(200);
    const note = await app.inject({
      method: 'POST',
      url: '/identity-memory',
      payload: {
        ...scope,
        text: 'Only use verified employment dates.',
      },
    });
    expect(note.statusCode).toEqual(201);
    const after = await app.inject('/identity-memory');
    expect(after.json().some((item: { id: string }) => item.id === note.json().id)).toEqual(true);
    const invalidRegion = await app.inject({
      method: 'POST',
      url: '/visual-reviews',
      payload: {
        ...scope,
        nodeId: 'inspect',
        note: '',
        regions: [{ ...shape, x: -0.3 }],
        source: { kind: 'upload', imageData: `data:image/png;base64,${png}` },
      },
    });
    expect(invalidRegion.statusCode).toEqual(400);
  } finally {
    await app.close();
  }
});
