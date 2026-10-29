import assert from 'node:assert/strict';
import { test } from 'node:test';
import { chromium } from 'playwright';
import type { Locator, Page } from 'playwright';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { AccountStore } from '../src/profile/account-store.js';

process.env.NODE_ENV = 'test';
process.env.UTOMATOR_TEST_DATABASE = 'true';
const { buildApp } = await import('../src/main.js');

/**
 * Buttons exist in the SSR HTML before React hydrates, so the first click of a
 * freshly loaded page can be a no-op. Retry the click until the expected
 * element actually mounts instead of trusting a single pre-hydration click.
 */
async function clickUntilVisible(
  page: Page,
  trigger: Locator,
  target: Locator,
  timeout = 45_000
) {
  const deadline = Date.now() + timeout;
  for (;;) {
    if (await target.isVisible()) return;
    if (Date.now() > deadline)
      throw new Error('hydration retry: target never became visible');
    try {
      await trigger.click({ timeout: 2_000 });
    } catch {
      /* not actionable yet; retry */
    }
    await page.waitForTimeout(300);
  }
}

async function exercise(mode: 'audit' | 'audit-race' | 'reject') {
  const app = buildApp();
  const browser = await chromium.launch({ headless: true });
  try {
    await app.listen({ host: '127.0.0.1', port: 3101 });
    const page = await browser.newPage();
    await page.goto('http://127.0.0.1:3100/dashboard/pipeline', {
      waitUntil: 'domcontentloaded',
    });
    // The toolbar is the current connection entry point; the old header
    // launcher is deliberately hidden in the workspace.
    const launcher = page.getByTestId('floating-connector-button');
    const wizard = page.getByRole('dialog', {
      name: 'Connect your social accounts',
    });
    await clickUntilVisible(page, launcher, wizard);
    await wizard.getByTestId('connector-status').waitFor();
    assert.equal(
      (await wizard.getByTestId('connector-status').innerText()).trim(),
      'Not connected'
    );
    await wizard
      .getByRole('button', { name: 'Connect LinkedIn', exact: true })
      .waitFor();
    // A saved profile reference is not a verified browser session.
    await wizard
      .getByRole('button', { name: 'Close Connect your social accounts' })
      .click();
    await wizard.waitFor({ state: 'hidden' });
    assert.equal(
      await page.getByRole('button', { name: 'Start workflow' }).isDisabled(),
      true,
      'unverified account must never launch an automation'
    );

    const invalid = await page.evaluate(async () => {
      const response = await fetch('/api/runs', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          platform: 'x',
          action: 'audit',
          handle: 'not/a/handle',
        }),
      });
      return response.status;
    });
    assert.equal(
      invalid,
      400,
      'proxy must preserve server-side input validation'
    );
    const forms = await page.request.get(
      'http://127.0.0.1:3100/api/step-forms'
    );
    assert.equal(forms.status(), 200);
    const schema = (await forms.json()) as {
      note: { fields: Array<{ key: string; label: string }> };
      delay: { fields: Array<{ max: number }> };
    };
    assert.equal(schema.note.fields[0]?.key, 'message');
    assert.equal(schema.delay.fields[0]?.max, 30000);

    const templates = page.getByRole('dialog', {
      name: 'Workflow template library',
    });
    await clickUntilVisible(
      page,
      page.getByRole('button', { name: 'Choose workflow template' }),
      templates
    );
    await templates
      .getByRole('option', { name: /Profile baseline and evidence/ })
      .click();
    assert.equal(
      await templates
        .getByRole('button', { name: 'Load selected pipeline' })
        .isDisabled(),
      false,
      'a supported template can be prepared before connecting LinkedIn'
    );
    for (const [platform, pattern] of [
      ['X / Twitter', /X profile health check/],
      ['Instagram', /Reels publishing/],
      ['GitHub', /GitHub profile overview/],
      ['Dev.to', /Dev.to article publishing/],
    ] as const) {
      await templates
        .getByRole('button', { name: platform, exact: true })
        .click();
      await templates.getByRole('option', { name: pattern }).click();
      assert.equal(
        await templates
          .getByRole('button', { name: 'Load selected pipeline' })
          .isDisabled(),
        true,
        platform + ' is coming soon and must not execute'
      );
    }
    await templates
      .getByRole('button', { name: 'Close Workflow template library' })
      .click();

    if (mode === 'audit') {
      const career = await page.evaluate(async () => {
        const response = await fetch('/api/career', { cache: 'no-store' });
        if (!response.ok) throw Error('Career source endpoint unavailable');
        return response.json() as Promise<{
          profile: { name: string; headline: string };
          resumes: unknown[];
        }>;
      });
      assert.equal(
        career.profile.name,
        '',
        'new users must not inherit portfolio owner names'
      );
      assert.equal(
        career.profile.headline,
        '',
        'new users must supply their own career evidence'
      );
      assert.deepEqual(
        career.resumes,
        [],
        'no repository-owner résumé is preloaded'
      );
      await page.getByRole('button', { name: 'Add workflow step' }).click();
      const add = page.getByRole('dialog', { name: 'Add executable step' });
      await add.getByRole('button', { name: /Record event/i }).click();
      const form = page.getByRole('dialog', { name: 'Record a journal event' });
      await form
        .getByLabel('Journal message')
        .fill('Form configured from validated fields');
      await form.getByRole('button', { name: 'Apply node changes' }).click();
      assert.equal(
        await page.locator('[data-testid^="workflow-node-"]').count(),
        12
      );
    }
    if (mode === 'reject') {
      const status = await page.evaluate(async () => {
        const response = await fetch('/api/runs', {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({
            platform: 'x',
            action: 'audit',
            handle: 'user',
            accountId: '00000000-0000-4000-8000-000000000001',
          }),
        });
        return response.status;
      });
      assert.equal(
        status,
        400,
        'a same-origin request must still reject an unverified account'
      );
    }
    if (mode === 'audit-race') {
      await page.getByRole('button', { name: 'Open run tracking' }).click();
      const tracking = page.getByRole('dialog', { name: 'Run tracking' });
      await tracking.getByText('Run telemetry').waitFor();
      await tracking
        .getByRole('button', { name: 'Close Run tracking' })
        .click();
    }
  } finally {
    await browser.close();
    await app.close();
  }
}
test('Next.js workspace uses validated forms and blocks unverified execution', async () =>
  exercise('audit'));
