import { randomUUID } from 'node:crypto';
import { appendFile, rm, writeFile } from 'node:fs/promises';
import Fastify from 'fastify';
import { afterEach, expect, test, vi } from 'vitest';
import type { RunSummary, StreamEvent } from '../../src/domain/types.js';
import { RunArchive } from '../../src/infrastructure/runs/run-archive.js';
import { Runner } from '../../src/infrastructure/runs/runner.js';
import { runtimePath } from '../../src/infrastructure/runtime/paths.js';
import { registerRunRoutes } from '../../src/interface/http/runs.js';

const owner = '11111111-1111-4111-8111-111111111111';
const paths: string[] = [];
const apps: ReturnType<typeof Fastify>[] = [];
const controllers: AbortController[] = [];

async function fixture(count: number, metadata: Partial<RunSummary> = {}) {
  const id = randomUUID();
  new RunArchive().save(
    {
      id,
      ownerId: owner,
      platform: 'x',
      action: 'audit',
      state: 'completed',
      createdAt: new Date().toISOString(),
      ...metadata,
    },
    [],
  );
  const path = runtimePath('runs', id + '.jsonl');
  paths.push(path, runtimePath('runs', id));
  const events: StreamEvent[] = Array.from({ length: count }, (_, index) => ({
    id: index + 1,
    runId: id,
    time: new Date().toISOString(),
    kind: 'audit',
    message: 'Persisted observation ' + (index + 1),
  }));
  await writeFile(path, events.map((event) => JSON.stringify(event) + '\n').join(''));
  const runner = new Runner();
  const app = Fastify();
  registerRunRoutes(app, runner, {} as Parameters<typeof registerRunRoutes>[2], owner);
  apps.push(app);
  return { id, path, events, runner, app };
}

async function stream(
  app: ReturnType<typeof Fastify>,
  path: string,
  count: number,
  headers?: Record<string, string>,
) {
  if (!app.server.listening) await app.listen({ host: '127.0.0.1', port: 0 });
  const address = app.server.address();
  if (!address || typeof address === 'string') throw Error('TCP address required');
  const controller = new AbortController();
  controllers.push(controller);
  const response = await fetch(`http://127.0.0.1:${address.port}${path}`, {
    headers,
    signal: AbortSignal.any([controller.signal, AbortSignal.timeout(5000)]),
  });
  expect(response.status).toBe(200);
  if (!response.body) throw Error('SSE response body required');
  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let text = '';
  try {
    while (text.split('\n\n').filter((frame) => frame.startsWith('id:')).length < count) {
      const next = await reader.read();
      if (next.done) break;
      text += decoder.decode(next.value, { stream: true });
    }
    return text.split('\n\n').flatMap((frame) => {
      const line = frame.split('\n').find((value) => value.startsWith('data: '));
      return line ? [JSON.parse(line.slice(6)) as StreamEvent] : [];
    });
  } finally {
    await reader.cancel();
    controller.abort();
  }
}

afterEach(async () => {
  for (const controller of controllers.splice(0)) controller.abort();
  vi.restoreAllMocks();
  await Promise.all(apps.splice(0).map((app) => app.close()));
  await Promise.all(paths.splice(0).map((path) => rm(path, { recursive: true, force: true })));
});

test('a fresh Runner streams the complete persisted journal beyond the memory window', async () => {
  const { app, id, runner } = await fixture(1007);
  expect(runner.events.getSince(0, id)).toEqual([]);
  const events = await stream(app, `/events/${id}`, 1007);
  expect(events).toHaveLength(1007);
  expect(events.map((event) => event.id)).toEqual(Array.from({ length: 1007 }, (_, index) => index + 1));
});

test('reconnect honors Last-Event-ID after a restart and returns no earlier records', async () => {
  const { app, id } = await fixture(1007);
  const events = await stream(app, `/events/${id}?since=1`, 4, { 'last-event-id': '1003' });
  expect(events.map((event) => event.id)).toEqual([1004, 1005, 1006, 1007]);
});

test.each(['-1', '1.5', '1e3', 'NaN', '9007199254740992', '01'])(
  'rejects invalid SSE cursor %s before opening a stream',
  async (since) => {
    const { app, id } = await fixture(1);
    expect((await app.inject(`/events/${id}?since=${since}`)).statusCode).toBe(400);
  },
);

