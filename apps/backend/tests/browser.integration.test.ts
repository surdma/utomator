import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { Locator, Page } from 'playwright';
import { chromium } from 'playwright';
import { expect, test } from 'vitest';
import { AccountStore } from '../src/infrastructure/profile/account-store.js';
import { removeTemp } from './support/remove-temp.js';

process.env.NODE_ENV = 'test';
process.env.UTOMATOR_TEST_DATABASE = 'true';
const { buildApp } = await import('../src/main.js');

/**
 * Buttons exist in the SSR HTML before React hydrates, so the first click of a
 * freshly loaded page can be a no-op. Retry the click until the expected
 * element actually mounts instead of trusting a single pre-hydration click.
 */
async function clickUntilVisible(page: Page, trigger: Locator, target: Locator, timeout = 45_000) {
  const deadline = Date.now() + timeout;
  for (;;) {
    if (await target.isVisible()) return;
    if (Date.now() > deadline) throw new Error('hydration retry: target never became visible');
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
    // A fresh Artboard has no default workflow and must not launch the Runner.
    await page.getByTestId('workflow-artboard').waitFor();
    await page.getByTestId('workflow-empty-state').waitFor();
    expect(await page.locator('[data-testid^="workflow-node-"]').count()).toEqual(0);
    expect(await page.getByRole('button', { name: 'Start workflow' }).count()).toEqual(0);
    const create = page.getByRole('button', { name: 'Create new workflow' });
    await clickUntilVisible(page, create, page.getByTestId('workflow-node-start'));
    expect(await page.locator('[data-testid^="workflow-node-"]').count()).toEqual(4);
    // The connection entry point remains available after creating the draft.
    const launcher = page.getByTestId('floating-connector-button');
    const wizard = page.getByRole('dialog', {
      name: 'Connect your social accounts',
    });
    await clickUntilVisible(page, launcher, wizard);
    await wizard.getByTestId('connector-status').waitFor();
    expect((await wizard.getByTestId('connector-status').innerText()).trim()).toEqual('Not connected');
    await wizard.getByRole('button', { name: 'Connect LinkedIn', exact: true }).waitFor();
    // A saved profile reference is not a verified browser session.
    await wizard.getByRole('button', { name: 'Close Connect your social accounts' }).click();
    await wizard.waitFor({ state: 'hidden' });
    expect(await page.getByRole('button', { name: 'Start workflow' }).isDisabled()).toEqual(true);

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
    expect(invalid).toEqual(400);
    const forms = await page.request.get('http://127.0.0.1:3100/api/step-forms');
    expect(forms.status()).toEqual(200);
    const schema = (await forms.json()) as {
      note: { fields: Array<{ key: string; label: string }> };
      delay: { fields: Array<{ max: number }> };
    };
    expect(schema.note.fields[0]?.key).toEqual('message');
    expect(schema.delay.fields[0]?.max).toEqual(30000);

    const templateRunsBefore = (await app.inject('/runs')).json().length;
    const templates = page.getByRole('dialog', { name: 'Workflow library' });
    await clickUntilVisible(
      page,
      page.getByRole('button', { name: 'Choose workflow template' }),
      templates,
    );
    await templates.getByTestId('growth-template-count').getByText('21 workflows').waitFor();
    await templates.getByRole('searchbox', { name: 'Search workflows' }).fill('Profile auditing');
    await templates.getByTestId('growth-template-option').click();
    const preview = templates.getByTestId('growth-template-pipeline-preview');
    await preview.waitFor();
    expect(await preview.innerText()).toMatch(/6 connected pipelines/);
    expect(await templates.getByRole('button', { name: 'Open YAML workflow' }).isDisabled()).toEqual(
      false,
    );
    await templates
      .getByRole('combobox', { name: 'Filter workflow availability' })
      .selectOption('design');
    await templates
      .getByRole('searchbox', { name: 'Search workflows' })
      .fill('Personal brand positioning');
    await preview.getByText('Evidence and preparation').waitFor();
    expect(
      await templates.getByRole('button', { name: 'Inspect planning workflow' }).isDisabled(),
    ).toEqual(false);
    expect((await app.inject('/runs')).json().length).toEqual(templateRunsBefore);
    await templates.getByRole('button', { name: 'Close Workflow library' }).click();
    await templates.waitFor({ state: 'hidden' });

    if (mode === 'audit') {
      const career = await page.evaluate(async () => {
        const response = await fetch('/api/career', { cache: 'no-store' });
        if (!response.ok) throw Error('Career source endpoint unavailable');
        return response.json() as Promise<{
          profile: { name: string; headline: string };
          resumes: unknown[];
        }>;
      });
      expect(career.profile.name).toEqual('');
      expect(career.profile.headline).toEqual('');
      expect(career.resumes).toEqual([]);
      await page.getByRole('button', { name: 'Add workflow step' }).click();
      const add = page.getByRole('dialog', { name: 'Add executable step' });
      await add.getByRole('button', { name: /Record event/i }).click();
      const form = page.getByRole('dialog', { name: 'Record a journal event' });
      await form.getByLabel('Journal message').fill('Form configured from validated fields');
      await form.getByRole('button', { name: 'Apply node changes' }).click();
      expect(await page.locator('[data-testid^="workflow-node-"]').count()).toEqual(5);
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
      expect(status).toEqual(400);
    }
    if (mode === 'audit-race') {
      await page.getByRole('button', { name: 'Open run tracking' }).click();
      const tracking = page.getByRole('dialog', { name: 'Run tracking' });
      await tracking.getByText('Run telemetry').waitFor();
      await tracking.getByRole('button', { name: 'Close Run tracking' }).click();
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

test('Growth workspace connects 21 capability and toolkit graphs, MDX, export and responsive navigation', {
  timeout: 140000,
}, async () => {
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
    await page.getByTestId('craft-card-growth-profile').waitFor({ timeout: 40000 });
    expect(await page.locator('[data-testid^="craft-card-"]').count()).toEqual(21);
    await page.getByRole('button', { name: 'LinkedIn capabilities' }).click();
    expect(await page.locator('[data-testid^="craft-card-"]').count()).toEqual(15);
    await page.getByRole('button', { name: 'Growth toolkits' }).click();
    expect(await page.locator('[data-testid^="craft-card-"]').count()).toEqual(6);
    await page.getByRole('button', { name: 'All experiences' }).click();
    await page.getByTestId('craft-card-growth-profile').click();
    const detail = page.getByTestId('growth-capability-details');
    await detail.waitFor();
    await detail.getByText('20 profile sections requiring independent evidence and coverage').waitFor();
    expect(await detail.innerText()).toMatch(/Proposed actions and pipeline requirements \(9\)/);
    expect(await detail.innerText()).toMatch(/Profile photo/);
    expect(await detail.innerText()).toMatch(/Custom profile URL/);
    expect(await detail.innerText()).toMatch(/Required before full delivery/);
    await page.getByTestId('crafts-artboard').waitFor();
    expect(page.url()).toMatch(/\/dashboard\/growth\/default-growth-profile$/);
    expect(await page.getByRole('button', { name: 'Save', exact: true }).isDisabled()).toEqual(true);
    await page.getByRole('tab', { name: 'MDX source' }).click();
    const editor = page.getByTestId('craft-mdx-editor');
    await editor.waitFor();
    expect(page.url()).toMatch(/\/dashboard\/growth\/default-growth-profile\/source$/);
    expect(await editor.inputValue()).toMatch(
      /Review photo framing, banner hierarchy, name and pronunciation accuracy/,
    );
    expect(await editor.inputValue()).toMatch(
      /Additional section extractors, real field-by-field audit rubric/,
    );
    await page.getByRole('button', { name: 'Clone to my crafts' }).click();
    await page.getByText('Created your private craft variation.').waitFor();
    await page.getByRole('tab', { name: 'Visual flow' }).click();
    await page.getByTestId('craft-node-scope').click();
    await page.getByLabel('Step title').fill('Scope verified LinkedIn profile evidence');
    await page.getByRole('button', { name: 'Save', exact: true }).click();
    await page.getByText('Saved and synchronized with MDX source.').waitFor();
    await page.getByRole('tab', { name: 'MDX source' }).click();
    const originalSource = await editor.inputValue();
    expect(originalSource).toMatch(/## Step: scope \| Scope verified LinkedIn profile evidence/);
    expect(originalSource).toMatch(/\*\*Next:\*\* \[evidence\]/);
    await editor.fill(
      originalSource.replace(
        '**Next:** [evidence](#step-evidence)',
        '**Next:** [outcome](#step-outcome)',
      ),
    );
    await page.getByText('Unapplied MDX changes.').waitFor();
    await page.getByRole('button', { name: 'Apply MDX to graph' }).click();
    await page.getByText('Unapplied MDX changes.').waitFor({ state: 'hidden' });
    await page.getByText('Saved and synchronized with MDX source.').waitFor();
    const library = (await app.inject('/crafts')).json() as Array<{
      slug: string;
      id: string;
      links: Array<{ source: string; target: string }>;
    }>;
    const personal = library.find((entry) => entry.slug === 'growth-profile-copy');
    expect(personal).toBeTruthy();
    expect(
      personal.links.some((edge) => edge.source === 'scope' && edge.target === 'outcome'),
    ).toBeTruthy();
    expect(
      !personal.links.some((edge) => edge.source === 'scope' && edge.target === 'evidence'),
    ).toBeTruthy();
    await page.getByRole('tab', { name: 'Visual flow' }).click();
    await page.locator('.react-flow__edge').first().waitFor();
    const downloadPromise = page.waitForEvent('download');
    await page.getByRole('button', { name: '.skill' }).click();
    expect((await downloadPromise).suggestedFilename()).toEqual('growth-profile-copy.skill');
    await page.getByTestId('craft-node-scope').click();
    await page.getByRole('button', { name: 'Unlink outcome' }).click();
    await page.getByRole('button', { name: 'Save', exact: true }).click();
    await page.getByText('Saved and synchronized with MDX source.').waitFor();
    const updated = (await app.inject('/crafts/' + personal.id)).json() as {
      links: Array<{ source: string; target: string }>;
    };
    expect(
      !updated.links.some((edge) => edge.source === 'scope' && edge.target === 'outcome'),
    ).toBeTruthy();
    const original = (await app.inject('/crafts/default-growth-profile')).json() as {
      steps: Array<{ title: string }>;
    };
    expect(original.steps[0]?.title).toEqual('Scope 20 profile sections');
    const sidebar = page.getByTestId('automation-navigation-sidebar');
    await sidebar.getByRole('button', { name: 'Profile', exact: true }).click();
    await sidebar.getByRole('button', { name: 'Growth', exact: true }).click();
    await catalog.waitFor();
    expect(page.url()).toMatch(/\/dashboard\/growth$/);
    await page.getByRole('button', { name: 'New growth flow' }).click();
    const creation = page.getByRole('dialog', {
      name: 'Create a growth flow',
    });
    await creation.waitFor();
    await creation.getByLabel('New craft name').fill('Research collaboration outreach');
    await creation
      .getByLabel('Growth objective')
      .fill('Create qualified research collaboration meetings');
    await creation.getByLabel('Growth audience').fill('University researchers and research directors');
    await creation.getByRole('button', { name: 'Create growth flow' }).click();
    await page.getByTestId('crafts-artboard').waitFor();
    await page.getByRole('tab', { name: 'MDX source' }).click();
    const custom = await page.getByTestId('craft-mdx-editor').inputValue();
    expect(custom).toMatch(/Create qualified research collaboration meetings/);
    expect(custom).toMatch(/University researchers and research directors/);
    expect(page.url()).toMatch(/\/dashboard\/growth\/personal-research-collaboration-outreach\/source$/);
    const mobile = await browser.newPage({
      viewport: { width: 390, height: 844 },
    });
    await mobile.goto('http://127.0.0.1:3100/dashboard/crafts', {
      waitUntil: 'domcontentloaded',
    });
    await mobile.getByTestId('craft-card-growth-profile').waitFor({ timeout: 40000 });
    expect(mobile.url()).toMatch(/\/dashboard\/growth$/);
    const bounds = await mobile.evaluate(() => ({
      viewport: document.documentElement.clientWidth,
      scroll: document.documentElement.scrollWidth,
    }));
    expect(bounds.scroll <= bounds.viewport + 1).toBeTruthy();
    expect(await mobile.getByTestId('studio-bottom-nav').isVisible()).toEqual(true);
    expect(await mobile.getByTestId('automation-navigation-sidebar').isVisible()).toEqual(false);
    await mobile.getByRole('button', { name: 'Workspace', exact: true }).click();
    expect(mobile.url()).toMatch(/\/dashboard\/workspace$/);
    await mobile.close();
  } finally {
    await browser.close();
    await app.close();
  }
});

test('planning-only Growth YAML opens without triggering Runner', async () => {
  const app = buildApp();
  const browser = await chromium.launch({ headless: true });
  try {
    await app.listen({ host: '127.0.0.1', port: 3101 });
    const page = await browser.newPage({ viewport: { width: 1280, height: 820 } });
    await page.goto('http://127.0.0.1:3100/dashboard/pipeline', {
      waitUntil: 'domcontentloaded',
    });
    const before = (await app.inject('/runs')).json().length;
    const modal = page.getByRole('dialog', { name: 'Workflow library' });
    await clickUntilVisible(page, page.getByRole('button', { name: 'Browse templates' }), modal);
    await modal.getByRole('searchbox', { name: 'Search workflows' }).fill('Personal brand positioning');
    const preview = modal.getByTestId('growth-template-pipeline-preview');
    await preview.waitFor();
    expect(await preview.innerText()).toMatch(/2 connected pipelines/);
    await modal.getByRole('button', { name: 'Inspect planning workflow' }).click();
    await modal.waitFor({ state: 'hidden' });
    const graph = page.getByTestId('growth-nested-artboard');
    await graph.getByTestId('growth-pipeline-node-discovery').waitFor();
    expect(await graph.locator('[data-testid^="growth-pipeline-node-"]').count()).toEqual(2);
    expect(await page.getByRole('button', { name: 'Start Growth workflow' }).count()).toEqual(0);
    await graph.getByTestId('growth-pipeline-node-discovery').click();
    await graph.getByTestId('growth-task-node-procedure').waitFor();
    expect(await graph.locator('[data-testid^="growth-task-node-"]').count()).toEqual(5);
    expect((await app.inject('/runs')).json().length).toEqual(before);
  } finally {
    await browser.close();
    await app.close();
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
    await studio.getByRole('textbox', { name: 'Your niche' }).fill('Software education');
    await studio
      .getByRole('textbox', { name: 'Research objective' })
      .fill('Improve technical community visibility');
    await studio
      .getByRole('textbox', { name: 'Your current LinkedIn headline' })
      .fill('Engineer and educator');
    await studio.getByRole('textbox', { name: 'Creator name' }).fill('Research sample');
    await studio
      .getByRole('textbox', { name: 'LinkedIn profile URL' })
      .fill('https://www.linkedin.com/in/sample-creator/');
    await studio
      .getByRole('textbox', { name: 'Observed headline' })
      .fill('Developer educator and software writer');
    await studio
      .getByRole('textbox', { name: 'Post permalink' })
      .fill('https://www.linkedin.com/posts/sample-creator_technical-activity-1234');
    await studio
      .getByRole('textbox', { name: 'Exact post excerpt' })
      .fill(
        'Technical writing for software development and community research using practical examples.',
      );
    const report = page.getByTestId('creator-research-report');
    const objective = report.getByText('Objective: Improve technical community visibility');
    await clickUntilVisible(
      page,
      studio.getByRole('button', { name: 'Run evidenced comparison' }),
      objective,
    );
    await objective.waitFor({ timeout: 15000 });
    expect(await report.innerText()).toMatch(/Evidence-linked results/);
    expect(await report.innerText()).toMatch(/Potential topics not present/);
    expect(await report.innerText()).toMatch(/Evidence post/);
    expect(await report.getByRole('link', { name: /YAML/ }).count()).toEqual(0);
    const histories = (await app.inject('/linkedin/research')).json() as Array<{
      id: string;
    }>;
    expect(histories.length > 0).toBeTruthy();
    const internal = await app.inject('/linkedin/research/' + histories[0]!.id + '/yaml');
    expect(internal.statusCode).toEqual(200);
    expect(internal.body).toMatch(/validate-submitted-sources/);
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
    expect(research.statusCode).toEqual(201);
    const researchRun = research.json() as { id: string };
    const page = await browser.newPage();
    await page.goto('http://127.0.0.1:3100/dashboard/editorial', {
      waitUntil: 'domcontentloaded',
    });
    const studio = page.getByTestId('linkedin-editorial-studio');
    await studio.waitFor({ state: 'visible' });
    await studio.getByRole('combobox', { name: 'Saved LinkedIn account' }).selectOption(savedAccount.id);
    await studio
      .getByRole('combobox', { name: /Evidence from Creator Research/ })
      .selectOption(researchRun.id);
    await studio
      .getByRole('textbox', { name: /Post draft/ })
      .fill(
        'An evidence-backed explanation of technical writing and hands-on software education for learners.',
      );
    await studio.getByRole('button', { name: 'Create private draft' }).click();
    await studio.getByText(/Draft saved to your private workspace/).waitFor();
    await studio.getByRole('button', { name: 'Approve reviewed draft' }).click();
    await studio.getByText(/Draft is now approved/).waitFor();
    expect(
      await studio.getByRole('button', { name: 'Publish approved post to LinkedIn' }).isDisabled(),
    ).toEqual(true);
    expect(await studio.getByRole('link', { name: /YAML/ }).count()).toEqual(0);
    const written = (await app.inject('/linkedin/drafts')).json() as Array<{
      id: string;
    }>;
    expect(written.length > 0).toBeTruthy();
    const snapshot = await app.inject('/linkedin/drafts/' + written[0]!.id + '/yaml');
    expect(snapshot.statusCode).toEqual(200);
    expect(snapshot.body).toMatch(/externalPublishing: "not-performed"/);
    await page.reload({ waitUntil: 'domcontentloaded' });
    await studio.getByText(/Saved drafts/).waitFor();
    const savedDraft = studio.locator('section').last().getByRole('button').first();
    await savedDraft.click();
    await studio.getByRole('button', { name: 'Reopen for edits' }).click();
    await studio.getByText(/Draft is now draft/).waitFor();
    const report = await app.inject('/linkedin/drafts');
    expect(report.statusCode).toEqual(200);
    const rows = report.json() as Array<{
      accountId: string;
      content: { researchRunId: string; sourceUrls: string[] };
    }>;
    expect(
      rows.some(
        (row) =>
          row.accountId === savedAccount.id &&
          row.content.researchRunId === researchRun.id &&
          row.content.sourceUrls.length > 0,
      ),
    ).toBeTruthy();
  } finally {
    await browser.close();
    await app.close();
    await removeTemp(root);
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
    await page.getByTestId('craft-card-growth-jobs').waitFor({ timeout: 40000 });
    await catalog.getByRole('button', { name: 'LinkedIn capabilities' }).click();
    expect(await page.locator('[data-testid^="craft-card-"]').count()).toEqual(15);
    await page.getByTestId('craft-card-growth-jobs').click();
    const detail = page.getByTestId('growth-capability-details');
    await detail
      .getByRole('heading', {
        name: 'Job search & career opportunity pipeline',
      })
      .waitFor();
    expect(await detail.innerText()).toMatch(/Planned/);
    expect(await detail.getByRole('link', { name: 'Open existing supported workflow' }).count()).toEqual(
      0,
    );
    await page.getByRole('button', { name: 'Growth library' }).click();
    await catalog.waitFor();
    await catalog.getByRole('textbox', { name: 'Search crafts' }).fill('creator');
    await page.getByTestId('craft-card-growth-competitors').waitFor();
    await catalog.getByRole('textbox', { name: 'Search crafts' }).fill('');
    await page.getByTestId('craft-card-growth-profile').click();
    await detail.getByText('20 profile sections requiring independent evidence and coverage').waitFor();
    await detail.getByRole('link', { name: 'Open existing supported workflow' }).click();
    await page.waitForURL('**/dashboard/profile');
    await page
      .getByTestId('automation-navigation-sidebar')
      .getByRole('button', { name: 'Growth', exact: true })
      .click();
    await catalog.waitFor();
    await page.setViewportSize({ width: 390, height: 844 });
    await page.getByTestId('craft-card-growth-company').click();
    await detail.getByRole('heading', { name: 'Company Page & organization growth' }).waitFor();
    expect(await detail.getByRole('link', { name: 'Open existing supported workflow' }).count()).toEqual(
      0,
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
    await clickUntilVisible(page, page.getByTestId('floating-connector-button'), dialog);
    await dialog.getByTestId('linkedin-connector').waitFor();
    await page.setViewportSize({ width: 390, height: 760 });
    expect(await dialog.getByRole('heading', { name: 'LinkedIn', exact: true }).count()).toEqual(1);
    expect(
      await dialog.getByRole('textbox', { name: /profile address|username|handle/i }).count(),
    ).toEqual(0);
    await dialog.getByRole('button', { name: 'Connect LinkedIn', exact: true }).waitFor();
    const before = (await app.inject('/account')).json() as {
      socialAccounts: unknown[];
    };
    expect(before.socialAccounts.length).toEqual(0);
    await page.keyboard.press('Escape');
    await page.goto('http://127.0.0.1:3100/dashboard/profile/connections', {
      waitUntil: 'domcontentloaded',
    });
    const owner = page.getByTestId('owner-profile-page');
    await owner.waitFor();
    await owner.getByText('No verified account linked.').first().waitFor();
    expect(await owner.getByText('No verified account linked.').count()).toEqual(5);
    expect(await owner.getByRole('button', { name: 'Add profile' }).count()).toEqual(0);
    await owner.getByRole('button', { name: 'Manage connections' }).click();
    await dialog.waitFor({ state: 'visible' });
    await dialog.getByRole('button', { name: 'Connect LinkedIn', exact: true }).waitFor();
    const after = (await app.inject('/account')).json() as {
      socialAccounts: unknown[];
    };
    expect(after.socialAccounts.length).toEqual(0);
  } finally {
    await browser.close();
    await app.close();
    await removeTemp(root);
  }
});

test('Growth profile YAML uses one Artboard canvas, drill-down, and real controls', {
  timeout: 90000,
}, async () => {
  const app = buildApp();
  const browser = await chromium.launch({ headless: true });
  try {
    await app.listen({ host: '127.0.0.1', port: 3101 });
    const page = await browser.newPage({ viewport: { width: 1320, height: 900 } });
    await page.goto('http://127.0.0.1:3100/dashboard/pipeline', {
      waitUntil: 'domcontentloaded',
    });
    const before = (await app.inject('/runs')).json().length;
    const modal = page.getByRole('dialog', { name: 'Workflow library' });
    await clickUntilVisible(page, page.getByRole('button', { name: 'Browse templates' }), modal);
    await modal.getByRole('searchbox', { name: 'Search workflows' }).fill('Profile auditing');
    await modal.getByTestId('growth-template-option').click();
    const preview = modal.getByTestId('growth-template-pipeline-preview');
    await preview.waitFor();
    expect(await preview.innerText()).toMatch(/6 connected pipelines/);
    await modal.getByRole('button', { name: 'Open YAML workflow' }).click();
    await modal.waitFor({ state: 'hidden' });
    const artboard = page.getByTestId('workflow-artboard');
    const graph = artboard.getByTestId('growth-nested-artboard');
    await graph.getByTestId('growth-pipeline-node-identity').waitFor();
    expect(await artboard.locator('.react-flow').count()).toEqual(1);
    expect(await page.getByTestId('growth-profile-program').count()).toEqual(0);
    await page.getByRole('button', { name: 'Workflow execution and evidence' }).click();
    const details = page.getByTestId('growth-workspace-details');
    await details.waitFor({ state: 'visible' });
    await details.getByRole('link', { name: 'View source YAML' }).waitFor();
    expect(await details.innerText()).toMatch(/existing Runner/);
    await page.keyboard.press('Escape');
    await details.waitFor({ state: 'hidden' });
    expect(await graph.locator('[data-testid^="growth-pipeline-node-"]').count()).toEqual(6);
    await graph.locator('.react-flow__edge').first().waitFor({
      state: 'attached',
      timeout: 15000,
    });
    expect(await graph.locator('.react-flow__edge').count()).toEqual(5);
    for (const path of await graph.locator('.react-flow__edge path.react-flow__edge-path').all()) {
      expect((await path.getAttribute('d')) ?? '').toMatch(/^M/);
    }
    await graph.getByTestId('growth-pipeline-node-identity').click();
    await graph.getByTestId('growth-task-node-start').waitFor();
    await graph.getByTestId('growth-task-node-session').waitFor();
    expect((await graph.locator('[data-testid^="growth-task-node-"]').count()) >= 4).toBeTruthy();
    await graph.getByTestId('growth-task-node-start').click();
    const taskDetails = page.getByTestId('growth-task-details');
    await taskDetails.waitFor({ state: 'visible' });
    expect(await taskDetails.innerText()).toMatch(/Read-only source configuration/);
    expect(await taskDetails.innerText()).toMatch(/Step kind/);
    await page.keyboard.press('Escape');
    await taskDetails.waitFor({ state: 'hidden' });
    await graph.getByRole('button', { name: 'Back to pipelines' }).click();
    await graph.getByTestId('growth-pipeline-node-identity').waitFor();
    expect((await app.inject('/runs')).json().length).toEqual(before);
  } finally {
    await browser.close();
    await app.close();
  }
});

test('planning-only Growth YAML stays read-only and cannot launch Runner', {
  timeout: 90000,
}, async () => {
  const app = buildApp();
  const browser = await chromium.launch({ headless: true });
  try {
    await app.listen({ host: '127.0.0.1', port: 3101 });
    const page = await browser.newPage({ viewport: { width: 1280, height: 820 } });
    await page.goto('http://127.0.0.1:3100/dashboard/pipeline', {
      waitUntil: 'domcontentloaded',
    });
    const before = (await app.inject('/runs')).json().length;
    const modal = page.getByRole('dialog', { name: 'Workflow library' });
    await clickUntilVisible(page, page.getByRole('button', { name: 'Browse templates' }), modal);
    await modal.getByRole('searchbox', { name: 'Search workflows' }).fill('Personal brand positioning');
    const preview = modal.getByTestId('growth-template-pipeline-preview');
    await preview.waitFor();
    expect(await preview.innerText()).toMatch(/2 connected pipelines/);
    await modal.getByRole('button', { name: 'Inspect planning workflow' }).click();
    await modal.waitFor({ state: 'hidden' });
    const graph = page.getByTestId('workflow-artboard').getByTestId('growth-nested-artboard');
    await graph.getByTestId('growth-pipeline-node-discovery').waitFor();
    expect(await graph.locator('[data-testid^="growth-pipeline-node-"]').count()).toEqual(2);
    await graph.getByTestId('growth-pipeline-node-discovery').click();
    await graph.getByTestId('growth-task-node-todo').waitFor();
    await graph.getByTestId('growth-task-node-procedure').waitFor();
    expect(await graph.locator('[data-testid^="growth-task-node-"]').count()).toEqual(5);
    expect(await page.getByTestId('workflow-artboard').locator('.react-flow').count()).toEqual(1);
    await page.getByRole('button', { name: 'Workflow execution and evidence' }).click();
    const details = page.getByTestId('growth-workspace-details');
    await details.waitFor({ state: 'visible' });
    expect(await details.innerText()).toMatch(/Planning-only YAML/);
    expect(await details.getByRole('button', { name: 'Start Growth workflow' }).count()).toEqual(0);
    expect(await page.getByRole('button', { name: 'Start Growth workflow' }).count()).toEqual(0);
    expect((await app.inject('/runs')).json().length).toEqual(before);
  } finally {
    await browser.close();
    await app.close();
  }
});

test('Local Chrome attachment keeps the external process alive across connector tab cleanup', {
  timeout: 45000,
}, async () => {
  const { BrowserSession } = await import('../src/infrastructure/browser/session.js');
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
  const saved = Object.fromEntries(keys.map((key) => [key, process.env[key]]));
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
    expect(external.isConnected()).toEqual(true);
    await second.currentPage!.setContent('<main>second connection works</main>');
    expect(await second.currentPage!.locator('main').innerText()).toEqual('second connection works');
    await second.close();
    expect(external.isConnected()).toEqual(true);
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
});

test('blank Artboard opens action templates without creating or running defaults', {
  timeout: 90000,
}, async () => {
  const app = buildApp();
  const browser = await chromium.launch({ headless: true });
  try {
    await app.listen({ host: '127.0.0.1', port: 3101 });
    const page = await browser.newPage({ viewport: { width: 1280, height: 820 } });
    const posts: string[] = [];
    page.on('request', (request) => {
      if (request.method() === 'POST' && /\/api\/workflows\/?$/.test(request.url()))
        posts.push(request.url());
    });
    await page.goto('http://127.0.0.1:3100/dashboard/workspace', {
      waitUntil: 'domcontentloaded',
    });
    await page.getByTestId('workflow-empty-state').waitFor();
    expect(await page.getByTestId('workflow-artboard').locator('.react-flow').count()).toEqual(0);
    expect(await page.getByRole('button', { name: 'Start workflow' }).count()).toEqual(0);
    expect(posts.length).toEqual(0);
    const modal = page.getByRole('dialog', { name: 'Workflow library' });
    await clickUntilVisible(page, page.getByRole('button', { name: 'Browse templates' }), modal);
    await modal.getByRole('button', { name: 'Action templates' }).click();
    await modal.getByTestId('action-template-option').first().waitFor();
    const preview = modal.getByTestId('action-template-preview');
    expect(await preview.innerText()).toMatch(/validated Runner stages/i);
    await preview.getByRole('button', { name: 'Use this template' }).click();
    await page.getByTestId('workflow-node-start').waitFor();
    expect(await page.getByTestId('workflow-artboard').locator('.react-flow').count()).toEqual(1);
    expect(posts.length).toEqual(1);
    expect((await app.inject('/runs')).json().length).toEqual(0);
    await page.getByRole('button', { name: 'Back to workspace' }).click();
    await page.getByTestId('workflow-empty-state').waitFor();
    expect(await page.getByTestId('workflow-node-start').count()).toEqual(0);
    await page.getByRole('button', { name: 'Create new workflow' }).click();
    await page.getByTestId('workflow-node-start').waitFor();
    await page.getByRole('button', { name: 'Back to workspace' }).click();
    const confirmation = page.getByTestId('workflow-leave-confirmation');
    await confirmation.waitFor({ state: 'visible' });
    await confirmation.getByRole('button', { name: 'Keep editing' }).click();
    await confirmation.waitFor({ state: 'hidden' });
    expect(await page.getByTestId('workflow-node-start').count()).toEqual(1);
    await page.getByRole('button', { name: 'Back to workspace' }).click();
    await confirmation.getByRole('button', { name: 'Discard draft' }).click();
    await page.getByTestId('workflow-empty-state').waitFor();
    expect(posts.length).toEqual(1);
  } finally {
    await browser.close();
    await app.close();
  }
});