test('Next.js workspace rejects unverified account runs without executing writes', async () =>
  exercise('reject'));

test('Next.js workspace exposes connection and tracking dialogs without a login', async () =>
  exercise('audit-race'));

test(
  'Growth workspace connects 21 capability and toolkit graphs, MDX, export and responsive navigation',
  {
    timeout: 140000,
  },
  async () => {
    const app = buildApp();
    const browser = await chromium.launch({ headless: true });
    try {
      await app.listen({ host: '127.0.0.1', port: 3101 });
      const page = await browser.newPage({
        viewport: { width: 1480, height: 970 },
        acceptDownloads: true,
      });
      await page.goto('http://127.0.0.1:3100/dashboard/growth', {
        waitUntil: 'domcontentloaded',
      });
      const catalog = page.getByTestId('crafts-catalogue');
      await catalog.waitFor();
      await page
        .getByTestId('craft-card-growth-profile')
        .waitFor({ timeout: 40000 });
      assert.equal(
        await page.locator('[data-testid^="craft-card-"]').count(),
        21,
        '15 capabilities and 6 historical toolkits appear in one Growth library'
      );
      await page.getByRole('button', { name: 'LinkedIn capabilities' }).click();
      assert.equal(
        await page.locator('[data-testid^="craft-card-"]').count(),
        15
      );
      await page.getByRole('button', { name: 'Growth toolkits' }).click();
      assert.equal(
        await page.locator('[data-testid^="craft-card-"]').count(),
        6
      );
      await page.getByRole('button', { name: 'All experiences' }).click();
      await page.getByTestId('craft-card-growth-profile').click();
      const detail = page.getByTestId('growth-capability-details');
      await detail.waitFor();
      await detail
        .getByText(
          '20 profile sections requiring independent evidence and coverage'
        )
        .waitFor();
      assert.match(
        await detail.innerText(),
        /Proposed actions and pipeline requirements \(9\)/
      );
      assert.match(await detail.innerText(), /Profile photo/);
      assert.match(await detail.innerText(), /Custom profile URL/);
      assert.match(await detail.innerText(), /Required before full delivery/);
      await page.getByTestId('crafts-artboard').waitFor();
      assert.match(page.url(), /\/dashboard\/growth\/default-growth-profile$/);
      assert.equal(
        await page
          .getByRole('button', { name: 'Save', exact: true })
          .isDisabled(),
        true,
        'published default instructions must remain read-only'
      );
      await page.getByRole('tab', { name: 'MDX source' }).click();
      const editor = page.getByTestId('craft-mdx-editor');
      await editor.waitFor();
      assert.match(
        page.url(),
        /\/dashboard\/growth\/default-growth-profile\/source$/
      );
      assert.match(
        await editor.inputValue(),
        /Review photo framing, banner hierarchy, name and pronunciation accuracy/
      );
      assert.match(
        await editor.inputValue(),
        /Additional section extractors, real field-by-field audit rubric/
      );
      await page.getByRole('button', { name: 'Clone to my crafts' }).click();
      await page.getByText('Created your private craft variation.').waitFor();
      await page.getByRole('tab', { name: 'Visual flow' }).click();
      await page.getByTestId('craft-node-scope').click();
      await page
        .getByLabel('Step title')
        .fill('Scope verified LinkedIn profile evidence');
      await page.getByRole('button', { name: 'Save', exact: true }).click();
      await page.getByText('Saved and synchronized with MDX source.').waitFor();
      await page.getByRole('tab', { name: 'MDX source' }).click();
      const originalSource = await editor.inputValue();
      assert.match(
        originalSource,
        /## Step: scope \| Scope verified LinkedIn profile evidence/
      );
      assert.match(originalSource, /\*\*Next:\*\* \[evidence\]/);
      await editor.fill(
        originalSource.replace(
          '**Next:** [evidence](#step-evidence)',
          '**Next:** [outcome](#step-outcome)'
        )
      );
      await page.getByText('Unapplied MDX changes.').waitFor();
      await page.getByRole('button', { name: 'Apply MDX to graph' }).click();
      await page
        .getByText('Unapplied MDX changes.')
        .waitFor({ state: 'hidden' });
      await page.getByText('Saved and synchronized with MDX source.').waitFor();
      const library = (await app.inject('/crafts')).json() as Array<{
        slug: string;
        id: string;
        links: Array<{ source: string; target: string }>;
      }>;
      const personal = library.find(
        (entry) => entry.slug === 'growth-profile-copy'
      );
      assert(personal, 'the clone must persist in the per-owner library');
      assert(
        personal.links.some(
          (edge) => edge.source === 'scope' && edge.target === 'outcome'
        ),
        'applying the MDX source must update the stored visual graph'
      );
      assert(
        !personal.links.some(
          (edge) => edge.source === 'scope' && edge.target === 'evidence'
        )
      );
      await page.getByRole('tab', { name: 'Visual flow' }).click();
      await page.locator('.react-flow__edge').first().waitFor();
      const downloadPromise = page.waitForEvent('download');
      await page.getByRole('button', { name: '.skill' }).click();
      assert.equal(
        (await downloadPromise).suggestedFilename(),
        'growth-profile-copy.skill'
      );
      await page
        .getByRole('textbox', { name: 'Structured command', exact: true })
        .fill('/craft unlink scope -> outcome');
      await page
        .getByRole('button', { name: 'Send structured command' })
        .click();
      await page
        .getByText(/Updated Profile auditing & section optimization/)
        .waitFor({ timeout: 15000 });
      const updated = (await app.inject('/crafts/' + personal.id)).json() as {
        links: Array<{ source: string; target: string }>;
      };
      assert(
        !updated.links.some(
          (edge) => edge.source === 'scope' && edge.target === 'outcome'
        ),
        'chat editing must update the owner clone, never a shared default'
      );
      const original = (
        await app.inject('/crafts/default-growth-profile')
      ).json() as {
        steps: Array<{ title: string }>;
      };
      assert.equal(original.steps[0]?.title, 'Scope 20 profile sections');
      const sidebar = page.getByTestId('automation-navigation-sidebar');
      await sidebar
        .getByRole('button', { name: 'Profile', exact: true })
        .click();
      await sidebar
        .getByRole('button', { name: 'Growth', exact: true })
        .click();
      await catalog.waitFor();
      assert.match(
        page.url(),
        /\/dashboard\/growth$/,
        'returning via sidebar must not reopen a stale editor'
      );
      await page.getByRole('button', { name: 'New growth flow' }).click();
      const creation = page.getByRole('dialog', {
        name: 'Create a growth flow',
      });
      await creation.waitFor();
      await creation
        .getByLabel('New craft name')
        .fill('Research collaboration outreach');
      await creation
        .getByLabel('Growth objective')
        .fill('Create qualified research collaboration meetings');
      await creation
        .getByLabel('Growth audience')
        .fill('University researchers and research directors');
      await creation
        .getByRole('button', { name: 'Create growth flow' })
        .click();
      await page.getByTestId('crafts-artboard').waitFor();
      await page.getByRole('tab', { name: 'MDX source' }).click();
      const custom = await page.getByTestId('craft-mdx-editor').inputValue();
      assert.match(custom, /Create qualified research collaboration meetings/);
      assert.match(custom, /University researchers and research directors/);
      assert.match(
        page.url(),
        /\/dashboard\/growth\/personal-research-collaboration-outreach\/source$/
      );
      const mobile = await browser.newPage({
        viewport: { width: 390, height: 844 },
      });
      await mobile.goto('http://127.0.0.1:3100/dashboard/crafts', {
        waitUntil: 'domcontentloaded',
      });
      await mobile
        .getByTestId('craft-card-growth-profile')
        .waitFor({ timeout: 40000 });
      assert.match(
        mobile.url(),
        /\/dashboard\/growth$/,
        'legacy Craft catalog redirects to Growth'
      );
      const bounds = await mobile.evaluate(() => ({
        viewport: document.documentElement.clientWidth,
        scroll: document.documentElement.scrollWidth,
      }));
      assert(
        bounds.scroll <= bounds.viewport + 1,
        'Growth library fits mobile width'
      );
      await mobile.getByRole('button', { name: 'Toggle navigation' }).click();
      assert.equal(
        await mobile.getByTestId('automation-navigation-sidebar').isVisible(),
        true
      );
      await mobile.getByRole('button', { name: 'Close navigation' }).click();
      assert.equal(
        await mobile.getByTestId('automation-navigation-sidebar').isVisible(),
        false
      );
      await mobile.close();
    } finally {
      await browser.close();
      await app.close();
    }
  }
);

