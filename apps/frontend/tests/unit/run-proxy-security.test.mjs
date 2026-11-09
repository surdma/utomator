import { afterEach, expect, test, vi } from 'vitest';
import { GET, PATCH } from '../../app/api/[...path]/route.ts';

afterEach(() => vi.unstubAllGlobals());
const runId = '11111111-1111-4111-8111-111111111111';
const call = (handler, method, path, headers = {}) =>
  handler(
    new Request(`http://127.0.0.1:3000/api/${path}`, {
      method,
      headers: { host: '127.0.0.1:3000', ...headers },
      ...(method === 'PATCH' ? { body: JSON.stringify({ markers: [] }) } : {}),
    }),
    { params: Promise.resolve({ path: path.split('/') }) },
  );

test.each([undefined, 'http://attacker.example', 'http://127.0.0.1:4000'])(
  'PATCH rejects a missing or foreign browser origin before forwarding',
  async (origin) => {
    let forwarded = false;
    vi.stubGlobal('fetch', async () => {
      forwarded = true;
      return Response.json({ ok: true });
    });
    const response = await call(
      PATCH,
      'PATCH',
      `mator/attachments/${runId}/markers`,
      origin ? { origin } : {},
    );
    expect(response.status).toBe(403);
    expect(forwarded).toBe(false);
  },
);

test('same-origin PATCH still forwards the real marker update', async () => {
  let received;
  vi.stubGlobal('fetch', async (url, options) => {
    received = { url, options };
    return Response.json({ markers: [] });
  });
  const response = await call(
    PATCH,
    'PATCH',
    `mator/attachments/${runId}/markers`,
    { origin: 'http://127.0.0.1:3000' },
  );
  expect(response.status).toBe(200);
  expect(received.options.method).toBe('PATCH');
  expect(JSON.parse(received.options.body)).toEqual({ markers: [] });
});

test.each([`runs/${runId}/workflow.yaml`, `runs/${runId}/steps/baseline.yaml`])(
  'owner-authorized YAML snapshot route %s passes through the local proxy',
  async (path) => {
    vi.stubGlobal(
      'fetch',
      async (url) =>
        new Response(`snapshot for ${new URL(url).pathname}`, {
          headers: { 'content-type': 'text/yaml' },
        }),
    );
    const result = await call(GET, 'GET', path);
    expect(result.status).toBe(200);
    expect(await result.text()).toBe(`snapshot for /${path}`);
  },
);

test('SSE reconnect forwards its last durable event cursor', async () => {
  let headers;
  vi.stubGlobal('fetch', async (_url, options) => {
    headers = options.headers;
    return new Response('', {
      headers: { 'content-type': 'text/event-stream' },
    });
  });
  const response = await call(GET, 'GET', `events/${runId}`, {
    'last-event-id': '1234',
  });
  expect(response.status).toBe(200);
  expect(headers['last-event-id']).toBe('1234');
});