test('logs retain complete cursor paging and paging headers after restart', async () => {
  const { app, id } = await fixture(1007);
  const first = await app.inject(`/runs/${id}/logs?since=0`);
  expect(first.statusCode).toBe(200);
  expect(first.json()).toHaveLength(1000);
  expect(first.headers['x-run-journal-has-more']).toBe('true');
  const second = await app.inject(`/runs/${id}/logs?since=1000`);
  expect(second.json().map((event: StreamEvent) => event.id)).toEqual([
    1001, 1002, 1003, 1004, 1005, 1006, 1007,
  ]);
  expect(second.headers['x-run-journal-has-more']).toBe('false');
});

test('corrupt persisted history fails closed before any SSE response', async () => {
  const { app, id, path, events } = await fixture(2);
  await appendFile(path, JSON.stringify({ ...events[0], message: 'Conflicting old event' }) + '\n');
  expect((await app.inject(`/events/${id}`)).statusCode).toBe(409);
  expect((await app.inject(`/runs/${id}/logs?since=0`)).statusCode).toBe(409);
});

test('a terminal record that conflicts with the saved summary returns a history error', async () => {
  const { app, id } = await fixture(2, {
    terminalEventId: 2,
    cleanupComplete: true,
    historyIncomplete: false,
  });
  expect((await app.inject(`/events/${id}`)).statusCode).toBe(409);
  expect((await app.inject(`/runs/${id}/logs?since=0`)).statusCode).toBe(409);
});

test('durable events arriving during replay are ordered and deduplicated', async () => {
  const { app, id, path, runner } = await fixture(2);
  const first = runner.events.allocate({
    runId: id,
    kind: 'audit',
    message: 'First observation',
    details: { title: 'Observed', optional: undefined },
  });
  const second = runner.events.allocate({ runId: id, kind: 'audit', message: 'Second observation' });
  await writeFile(path, `${JSON.stringify(first)}\n${JSON.stringify(second)}\n`);
  const read = runner.journalPage.bind(runner);
  let injected = false;
  vi.spyOn(runner, 'journalPage').mockImplementation(async (...args) => {
    const page = await read(...args);
    if (!injected) {
      injected = true;
      const third = runner.events.allocate({
        runId: id,
        kind: 'audit',
        message: 'Committed during replay',
      });
      await appendFile(path, `${JSON.stringify(third)}\n`);
      runner.events.broadcast(first);
      runner.events.broadcast(second);
      runner.events.broadcast(third);
      runner.events.publish({ runId: randomUUID(), kind: 'audit', message: 'A different run' });
    }
    return page;
  });
  expect((await stream(app, `/events/${id}`, 3)).map((event) => event.id)).toEqual([1, 2, 3]);
});

test('a replay/live identity conflict fails closed and releases its subscription', async () => {
  const { app, id, runner } = await fixture(2);
  const subscribe = runner.events.subscribe.bind(runner.events);
  let subscriptions = 0;
  vi.spyOn(runner.events, 'subscribe').mockImplementation((listener) => {
    subscriptions++;
    const stop = subscribe(listener);
    return () => {
      subscriptions--;
      stop();
    };
  });
  const read = runner.journalPage.bind(runner);
  vi.spyOn(runner, 'journalPage').mockImplementation(async (...args) => {
    const page = await read(...args);
    runner.events.publish({ runId: id, kind: 'audit', message: 'Conflicting identity' });
    return page;
  });
  const response = await app.inject(`/events/${id}`);
  expect(response.statusCode).toBe(409);
  expect(subscriptions).toBe(0);
});

test('disconnecting while disk replay is pending releases the event subscription', async () => {
  const { app, id, runner } = await fixture(2);
  const subscribe = runner.events.subscribe.bind(runner.events);
  let subscriptions = 0;
  vi.spyOn(runner.events, 'subscribe').mockImplementation((listener) => {
    subscriptions++;
    const stop = subscribe(listener);
    return () => {
      subscriptions--;
      stop();
    };
  });
  let release: (() => void) | undefined;
  const pending = new Promise<void>((resolve) => {
    release = resolve;
  });
  const read = runner.journalPage.bind(runner);
  vi.spyOn(runner, 'journalPage').mockImplementation(async (...args) => {
    await pending;
    return read(...args);
  });
  const origin = await app.listen({ host: '127.0.0.1', port: 0 });
  const controller = new AbortController();
  controllers.push(controller);
  const request = fetch(`${origin}/events/${id}`, { signal: controller.signal }).catch(() => null);
  try {
    await vi.waitFor(() => expect(subscriptions).toBe(1));
    controller.abort();
    await request;
    await vi.waitFor(() => expect(subscriptions).toBe(0));
  } finally {
    release?.();
  }
});