test('LinkedIn templates load onto the artboard without connection; execution stays account-gated', async () => {
  const app = buildApp();
  const browser = await chromium.launch({ headless: true });
  const createdIds: string[] = [];
  try {
    await app.listen({ host: '127.0.0.1', port: 3101 });
    const page = await browser.newPage();
    await page.goto('http://127.0.0.1:3100/dashboard/pipeline', {
      waitUntil: 'domcontentloaded',
    });
    const existingIds = new Set(
      ((await app.inject('/workflows')).json() as Array<{ id: string }>).map(
        (item) => item.id
      )
    );
    const run = page.getByRole('button', { name: 'Start workflow' });
    assert.equal(await run.isDisabled(), true);
    const catalog = page.getByRole('dialog', {
      name: 'Workflow template library',
    });
    await clickUntilVisible(
      page,
      page.getByRole('button', { name: 'Choose workflow template' }),
      catalog
    );
    await catalog
      .getByRole('option', { name: /Headline and About revision/ })
      .click();
    const preview = page.getByTestId('template-preview');
    assert.match(await preview.innerText(), /Pipeline preview/);
    assert.equal(
      await preview.getByRole('list').count(),
      0,
      'preview must render a diagram instead of a numbered text list'
    );
    const graph = preview.getByTestId('template-graph-preview');
    await graph.locator('.react-flow__node').first().waitFor();
    assert(
      (await graph.locator('.react-flow__node').count()) >= 8,
      'preview must show the real pipeline nodes'
    );
    assert(
      (await graph.locator('.react-flow__edge').count()) >= 7,
      'pipeline relationships must render as connected edges'
    );
    assert.doesNotMatch(
      await preview.innerText(),
      /\bYAML\b|input: .*operation:|output:/i
    );
    const library = catalog.getByRole('listbox', {
      name: 'Workflow template list',
    });
    const heading = catalog.getByText('Social presence library');
    const before = await heading.boundingBox();
    assert(before);
    const scroll = await library.evaluate((element) => {
      const start = element.scrollTop;
      element.scrollTop = element.scrollHeight;
      return {
        start,
        top: element.scrollTop,
        client: element.clientHeight,
        total: element.scrollHeight,
      };
    });
    assert(
      scroll.total > scroll.client && scroll.top > scroll.start,
      'the template list must own its scrolling'
    );
    const after = await heading.boundingBox();
    assert(
      after && Math.abs(after.y - before.y) < 2,
      'library header remains fixed while templates scroll'
    );
    assert.equal(
      await catalog.evaluate((element) => element.scrollTop),
      0,
      'modal itself must not scroll into blank space'
    );
    await page.setViewportSize({ width: 390, height: 740 });
    await graph.locator('.react-flow__node').first().waitFor();
    assert.equal(
      await heading.isVisible(),
      true,
      'library heading remains visible on mobile'
    );
    assert.equal(
      await graph.isVisible(),
      true,
      'pipeline diagram remains visible on mobile'
    );
    const modalBounds = await catalog.boundingBox();
    const previewBounds = await preview.boundingBox();
    assert(
      modalBounds &&
        previewBounds &&
        previewBounds.y + previewBounds.height <=
          modalBounds.y + modalBounds.height + 1,
      'detail panel must remain inside the modal viewport'
    );
    const load = catalog.getByRole('button', {
      name: 'Load selected pipeline',
    });
    assert.equal(
      await load.isDisabled(),
      false,
      'loading must not require account verification'
    );
    await load.click();
    await catalog.waitFor({ state: 'hidden' });
    await page.setViewportSize({ width: 1280, height: 800 });
    const board = page.getByTestId('workflow-artboard');
    await board.getByText('Headline and About revision').first().waitFor();
    await board
      .getByTestId('workflow-run-readiness')
      .getByText(/Connect and sync the selected LinkedIn account/)
      .waitFor();
    assert.equal(
      await run.isDisabled(),
      true,
      'unverified account cannot execute the loaded template'
    );
    const saved = (await app.inject('/workflows')).json() as Array<{
      id: string;
      templateId: string;
      plan: { action: string };
    }>;
    createdIds.push(
      ...saved
        .filter(
          (entry) =>
            !existingIds.has(entry.id) &&
            entry.templateId === 'li-intro' &&
            entry.plan.action === 'edit-profile'
        )
        .map((entry) => entry.id)
    );
    assert(createdIds.length > 0);
    // Simulate a stale/untrusted UI connection report. The artboard must keep
    // the loaded plan when the owner connects, while the server remains the gate.
    await page.route('**/api/connectors', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify([
          {
            id: '00000000-0000-4000-8000-000000000099',
            platform: 'linkedin',
            label: 'Test verified account',
            handle: 'test-verified-account',
            profileUrl: 'https://www.linkedin.com/in/test-verified-account/',
            status: 'connected',
            verifiedAt: new Date().toISOString(),
            authentication: 'browser',
          },
        ]),
      });
    });
    await page
      .getByTestId('automation-navigation-sidebar')
      .getByRole('button', { name: 'Run history' })
      .click();
    await page
      .getByTestId('automation-navigation-sidebar')
      .getByRole('button', { name: 'Pipeline' })
      .click();
    const reloadedBoard = page.getByTestId('workflow-artboard');
    await reloadedBoard
      .getByTestId('workflow-run-readiness')
      .getByText(/Execution target: Test verified account/)
      .waitFor();
    assert.match(
      await reloadedBoard.innerText(),
      /Headline and About revision/,
      'connecting after loading must not reset the selected workflow'
    );
    assert.equal(await run.isDisabled(), false);
    const beforeRejectedRun = (await app.inject('/runs')).json().length;
    await run.click();
    await reloadedBoard
      .getByRole('alert')
      .getByText(/Social account not found/)
      .waitFor();
    assert.equal(
      (await app.inject('/runs')).json().length,
      beforeRejectedRun,
      'client-reported connectivity cannot bypass the server account check'
    );
    await page
      .getByRole('button', { name: 'Choose workflow template' })
      .click();
    const planned = page.getByRole('dialog', {
      name: 'Workflow template library',
    });
    await planned.getByRole('button', { name: 'Instagram' }).click();
    assert.equal(
      await planned
        .getByRole('button', { name: 'Load selected pipeline' })
        .isDisabled(),
      true,
      'planned provider integrations must remain inaccessible'
    );
    assert.doesNotMatch(await planned.innerText(), /\bYAML\b/);
  } finally {
    await browser.close();
    await app.close();
    for (const id of createdIds) {
      await rm(join(process.cwd(), '.runtime', 'workflows', id + '.json'), {
        force: true,
      });
      await rm(join(process.cwd(), '.runtime', 'workflows', 'revisions', id), {
        recursive: true,
        force: true,
      });
    }
  }
});

