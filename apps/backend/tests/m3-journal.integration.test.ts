import { type ChildProcess, spawn } from 'node:child_process';
import { once } from 'node:events';
import { mkdir, mkdtemp, readFile, writeFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { createServer } from 'node:net';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { type BrowserContext, chromium, type Locator, type Page } from 'playwright';
import { expect, test } from 'vitest';
import type { RunSummary, StreamEvent } from '../src/domain/types.js';
import type { ProfileGrowthCoordinator } from '../src/infrastructure/growth/profile-growth-coordinator.js';
import { removeTemp } from './support/remove-temp.js';

type GrowthRun = NonNullable<Awaited<ReturnType<ProfileGrowthCoordinator['get']>>>;
const frontendRoot = fileURLToPath(new URL('../../frontend/', import.meta.url));
const evidenceRoot = fileURLToPath(new URL('../.runtime/m3-acceptance/', import.meta.url));
const testRequire = createRequire(import.meta.url);
const wait = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

function required<T>(value: T | null | undefined, label: string): T {
  if (value === null || value === undefined) throw Error(`Missing ${label}`);
  return value;
}

async function textOf(locator: Locator) {
  return (await locator.textContent()) ?? '';
}

async function unusedPort() {
  const server = createServer();
  server.listen(0, '127.0.0.1');
  await once(server, 'listening');
  const address = server.address();
  if (!address || typeof address === 'string') throw Error('No loopback test port');
  await new Promise<void>((resolve, reject) =>
    server.close((error) => (error ? reject(error) : resolve())),
  );
  return address.port;
}

async function until<T>(
  read: () => Promise<T>,
  accept: (value: T) => boolean,
  label: string,
  timeout = 30_000,
) {
  const deadline = Date.now() + timeout;
  let last: unknown;
  while (Date.now() < deadline) {
    try {
      const value = await read();
      if (accept(value)) return value;
      last = value;
    } catch (error) {
      last = String(error);
    }
    await wait(150);
  }
  throw Error(`Timed out waiting for ${label}: ${JSON.stringify(last)}`);
}

async function stop(child: ChildProcess | undefined) {
  if (!child || child.exitCode !== null || child.signalCode !== null) return;
  const exited = once(child, 'exit');
  child.kill('SIGTERM');
  const forced = setTimeout(() => child.kill('SIGKILL'), 5_000);
  try {
    await exited;
  } finally {
    clearTimeout(forced);
  }
}

function start(args: string[], cwd: string, env: NodeJS.ProcessEnv, logs: string[]) {
  const child = spawn(process.execPath, args, { cwd, env, stdio: ['ignore', 'pipe', 'pipe'] });
  child.stdout?.on('data', (chunk) => logs.push(String(chunk)));
  child.stderr?.on('data', (chunk) => logs.push(String(chunk)));
  child.on('error', (error) => logs.push(String(error)));
  return child;
}

async function clickUntilVisible(page: Page, trigger: Locator, target: Locator) {
  await until(
    async () => {
      if (await target.isVisible()) return true;
      await trigger.click({ timeout: 1_000 }).catch(() => undefined);
      await page.waitForTimeout(150);
      return target.isVisible();
    },
    Boolean,
    'hydrated workflow dialog',
  );
}

async function openGrowth(page: Page) {
  const library = page.getByRole('dialog', { name: 'Workflow library' });
  await clickUntilVisible(
    page,
    page.getByRole('button', { name: /^(Browse templates|Choose workflow template)$/ }),
    library,
  );
  await library.getByRole('searchbox', { name: 'Search workflows' }).fill('Profile auditing');
  await library.getByTestId('growth-template-option').click();
  await library.getByRole('button', { name: 'Open YAML workflow' }).click();
  await library.waitFor({ state: 'hidden' });
  await page.getByTestId('growth-pipeline-node-identity').waitFor();
}

async function readSse(url: string, since: number, count: number) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 15_000);
  const events: StreamEvent[] = [];
  try {
    const response = await fetch(url, {
      headers: { 'Last-Event-ID': String(since) },
      signal: controller.signal,
    });
    expect(response.status).toBe(200);
    const reader = response.body?.getReader();
    if (!reader) throw Error('Missing event stream body');
    const decoder = new TextDecoder();
    let buffered = '';
    while (events.length < count) {
      const next = await reader.read();
      if (next.done) break;
      buffered += decoder.decode(next.value, { stream: true }).replaceAll('\r\n', '\n');
      let end = buffered.indexOf('\n\n');
      while (end >= 0) {
        const frame = buffered.slice(0, end);
        buffered = buffered.slice(end + 2);
        const data = frame.split('\n').find((line) => line.startsWith('data: '));
        if (data) events.push(JSON.parse(data.slice(6)) as StreamEvent);
        end = buffered.indexOf('\n\n');
      }
    }
    await reader.cancel();
    return events;
  } finally {
    clearTimeout(timeout);
    controller.abort();
  }
}

