import test from 'node:test';
import assert from 'node:assert/strict';
import { chromium, type Page } from 'playwright';

process.env.NODE_ENV = 'test';
const [{ buildApp }, { BrowserSession }] = await Promise.all([
  import('../src/main.js'),
  import('../src/browser/session.js'),
]);

async function awaitRun(
  app: ReturnType<typeof buildApp>,
  id: string,
  predicate: (state: string) => boolean,
  timeoutMs = 20000
) {
  const until = Date.now() + timeoutMs;
  while (Date.now() < until) {
    const result = await app.inject('/runs/' + id);
    if (result.statusCode === 200) {
      const run = result.json() as {
        state: string;
        checkpoint?: { id: string; message: string };
      };
      if (predicate(run.state)) return run;
    }
    await new Promise((done) => setTimeout(done, 100));
  }
  throw new Error('Timed out waiting for automation state');
}

test(
  'Delayed authwall holds Chrome open for human login, then resumes audit',
  {
    timeout: 65000,
  },
  async () => {
    const browser = await chromium.launch({ headless: true });
    const app = buildApp();
    const originalOpen = BrowserSession.prototype.open;
    const originalClose = BrowserSession.prototype.close;
    let page: Page | undefined;
    let signedIn = false;
    let closeCalls = 0;
    try {
      const context = await browser.newContext();
      await context.route('https://www.linkedin.com/**', async (route) => {
        const url = new URL(route.request().url());
        if (url.pathname === '/authwall') {
          await route.fulfill({
            contentType: 'text/html',
            body: '<main><h1>Sign in to continue</h1><button onclick="location.href=\'/session-ready\'">Finish manual sign in</button></main>',
          });
          return;
        }
        if (url.pathname === '/session-ready') {
          signedIn = true;
          await route.fulfill({
            contentType: 'text/html',
            body: '<main>Account verified</main>',
          });
          return;
        }
        if (!signedIn) {
          await route.fulfill({
            contentType: 'text/html',
            body: '<main>Redirecting...</main><script>setTimeout(() => location.replace("/authwall"), 75)</script>',
          });
          return;
        }
        await route.fulfill({
          contentType: 'text/html',
          body: '<html><head><title>Authorized owner</title></head><body><main><div class="text-body-medium-breakwords">Verified headline</div></main></body></html>',
        });
      });
      BrowserSession.prototype.open = async () => {
        page = await context.newPage();
        page.setDefaultTimeout(8000);
        return page;
      };
      BrowserSession.prototype.close = async () => {
        closeCalls += 1;
        await page?.close();
      };
      await app.ready();
      const started = await app.inject({
        method: 'POST',
        url: '/runs',
        payload: {
          platform: 'linkedin',
          action: 'audit',
          handle: 'surdma',
        },
      });
      assert.equal(started.statusCode, 202);
      const runId = started.json().id as string;
      const waiting = await awaitRun(
        app,
        runId,
        (state) => state === 'approval-needed' || state === 'failed',
        12000
      );
      assert.equal(
        waiting.state,
        'approval-needed',
        'a late login redirect must pause instead of failing'
      );
      assert.match(waiting.checkpoint?.message || '', /Sign in.+Chrome/);
      assert(page);
      assert.equal(
        page.isClosed(),
        false,
        'Chrome stays open for a human sign-in'
      );
      await new Promise((done) => setTimeout(done, 350));
      assert.equal(
        page.isClosed(),
        false,
        'browser must remain open while approval is pending'
      );
      const artifacts = app.inject('/runs/' + runId + '/assessment');
      // No login-screen screenshots may be emitted before authentication completes.
      const assessment = await artifacts;
      assert.equal(assessment.json().observations, 0);
      await page.getByRole('button', { name: 'Finish manual sign in' }).click();
      await page.waitForURL('https://www.linkedin.com/session-ready');
      const approval = await app.inject({
        method: 'POST',
        url: '/runs/' + runId + '/decision',
        payload: {
          checkpointId: waiting.checkpoint?.id,
          approved: true,
        },
      });
      assert.equal(approval.statusCode, 200);
      const finished = await awaitRun(
        app,
        runId,
        (state) =>
          state === 'completed' || state === 'failed' || state === 'blocked',
        35000
      );
      assert.equal(
        finished.state,
        'completed',
        'resumed run must load the profile and finish after authentication'
      );
      assert.equal(signedIn, true);
      const cleanupDeadline = Date.now() + 4000;
      while (closeCalls === 0 && Date.now() < cleanupDeadline) {
        await new Promise((done) => setTimeout(done, 20));
      }
      assert.equal(
        closeCalls,
        1,
        'session cleans up after workflow completion'
      );
    } finally {
      BrowserSession.prototype.open = originalOpen;
      BrowserSession.prototype.close = originalClose;
      await browser.close();
      await app.close();
    }
  }
);

test(
  'Rejecting a login checkpoint closes the browser without running the audit',
  {
    timeout: 30000,
  },
  async () => {
    const browser = await chromium.launch({ headless: true });
    const app = buildApp();
    const originalOpen = BrowserSession.prototype.open;
    const originalClose = BrowserSession.prototype.close;
    let page: Page | undefined;
    let closeCalls = 0;
    try {
      const context = await browser.newContext();
      await context.route('https://www.linkedin.com/**', async (route) => {
        const target = new URL(route.request().url());
        await route.fulfill({
          contentType: 'text/html',
          body:
            target.pathname === '/authwall'
              ? '<main>Sign in required</main>'
              : '<main>Redirecting...</main><script>setTimeout(() => location.replace("/authwall"), 75)</script>',
        });
      });
      BrowserSession.prototype.open = async () => {
        page = await context.newPage();
        return page;
      };
      BrowserSession.prototype.close = async () => {
        closeCalls += 1;
        await page?.close();
      };
      await app.ready();
      const started = await app.inject({
        method: 'POST',
        url: '/runs',
        payload: {
          platform: 'linkedin',
          action: 'audit',
          handle: 'surdma',
        },
      });
      assert.equal(started.statusCode, 202);
      const id = started.json().id as string;
      const waiting = await awaitRun(
        app,
        id,
        (state) => state === 'approval-needed' || state === 'failed',
        12000
      );
      assert.equal(waiting.state, 'approval-needed');
      assert(page && !page.isClosed());
      const answer = await app.inject({
        method: 'POST',
        url: '/runs/' + id + '/decision',
        payload: {
          checkpointId: waiting.checkpoint?.id,
          approved: false,
        },
      });
      assert.equal(answer.statusCode, 200);
      const ended = await awaitRun(
        app,
        id,
        (state) => state === 'blocked' || state === 'failed',
        5000
      );
      assert.equal(ended.state, 'blocked');
      // Close is async from the runner's finally block; await the observable effect.
      const deadline = Date.now() + 3000;
      while ((!page.isClosed() || closeCalls === 0) && Date.now() < deadline) {
        await new Promise((done) => setTimeout(done, 20));
      }
      assert.equal(closeCalls, 1);
      assert.equal(page.isClosed(), true);
    } finally {
      BrowserSession.prototype.open = originalOpen;
      BrowserSession.prototype.close = originalClose;
      await browser.close();
      await app.close();
    }
  }
);