test('Creator research connects a real form to persisted results and remains available after reload', async () => {
  const app = buildApp();
  const browser = await chromium.launch({ headless: true });
  try {
    await app.listen({ host: '127.0.0.1', port: 3101 });
    const page = await browser.newPage();
    await page.goto('http://127.0.0.1:3100/dashboard/research', {
      waitUntil: 'domcontentloaded',
    });
    const studio = page.getByTestId('linkedin-creator-research');
    await studio.waitFor({ state: 'visible' });
    await studio
      .getByRole('textbox', { name: 'Your niche' })
      .fill('Software education');
    await studio
      .getByRole('textbox', { name: 'Research objective' })
      .fill('Improve technical community visibility');
    await studio
      .getByRole('textbox', { name: 'Your current LinkedIn headline' })
      .fill('Engineer and educator');
    await studio
      .getByRole('textbox', { name: 'Creator name' })
      .fill('Research sample');
    await studio
      .getByRole('textbox', { name: 'LinkedIn profile URL' })
      .fill('https://www.linkedin.com/in/sample-creator/');
    await studio
      .getByRole('textbox', { name: 'Observed headline' })
      .fill('Developer educator and software writer');
    await studio
      .getByRole('textbox', { name: 'Post permalink' })
      .fill(
        'https://www.linkedin.com/posts/sample-creator_technical-activity-1234'
      );
    await studio
      .getByRole('textbox', { name: 'Exact post excerpt' })
      .fill(
        'Technical writing for software development and community research using practical examples.'
      );
    const report = page.getByTestId('creator-research-report');
    const objective = report.getByText(
      'Objective: Improve technical community visibility'
    );
    await clickUntilVisible(
      page,
      studio.getByRole('button', { name: 'Run evidenced comparison' }),
      objective
    );
    await objective.waitFor({ timeout: 15000 });
    assert.match(await report.innerText(), /Evidence-linked results/);
    assert.match(await report.innerText(), /Potential topics not present/);
    assert.match(await report.innerText(), /Evidence post/);
    assert.equal(await report.getByRole('link', { name: /YAML/ }).count(), 0);
    const histories = (await app.inject('/linkedin/research')).json() as Array<{
      id: string;
    }>;
    assert(histories.length > 0);
    const internal = await app.inject(
      '/linkedin/research/' + histories[0]!.id + '/yaml'
    );
    assert.equal(internal.statusCode, 200);
    assert.match(internal.body, /validate-submitted-sources/);
    await page.reload();
    await page
      .getByText('Objective: Improve technical community visibility')
      .waitFor({ timeout: 15000 });
  } finally {
    await browser.close();
    await app.close();
  }
});