test('M3 real Runner, Fastify and Next preserve journal truth across approval, cleanup, restart and UI navigation', {
  timeout: 240_000,
}, async () => {
  const root = await mkdtemp(join(tmpdir(), 'utomator-m3-'));
  const backendLogs: string[] = [];
  const frontendLogs: string[] = [];
  const browserErrors: string[] = [];
  let backend: ChildProcess | undefined;
  let frontend: ChildProcess | undefined;
  let browser: BrowserContext | undefined;
  let page: Page | undefined;
  await mkdir(evidenceRoot, { recursive: true });
  const startedAt = new Date().toISOString();
  await writeFile(
    join(evidenceRoot, 'acceptance.json'),
    JSON.stringify({ status: 'running', startedAt }),
  );
  try {
    const [backendPort, frontendPort] = await Promise.all([unusedPort(), unusedPort()]);
    const origin = `http://127.0.0.1:${frontendPort}`;
    const chromeRoot = join(root, 'chrome');
    browser = await chromium.launchPersistentContext(chromeRoot, {
      headless: true,
      viewport: { width: 1440, height: 1000 },
      args: ['--remote-debugging-port=0'],
      ...(process.env.M3_BROWSER_EXECUTABLE
        ? { executablePath: process.env.M3_BROWSER_EXECUTABLE }
        : {}),
    });
    await browser.tracing.start({ screenshots: true, snapshots: true, sources: true });
    // Only the provider is a fixture. BrowserSession, Runner, disk, HTTP and the UI are real.
    await browser.route('https://www.linkedin.com/**', async (route) => {
      await route.fulfill({
        contentType: 'text/html',
        body: `<!doctype html><html><head><title>M3 controlled profile</title></head><body>
          <nav><a data-control-name="identity_profile_photo" href="/in/m3-owner/">M3 Owner</a></nav>
          <main><h1>M3 Owner</h1><button aria-label="Edit intro">Edit intro</button>
          <div class="text-body-medium-breakwords">Controlled profile evidence for journal acceptance</div>
          <section><h2>Experience</h2><p>Software engineering and education.</p></section>
          <section><h2>Skills</h2><p>Testing, documentation, reliable systems.</p></section>
          <section><h2>Projects</h2><p>A deterministic read-only audit fixture.</p></section>
          <section><h2>Featured</h2><p>Fixture content, not a live provider result.</p></section></main></body></html>`,
      });
    });
    const chromePort = await until(
      async () =>
        Number((await readFile(join(chromeRoot, 'DevToolsActivePort'), 'utf8')).split(/\r?\n/)[0]),
      (port) => Number.isInteger(port) && port > 0,
      'Chrome CDP port',
    );
    const env: NodeJS.ProcessEnv = { ...process.env };
    for (const key of [
      'DATABASE_URL',
      'UTOMATOR_INTERNAL_OWNER_ID',
      'UTOMATOR_INTERNAL_TOKEN',
      'UTOMATOR_DISABLE_CDP',
    ])
      delete env[key];
    Object.assign(env, {
      NODE_ENV: 'test',
      UTOMATOR_TEST_DATABASE: 'true',
      DB_FILE_NAME: `file:${join(root, 'local.db')}`,
      PORT: String(backendPort),
      UTOMATOR_BROWSER_MODE: 'attached',
      CHROME_CDP_URL: `http://127.0.0.1:${chromePort}`,
    });
    const backendArgs = [
      '--import',
      pathToFileURL(testRequire.resolve('tsx')).href,
      fileURLToPath(new URL('./support/m3-server.mjs', import.meta.url)),
    ];
    const launchBackend = async () => {
      backend = start(backendArgs, root, env, backendLogs);
      await until(
        async () => (await fetch(`http://127.0.0.1:${backendPort}/health`)).status,
        (status) => status === 200,
        'Fastify startup',
      );
    };
    await launchBackend();
    frontend = start(
      [
        join(frontendRoot, 'node_modules', 'next', 'dist', 'bin', 'next'),
        'start',
        '-p',
        String(frontendPort),
        '-H',
        '127.0.0.1',
      ],
      frontendRoot,
      { ...env, NODE_ENV: 'production', UTOMATOR_PORT: String(backendPort) },
      frontendLogs,
    );
    await until(
      async () => (await fetch(`${origin}/api/health`)).status,
      (status) => status === 200,
      'Next proxy startup',
    );
    const api = async <T>(path: string, body?: unknown): Promise<T> => {
      const response = await fetch(`${origin}/api${path}`, {
        ...(body === undefined
          ? {}
          : {
              method: 'POST',
              headers: { 'content-type': 'application/json', origin },
              body: JSON.stringify(body),
            }),
      });
      const value: unknown = await response.json();
      if (!response.ok) throw Error(`${path}: ${response.status} ${JSON.stringify(value)}`);
      return value as T;
    };
    expect(await api('/step-forms')).toMatchObject({ start: { fields: expect.any(Array) } });
    const connected = await api<{ accountId: string }>('/connectors/start', { platform: 'linkedin' });
    expect(await api(`/connectors/${connected.accountId}/sync`, {})).toMatchObject({
      status: 'connected',
    });
    const program = await api<{ id: string; stages: Array<{ plan: unknown }> }>(
      '/growth/templates/linkedin-profile',
    );
    const workflow = await api<{ id: string }>('/workflows', { plan: program.stages[0]?.plan });
    await api(`/mator/workflows/${workflow.id}/conversations`, { title: 'M3 first thread' });
    await api(`/mator/workflows/${workflow.id}/conversations`, { title: 'M3 second thread' });
    const catalog = await api<Array<{ id: string; executable: boolean }>>('/growth/templates');
    const design = catalog.find((item) => !item.executable);
    expect(design).toBeDefined();
    const designResponse = await fetch(`${origin}/api/growth/templates/${design?.id}/runs`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', origin },
      body: JSON.stringify({ accountId: connected.accountId }),
    });
    expect(designResponse.status).toBe(409);
    expect(await api<RunSummary[]>('/runs')).toHaveLength(0);

    page = await browser.newPage();
    const ui = page;
    page.on('pageerror', (error) => browserErrors.push(String(error)));
    page.on('console', (message) => {
      if (message.type() === 'error') browserErrors.push(`Console: ${message.text()}`);
    });
    page.on('response', (response) => {
      const url = new URL(response.url());
      if (url.origin === origin && url.pathname.startsWith('/api/') && response.status() >= 500) {
        browserErrors.push(`HTTP ${response.status()}: ${url.pathname}`);
      }
    });
    await page.goto(`${origin}/dashboard/workspace`);
    await openGrowth(page);
    await page.getByRole('button', { name: 'Workflow execution and evidence' }).click();
    const details = page.getByTestId('growth-workspace-details');
    await details.getByRole('button', { name: 'Start Growth workflow' }).click();
    const runsPath = '/growth/templates/linkedin-profile/runs';
    const growth = await until(
      () => api<GrowthRun[]>(runsPath),
      (runs) => runs.length === 1,
      'registered Growth run',
    );
    const growthId = required(growth[0], 'Growth run').id;
    const runPath = `${runsPath}/${growthId}`;
    const awaiting = await until(
      () => api<GrowthRun>(runPath),
      (run) => run.currentChild?.state === 'approval-needed',
      'evidence approval',
      45_000,
    );
    const childId = required(awaiting.currentChild, 'registered child').id;
    await page.keyboard.press('Escape');
    await details.waitFor({ state: 'hidden' });
    const mator = page.getByTestId('mator-pipeline-execution');
    const pipelineSummaries = mator.locator(':scope > div > details > summary');
    await mator.getByRole('button', { name: 'Approve', exact: true }).click();
    await until(
      () => api<RunSummary>(`/runs/${childId}`),
      (run) => run.state === 'paused',
      'reviewed pause',
    );
    await page.getByRole('button', { name: 'Workflow execution and evidence' }).click();
    await page.screenshot({ path: join(evidenceRoot, '01-reviewed-checkpoint.png'), fullPage: true });
    await details.getByRole('button', { name: 'Resume reviewed Runner stage' }).click();
    await page.keyboard.press('Escape');
    const finished = await until(
      () => api<RunSummary>(`/runs/${childId}`),
      (run) => ['completed', 'failed', 'blocked', 'cancelled'].includes(run.state),
      'durable terminal state',
      60_000,
    );
    expect(finished).toMatchObject({
      state: 'completed',
      cleanupComplete: true,
      ownerId: 'local-owner',
    });
    expect(finished.historyIncomplete).not.toBe(true);
    expect(finished.terminalEventId).toBeTypeOf('number');

    const events: StreamEvent[] = [];
    let cursor = 0;
    for (;;) {
      const response = await fetch(`${origin}/api/runs/${childId}/logs?since=${cursor}`);
      expect(response.status).toBe(200);
      const batch = (await response.json()) as StreamEvent[];
      expect(batch.every((event) => event.runId === childId && event.id > cursor)).toBe(true);
      events.push(...batch);
      if (response.headers.get('x-run-journal-has-more') !== 'true') break;
      expect(batch.length).toBeGreaterThan(0);
      cursor = required(batch.at(-1), 'next journal cursor').id;
    }
    expect(events.length).toBeGreaterThan(20);
    expect(new Set(events.map((event) => event.id)).size).toBe(events.length);
    expect(
      events.every((event) => JSON.stringify(event.growth) === JSON.stringify(finished.growth)),
    ).toBe(true);
    const terminal = events.find((event) => event.id === finished.terminalEventId);
    expect(terminal?.details).toMatchObject({ terminalState: 'completed', cleanupComplete: true });
    const source = await fetch(`${origin}/api/runs/${childId}/workflow.yaml`);
    expect(source.status).toBe(200);
    expect(await source.text()).toContain('kind:');
    const observation = await api<{ schema: string; stepId: string }>(
      `/runs/${childId}/steps/inspect/output`,
    );
    expect(observation).toMatchObject({ schema: 'page-observation/v1', stepId: 'inspect' });
    const screenshot = events.find((event) => event.kind === 'screenshot');
    const screenshotFile = (screenshot?.details as { fileName?: string })?.fileName;
    expect(screenshotFile).toBeTruthy();
    expect((await fetch(`${origin}/api/runs/${childId}/evidence/${screenshotFile}`)).status).toBe(200);
    const assertViews = async () => {
      await ui.getByTestId('growth-pipeline-node-identity').waitFor({ state: 'visible' });
      await until(
        () => textOf(ui.getByTestId('growth-pipeline-node-identity')),
        (value) => /completed/i.test(value),
        'completed Artboard',
      );
      await until(
        () => textOf(pipelineSummaries.first()),
        (value) => /Completed/.test(value) && /11\/11 recorded/.test(value),
        'matching Mator completion',
      );
      await pipelineSummaries.first().scrollIntoViewIfNeeded();
      expect(await textOf(mator)).not.toContain('Journal unavailable or incomplete');
    };
    await assertViews();
    await page.screenshot({ path: join(evidenceRoot, '02-completed-stage.png'), fullPage: true });
    await page.getByTestId('mator-thread-pill').click();
    await page
      .getByTestId('mator-conversation-switcher')
      .getByRole('button', { name: /M3 first thread/ })
      .click();
    await until(
      () => textOf(ui.getByTestId('mator-thread-pill')),
      (value) => value.includes('M3 first thread'),
      'thread switch',
    );
    await assertViews();
    await page.getByTestId('growth-pipeline-node-identity').click();
    await page.getByTestId('growth-task-node-inspect').click();
    const taskDetails = page.getByTestId('growth-task-details');
    await taskDetails.waitFor();
    expect(await textOf(taskDetails)).toMatch(/completed/i);
    await page.keyboard.press('Escape');

    // Leave the page so all SSE clients disconnect before a genuine process restart.
    await page.goto('about:blank');
    await stop(backend);
    await launchBackend();
    expect(await api<RunSummary>(`/runs/${childId}`)).toEqual(finished);
    const reconnectFrom = required(events[Math.floor(events.length / 2)], 'replay cursor').id;
    const expectedReplay = events.filter((event) => event.id > reconnectFrom);
    const replay = await readSse(
      `${origin}/api/events/${childId}`,
      reconnectFrom,
      expectedReplay.length,
    );
    expect(replay).toEqual(expectedReplay);
    expect((await fetch(`${origin}/api/runs/${childId}/evidence/${screenshotFile}`)).status).toBe(200);
    await page.goto(`${origin}/dashboard/workspace`);
    await openGrowth(page);
    await assertViews();
    await page.reload();
    await openGrowth(page);
    await assertViews();
    await page.goto(`${origin}/dashboard/history`);
    await page.goto(`${origin}/dashboard/workspace`);
    await openGrowth(page);
    await assertViews();
    await page.screenshot({ path: join(evidenceRoot, '03-restarted-and-restored.png'), fullPage: true });

    await page.getByRole('button', { name: 'Workflow execution and evidence' }).click();
    await details.getByRole('button', { name: 'Advance to the next dependent pipeline' }).click();
    const second = await until(
      () => api<GrowthRun>(runPath),
      (run) => run.activeIndex === 1 && run.currentChild?.state === 'approval-needed',
      'second pipeline approval',
      45_000,
    );
    const secondChildId = required(second.currentChild, 'second child').id;
    await details.getByRole('button', { name: 'Cancel active Runner pipeline' }).click();
    const cancelled = await until(
      () => api<RunSummary>(`/runs/${secondChildId}`),
      (run) => run.cleanupComplete === true && run.state === 'cancelled',
      'cancellation and cleanup',
    );
    expect(cancelled.growth?.stageId).toBe('positioning');
    await page.keyboard.press('Escape');
    await ui.getByTestId('growth-pipeline-node-positioning').waitFor({ state: 'visible' });
    await until(
      () => textOf(ui.getByTestId('growth-pipeline-node-positioning')),
      (value) => /cancelled/i.test(value),
      'cancelled Artboard',
    );
    await until(
      () => textOf(pipelineSummaries.nth(1)),
      (value) => /Cancelled/.test(value),
      'cancelled Mator',
    );
    await pipelineSummaries.nth(1).scrollIntoViewIfNeeded();
    await page.screenshot({ path: join(evidenceRoot, '04-cancelled-stage.png'), fullPage: true });
    expect(browserErrors).toEqual([]);
    await writeFile(
      join(evidenceRoot, 'acceptance.json'),
      JSON.stringify(
        {
          status: 'passed',
          startedAt,
          commit: process.env.GITHUB_SHA ?? null,
          scope:
            'Controlled provider fixture; real Runner, Fastify, Next, Chromium and persisted restart',
          growthId,
          childId,
          sourceIdentity: finished.growth,
          terminalEventId: finished.terminalEventId,
          eventCount: events.length,
          replayCount: replay.length,
          cancelledChildId: cancelled.id,
          designOnlyRejected: true,
          browserErrors,
        },
        null,
        2,
      ),
    );
  } catch (error) {
    await writeFile(
      join(evidenceRoot, 'acceptance.json'),
      JSON.stringify(
        {
          status: 'failed',
          startedAt,
          error: String(error),
          browserErrors,
        },
        null,
        2,
      ),
    );
    throw error;
  } finally {
    if (page && !page.isClosed()) {
      await page
        .screenshot({ path: join(evidenceRoot, 'last-page.png'), fullPage: true })
        .catch(() => undefined);
      await page.goto('about:blank').catch(() => undefined);
    }
    await stop(frontend);
    await stop(backend);
    await browser?.tracing.stop({ path: join(evidenceRoot, 'trace.zip') }).catch(() => undefined);
    await browser?.close();
    await writeFile(join(evidenceRoot, 'backend.log'), backendLogs.join(''));
    await writeFile(join(evidenceRoot, 'frontend.log'), frontendLogs.join(''));
    await writeFile(join(evidenceRoot, 'browser-errors.json'), JSON.stringify(browserErrors, null, 2));
    await removeTemp(root);
  }
});