test('LinkedIn editorial research-to-draft workflow persists, approves and returns YAML', async () => {
  const root = await mkdtemp(join(tmpdir(), 'utomator-editorial-ui-'));
  const app = buildApp({ socialWorkspaceRoot: root });
  const browser = await chromium.launch({ headless: true });
  try {
    await app.listen({ host: '127.0.0.1', port: 3101 });
    const suffix = String(Date.now()).slice(-8);
    const handle = 'editorial' + suffix;
    const seeded = await new AccountStore(root).addSocial(0, {
      platform: 'linkedin',
      label: 'Editorial E2E',
      handle,
      profileUrl: 'https://www.linkedin.com/in/' + handle + '/',
    });
    const savedAccount = seeded.socialAccounts[0]!;
    const research = await app.inject({
      method: 'POST',
      url: '/linkedin/research',
      payload: {
        niche: 'Software education',
        objective: 'Test evidence-grounded content planning',
        ownerHeadline: 'Engineering educator',
        creators: [
          {
            name: 'Example creator',
            profileUrl: 'https://www.linkedin.com/in/example-creator/',
            headline: 'Software tutorials and engineering content',
            posts: [
              {
                url: 'https://www.linkedin.com/posts/example-creator_technical-activity-12345',
                text: 'Technical tutorials explain software architecture and community development with documented examples.',
              },
            ],
          },
        ],
      },
    });
    assert.equal(research.statusCode, 201, research.body);
    const researchRun = research.json() as { id: string };
    const page = await browser.newPage();
    await page.goto('http://127.0.0.1:3100/dashboard/editorial', {
      waitUntil: 'domcontentloaded',
    });
    const studio = page.getByTestId('linkedin-editorial-studio');
    await studio.waitFor({ state: 'visible' });
    await studio
      .getByRole('combobox', { name: 'Saved LinkedIn account' })
      .selectOption(savedAccount.id);
    await studio
      .getByRole('combobox', { name: /Evidence from Creator Research/ })
      .selectOption(researchRun.id);
    await studio
      .getByRole('textbox', { name: /Post draft/ })
      .fill(
        'An evidence-backed explanation of technical writing and hands-on software education for learners.'
      );
    await studio.getByRole('button', { name: 'Create private draft' }).click();
    await studio.getByText(/Draft saved to your private workspace/).waitFor();
    await studio
      .getByRole('button', { name: 'Approve reviewed draft' })
      .click();
    await studio.getByText(/Draft is now approved/).waitFor();
    assert.equal(
      await studio
        .getByRole('button', { name: 'Publish approved post to LinkedIn' })
        .isDisabled(),
      true,
      'a reviewed local draft must never publish without a separate LinkedIn API grant'
    );
    assert.equal(await studio.getByRole('link', { name: /YAML/ }).count(), 0);
    const written = (await app.inject('/linkedin/drafts')).json() as Array<{
      id: string;
    }>;
    assert(written.length > 0);
    const snapshot = await app.inject(
      '/linkedin/drafts/' + written[0]!.id + '/yaml'
    );
    assert.equal(snapshot.statusCode, 200);
    assert.match(snapshot.body, /externalPublishing: "not-performed"/);
    await page.reload({ waitUntil: 'domcontentloaded' });
    await studio.getByText(/Saved drafts/).waitFor();
    const savedDraft = studio
      .locator('section')
      .last()
      .getByRole('button')
      .first();
    await savedDraft.click();
    await studio.getByRole('button', { name: 'Reopen for edits' }).click();
    await studio.getByText(/Draft is now draft/).waitFor();
    const report = await app.inject('/linkedin/drafts');
    assert.equal(report.statusCode, 200);
    const rows = report.json() as Array<{
      accountId: string;
      content: { researchRunId: string; sourceUrls: string[] };
    }>;
    assert(
      rows.some(
        (row) =>
          row.accountId === savedAccount.id &&
          row.content.researchRunId === researchRun.id &&
          row.content.sourceUrls.length > 0
      )
    );
  } finally {
    await browser.close();
    await app.close();
    await rm(root, { recursive: true, force: true });
  }
});

test('Growth discovery preserves capability delivery status, section coverage and real workflow links', async () => {
  const app = buildApp();
  const browser = await chromium.launch({ headless: true });
  try {
    await app.listen({ host: '127.0.0.1', port: 3101 });
    const page = await browser.newPage({
      viewport: { width: 1280, height: 800 },
    });
    await page.goto('http://127.0.0.1:3100/dashboard/growth', {
      waitUntil: 'domcontentloaded',
    });
    const catalog = page.getByTestId('crafts-catalogue');
    await page
      .getByTestId('craft-card-growth-jobs')
      .waitFor({ timeout: 40000 });
    await catalog
      .getByRole('button', { name: 'LinkedIn capabilities' })
      .click();
    assert.equal(
      await page.locator('[data-testid^="craft-card-"]').count(),
      15
    );
    await page.getByTestId('craft-card-growth-jobs').click();
    const detail = page.getByTestId('growth-capability-details');
    await detail
      .getByRole('heading', {
        name: 'Job search & career opportunity pipeline',
      })
      .waitFor();
    assert.match(await detail.innerText(), /Planned/);
    assert.equal(
      await detail
        .getByRole('link', { name: 'Open existing supported workflow' })
        .count(),
      0,
      'a planned integration must not offer a live execution shortcut'
    );
    await page.getByRole('button', { name: 'Growth library' }).click();
    await catalog.waitFor();
    await catalog
      .getByRole('textbox', { name: 'Search crafts' })
      .fill('creator');
    await page.getByTestId('craft-card-growth-competitors').waitFor();
    await catalog.getByRole('textbox', { name: 'Search crafts' }).fill('');
    await page.getByTestId('craft-card-growth-profile').click();
    await detail
      .getByText(
        '20 profile sections requiring independent evidence and coverage'
      )
      .waitFor();
    await detail
      .getByRole('link', { name: 'Open existing supported workflow' })
      .click();
    await page.waitForURL('**/dashboard/profile');
    await page
      .getByTestId('automation-navigation-sidebar')
      .getByRole('button', { name: 'Growth', exact: true })
      .click();
    await catalog.waitFor();
    await page.setViewportSize({ width: 390, height: 844 });
    await page.getByTestId('craft-card-growth-company').click();
    await detail
      .getByRole('heading', { name: 'Company Page & organization growth' })
      .waitFor();
    assert.equal(
      await detail
        .getByRole('link', { name: 'Open existing supported workflow' })
        .count(),
      0,
      'organization authorization is not implied by a planned graph'
    );
  } finally {
    await browser.close();
    await app.close();
  }
});

test('Connector dialog rejects manual profile entry and Profile shows only verified links', async () => {
  const root = await mkdtemp(join(tmpdir(), 'utomator-linkedin-dialog-'));
  const app = buildApp({ socialWorkspaceRoot: root });
  const browser = await chromium.launch({ headless: true });
  try {
    await app.listen({ host: '127.0.0.1', port: 3101 });
    const page = await browser.newPage({
      viewport: { width: 1280, height: 800 },
    });
    await page.goto('http://127.0.0.1:3100/dashboard/pipeline', {
      waitUntil: 'domcontentloaded',
    });
    const dialog = page.getByRole('dialog', {
      name: 'Connect your social accounts',
    });
    await page.getByTestId('workflow-artboard').waitFor();
    await clickUntilVisible(
      page,
      page.getByTestId('floating-connector-button'),
      dialog
    );
    await dialog.getByTestId('linkedin-connector').waitFor();
    await page.setViewportSize({ width: 390, height: 760 });
    assert.equal(
      await dialog
        .getByRole('heading', { name: 'LinkedIn', exact: true })
        .count(),
      1
    );
    assert.equal(
      await dialog
        .getByRole('textbox', { name: /profile address|username|handle/i })
        .count(),
      0
    );
    await dialog
      .getByRole('button', { name: 'Connect LinkedIn', exact: true })
      .waitFor();
    const before = (await app.inject('/account')).json() as {
      socialAccounts: unknown[];
    };
    assert.equal(
      before.socialAccounts.length,
      0,
      'viewing a provider must not create an account'
    );
    await page.keyboard.press('Escape');
    await page.goto('http://127.0.0.1:3100/dashboard/profile/connections', {
      waitUntil: 'domcontentloaded',
    });
    const owner = page.getByTestId('owner-profile-page');
    await owner.waitFor();
    await owner.getByText('No verified account linked.').first().waitFor();
    assert.equal(
      await owner.getByText('No verified account linked.').count(),
      5
    );
    assert.equal(
      await owner.getByRole('button', { name: 'Add profile' }).count(),
      0
    );
    await owner.getByRole('button', { name: 'Manage connections' }).click();
    await dialog.waitFor({ state: 'visible' });
    await dialog
      .getByRole('button', { name: 'Connect LinkedIn', exact: true })
      .waitFor();
    const after = (await app.inject('/account')).json() as {
      socialAccounts: unknown[];
    };
    assert.equal(
      after.socialAccounts.length,
      0,
      'an unverified profile must never be persisted'
    );
  } finally {
    await browser.close();
    await app.close();
    await rm(root, { recursive: true, force: true });
  }
});

test(
  'Growth YAML templates load into the existing workflow artboard with nested pipeline task nodes',
  {
    timeout: 90000,
  },
  async () => {
    const app = buildApp();
    const browser = await chromium.launch({ headless: true });
    try {
      await app.listen({ host: '127.0.0.1', port: 3101 });
      const page = await browser.newPage({
        viewport: { width: 1320, height: 900 },
      });
      await page.goto('http://127.0.0.1:3100/dashboard/pipeline', {
        waitUntil: 'domcontentloaded',
      });
      const before = (await app.inject('/runs')).json().length;
      const modal = page.getByRole('dialog', {
        name: 'Workflow template library',
      });
      await clickUntilVisible(
        page,
        page.getByRole('button', { name: 'Choose workflow template' }),
        modal
      );
      await modal
        .getByRole('searchbox', { name: 'Search workflow templates' })
        .fill('Portfolio proofing');
      await modal.getByRole('option', { name: /Portfolio proofing/ }).waitFor();
      await modal.getByRole('option', { name: /Portfolio proofing/ }).click();
      await modal
        .getByText(/MDX methodology · not an executable YAML workflow/)
        .waitFor();
      assert.match(
        (await modal
          .getByRole('link', { name: 'Open methodology in Growth library' })
          .getAttribute('href')) ?? '',
        /\/dashboard\/growth\/default-portfolio-proofing$/,
        'existing MDX toolkit remains accessible'
      );
      assert.equal(
        (await app.inject('/runs')).json().length,
        before,
        'viewing an MDX methodology must not dispatch the Runner'
      );
      await modal
        .getByRole('searchbox', { name: 'Search workflow templates' })
        .fill('Profile auditing & section optimization');
      await modal
        .getByRole('option', {
          name: /Profile auditing & section optimization/,
        })
        .click();
      await modal.getByText(/6 connected pipelines/).waitFor();
      await modal.getByRole('button', { name: 'Load Growth workflow' }).click();
      await modal.waitFor({ state: 'hidden' });
      const board = page.getByTestId('workflow-artboard');
      const graph = board.getByTestId('growth-nested-artboard');
      await graph.waitFor();
      assert.equal(
        await graph.locator('[data-testid^="growth-pipeline-node-"]').count(),
        6
      );
      await graph
        .locator('.react-flow__edge')
        .first()
        .waitFor({ state: 'attached', timeout: 15000 });
      assert.equal(await graph.locator('.react-flow__edge').count(), 5);
      for (const path of await graph
        .locator('.react-flow__edge path.react-flow__edge-path')
        .all())
        assert.match(
          (await path.getAttribute('d')) ?? '',
          /^M/,
          'connected pipeline edges must have SVG path geometry'
        );
      await graph.getByTestId('growth-pipeline-node-identity').click();
      await graph.getByTestId('growth-task-node-start').waitFor();
      await graph.getByTestId('growth-task-node-session').waitFor();
      assert(
        (await graph.locator('[data-testid^="growth-task-node-"]').count()) >= 4
      );
      await graph.getByRole('button', { name: 'Back to pipelines' }).click();
      await graph.getByTestId('growth-pipeline-node-identity').waitFor();
      assert.equal(
        (await app.inject('/runs')).json().length,
        before,
        'selecting a Growth template must not execute a browser action'
      );
    } finally {
      await browser.close();
      await app.close();
    }
  }
);

test(
  'second Growth YAML uses the same modal and nested pipeline graph',
  {
    timeout: 90000,
  },
  async () => {
    const app = buildApp();
    const browser = await chromium.launch({ headless: true });
    try {
      await app.listen({ host: '127.0.0.1', port: 3101 });
      const page = await browser.newPage({
        viewport: { width: 1280, height: 820 },
      });
      await page.goto('http://127.0.0.1:3100/dashboard/pipeline', {
        waitUntil: 'domcontentloaded',
      });
      const before = (await app.inject('/runs')).json().length;
      const modal = page.getByRole('dialog', {
        name: 'Workflow template library',
      });
      await clickUntilVisible(
        page,
        page.getByRole('button', { name: 'Choose workflow template' }),
        modal
      );
      await modal
        .getByRole('searchbox', { name: 'Search workflow templates' })
        .fill('Personal positioning & professional authority');
      await modal
        .getByRole('option', {
          name: /Personal positioning & professional authority/,
        })
        .click();
      await modal.getByText(/1 connected pipelines/).waitFor();
      await modal.getByRole('button', { name: 'Load Growth workflow' }).click();
      await modal.waitFor({ state: 'hidden' });
      const graph = page
        .getByTestId('workflow-artboard')
        .getByTestId('growth-nested-artboard');
      await graph.getByTestId('growth-pipeline-node-positioning').waitFor();
      assert.equal(
        await graph.locator('[data-testid^="growth-pipeline-node-"]').count(),
        1
      );
      await graph.getByTestId('growth-pipeline-node-positioning').click();
      await graph.getByTestId('growth-task-node-session').waitFor();
      assert(
        (await graph.locator('[data-testid^="growth-task-node-"]').count()) >= 4
      );
      assert.equal((await app.inject('/runs')).json().length, before);
    } finally {
      await browser.close();
      await app.close();
    }
  }
);

test(
  'Local Chrome attachment keeps the external process alive across connector tab cleanup',
  {
    timeout: 45000,
  },
  async () => {
    const { BrowserSession } = await import('../src/browser/session.js');
    const port = 22000 + (process.pid % 14000);
    const external = await chromium.launch({
      headless: true,
      args: ['--remote-debugging-port=' + port],
    });
    const keys = [
      'UTOMATOR_BROWSER_MODE',
      'HEADLESS',
      'UTOMATOR_INTERNAL_OWNER_ID',
      'CHROME_CDP_URL',
      'UTOMATOR_DISABLE_CDP',
    ] as const;
    const saved = Object.fromEntries(
      keys.map((key) => [key, process.env[key]])
    );
    let first: InstanceType<typeof BrowserSession> | undefined;
    let second: InstanceType<typeof BrowserSession> | undefined;
    try {
      process.env.UTOMATOR_BROWSER_MODE = 'attached';
      process.env.HEADLESS = 'false';
      delete process.env.UTOMATOR_INTERNAL_OWNER_ID;
      delete process.env.UTOMATOR_DISABLE_CDP;
      process.env.CHROME_CDP_URL = 'http://127.0.0.1:' + port;
      first = new BrowserSession();
      second = new BrowserSession();
      await first.open('linkedin', '00000000-0000-4000-8000-000000000041');
      await second.open('x', '00000000-0000-4000-8000-000000000042');
      await first.close();
      assert.equal(
        external.isConnected(),
        true,
        'local Chrome must survive first disconnect'
      );
      await second.currentPage!.setContent(
        '<main>second connection works</main>'
      );
      assert.equal(
        await second.currentPage!.locator('main').innerText(),
        'second connection works'
      );
      await second.close();
      assert.equal(
        external.isConnected(),
        true,
        'local Chrome must survive all tab closures'
      );
    } finally {
      await first?.close().catch(() => {});
      await second?.close().catch(() => {});
      await external.close();
      for (const key of keys) {
        const original = saved[key];
        if (original === undefined) delete process.env[key];
        else process.env[key] = original;
      }
    }
  }
);
