import { expect, type Page, type TestInfo, test } from '@playwright/test';
import axe from 'axe-core';
import {
  connectorAccount,
  installConnectorApi,
  iso,
  openConnectorDialog,
} from './support/connector-mocks';

const mobileBrowser = (page: Page) =>
  page.evaluate(() => /Android|iPhone|iPad|iPod/i.test(navigator.userAgent));

async function capture(page: Page, info: TestInfo, label: string) {
  await info.attach(`${label}.png`, {
    body: await page.screenshot({ animations: 'disabled' }),
    contentType: 'image/png',
  });
}

async function assertLayout(page: Page) {
  const problems = await page.evaluate(() => {
    const dialog = document.querySelector<HTMLDialogElement>(
      '[data-testid="connector-onboarding-dialog"]',
    );
    if (!dialog) return ['Connection dialog missing'];
    const issues: string[] = [];
    if (document.documentElement.scrollWidth > window.innerWidth + 1)
      issues.push('Document overflows the viewport horizontally');
    if (dialog.scrollWidth > dialog.clientWidth + 1)
      issues.push('Dialog content overflows horizontally');
    for (const button of dialog.querySelectorAll<HTMLButtonElement>('button')) {
      const bounds = button.getBoundingClientRect();
      if (!bounds.width || !bounds.height) continue;
      const name =
        button.getAttribute('aria-label') ||
        button.textContent?.trim() ||
        'unlabelled button';
      if (bounds.width < 43.5 || bounds.height < 43.5)
        issues.push(`${name} has a touch target smaller than 44x44px`);
      if (bounds.left < -1 || bounds.right > window.innerWidth + 1)
        issues.push(`${name} lies outside the viewport horizontally`);
    }
    return issues;
  });
  expect(problems, problems.join('\n')).toEqual([]);
}

async function assertAxe(page: Page, info: TestInfo, label: string) {
  await page.addScriptTag({ content: axe.source });
  const result = await page.evaluate(async () => {
    const audit = (window as Window & { axe?: typeof axe }).axe;
    if (!audit) throw new Error('axe-core did not load in the test browser');
    const dialog = document.querySelector(
      '[data-testid="connector-onboarding-dialog"]',
    );
    if (!dialog) throw new Error('Missing connector dialog');
    return audit.run(dialog, {
      runOnly: {
        type: 'tag',
        values: ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa'],
      },
    });
  });
  await info.attach(`accessibility-${label}.json`, {
    body: Buffer.from(
      JSON.stringify(
        {
          violations: result.violations,
          passes: result.passes.map((item) => item.id),
          incomplete: result.incomplete.map((item) => item.id),
        },
        null,
        2,
      ),
    ),
    contentType: 'application/json',
  });
  const failures = result.violations.map(
    (item) =>
      item.id +
      ' (' +
      item.impact +
      '): ' +
      item.nodes.map((node) => node.target.join(' ')).join(', '),
  );
  expect(failures, failures.join('\n')).toEqual([]);
}

test('provider icons have one consistent size and no redundant status graphics', async ({
  page,
}) => {
  await installConnectorApi(page, []);
  const dialog = await openConnectorDialog(page);
  const choices = dialog.locator('[aria-label="Social networks"] button');
  await expect(choices).toHaveCount(2);
  await dialog.getByRole('button', { name: /Other networks/ }).click();
  await expect(
    dialog.getByRole('button', { name: /Other networks/ }),
  ).toHaveAttribute('aria-expanded', 'true');
  const icons = dialog.getByTestId('linkedin-connector').locator('svg');
  await expect(icons).toHaveCount(5);
  const dimensions = await icons.evaluateAll((elements) =>
    elements.map((element) => {
      const rect = element.getBoundingClientRect();
      return { width: rect.width, height: rect.height };
    }),
  );
  for (const icon of dimensions) {
    expect(icon.width).toBeGreaterThanOrEqual(19);
    expect(icon.width).toBeLessThanOrEqual(21);
    expect(icon.height).toBeGreaterThanOrEqual(19);
    expect(icon.height).toBeLessThanOrEqual(21);
  }
  await expect(
    dialog.getByTestId('linkedin-connector').locator('svg'),
  ).toHaveCount(5);
  await expect(
    dialog.locator('[aria-label="Connection progress"]'),
  ).toHaveCount(0);
  const title = dialog.getByRole('heading', {
    name: 'Connect your social accounts',
  });
  const titleSize = await title.evaluate((element) =>
    parseFloat(getComputedStyle(element).fontSize),
  );
  expect(titleSize).toBeGreaterThanOrEqual(20);
  const width = await dialog.evaluate(
    (element) => element.getBoundingClientRect().width,
  );
  expect(width).toBeLessThanOrEqual(700);
  await assertLayout(page);
});

test('provider choices, connection CTA, and the full dialog fit the active viewport', async ({
  page,
}, info) => {
  await installConnectorApi(page, []);
  const dialog = await openConnectorDialog(page);
  await expect(
    dialog.getByRole('button', { name: 'LinkedIn', exact: true }),
  ).toHaveAttribute('aria-pressed', 'true');
  const primaryAction = dialog.getByRole('button', {
    name: 'Connect LinkedIn',
    exact: true,
  });
  await expect(primaryAction).toBeVisible();
  if (info.project.name === 'small-mobile-chromium') {
    const actionBounds = await primaryAction.evaluate((element) => {
      const button = element.getBoundingClientRect();
      const modal = element.closest('dialog')?.getBoundingClientRect();
      return { buttonBottom: button.bottom, modalBottom: modal?.bottom ?? 0 };
    });
    expect(
      actionBounds.buttonBottom,
      'The Connect action should be on screen without scrolling',
    ).toBeLessThanOrEqual(actionBounds.modalBottom - 4);
  }
  await assertLayout(page);
  await capture(page, info, 'linkedin-unlinked');

  await dialog.getByRole('button', { name: /Other networks/ }).click();
  await dialog.getByRole('button', { name: 'Instagram' }).click();
  await expect(dialog.getByTestId('connector-status')).toHaveText(
    'Unavailable',
  );
  await expect(
    dialog.getByText(/Official API connector not available yet/),
  ).toBeVisible();
  await assertLayout(page);
  await capture(page, info, 'provider-unavailable');

  await dialog.getByRole('button', { name: 'LinkedIn', exact: true }).click();
  const connect = dialog.getByRole('button', {
    name: 'Connect LinkedIn',
    exact: true,
  });
  await connect.scrollIntoViewIfNeeded();
  if (await mobileBrowser(page)) {
    await expect(connect).toBeDisabled();
    await expect(
      dialog.getByText(/Mobile Chrome and Safari cannot share/),
    ).toBeVisible();
  } else {
    await expect(connect).toBeEnabled();
  }
});

test('connected accounts remain legible, usable and unclipped', async ({
  page,
}, info) => {
  await installConnectorApi(page, [
    connectorAccount('linkedin', {
      id: 'visual-linked',
      label:
        'A long professional profile display name for small viewport layout coverage',
      handle: 'an-unusually-long-professional-profile-handle',
      status: 'connected',
      verifiedAt: iso.now(),
    }),
  ]);
  const dialog = await openConnectorDialog(page);
  await expect(dialog.getByTestId('connector-status')).toHaveText(
    'Session connected',
  );
  const name = dialog.getByText(/long professional profile display name/);
  const handle = dialog.getByText(
    '@an-unusually-long-professional-profile-handle',
  );
  await expect(name).toBeVisible();
  await expect(handle).toBeVisible();
  // A hidden CSS ellipsis is not readable on compact screens.
  expect(
    await name.evaluate(
      (element) => element.scrollWidth <= element.clientWidth + 1,
    ),
  ).toBe(true);
  expect(
    await handle.evaluate(
      (element) => element.scrollWidth <= element.clientWidth + 1,
    ),
  ).toBe(true);
  await assertLayout(page);
  await capture(page, info, 'linkedin-connected');
  await expect(
    dialog.getByRole('button', { name: 'Disconnect', exact: true }),
  ).toBeVisible();
  await dialog.getByRole('button', { name: 'Disconnect', exact: true }).click();
  await expect(
    dialog.getByRole('button', { name: 'Confirm disconnect' }),
  ).toBeVisible();
  await assertLayout(page);
  await dialog.getByRole('button', { name: 'Cancel', exact: true }).click();
  await expect(dialog.getByTestId('connector-status')).toHaveText(
    'Session connected',
  );
});

test('WCAG A and AA checks cover unlinked, unavailable, and connected provider states', async ({
  page,
}, info) => {
  await installConnectorApi(page, [
    connectorAccount('linkedin', {
      id: 'a11y-connected',
      status: 'connected',
      verifiedAt: iso.now(),
    }),
  ]);
  const dialog = await openConnectorDialog(page);
  await assertAxe(page, info, 'connected');
  await dialog.getByRole('button', { name: /Other networks/ }).click();
  await dialog.getByRole('button', { name: 'GitHub' }).click();
  await assertAxe(page, info, 'unavailable');
  await dialog.getByRole('button', { name: 'X', exact: true }).click();
  await assertAxe(page, info, 'unlinked');
});

test('network errors are shown as recoverable feedback', async ({
  page,
}, info) => {
  await installConnectorApi(page, [], (event) =>
    event.method === 'GET' ? { status: 503 } : undefined,
  );
  const dialog = await openConnectorDialog(page);
  await expect(dialog.getByRole('alert')).toContainText(
    'Social connections unavailable',
  );
  await assertLayout(page);
  await capture(page, info, 'network-error');
  await expect(
    dialog.getByRole('button', { name: 'LinkedIn', exact: true }),
  ).toBeEnabled();
});

test('native dialog traps keyboard focus and closes on Escape', async ({
  page,
}) => {
  await installConnectorApi(page, []);
  const dialog = await openConnectorDialog(page);
  await expect(dialog).toBeVisible();
  for (let i = 0; i < 12; i++) {
    await page.keyboard.press('Tab');
    const focusInside = await dialog.evaluate((element) =>
      element.contains(document.activeElement),
    );
    expect(focusInside, 'Tab focus must remain within the open modal').toBe(
      true,
    );
  }
  await page.keyboard.press('Escape');
  await expect(dialog).toBeHidden();
});

test('dashboard navigation stays usable after extracting the shell', async ({
  page,
}) => {
  await page.goto('/dashboard/pipeline');
  const history = page.getByRole('button', { name: 'Run history' });
  await expect(history).toBeVisible();
  await history.click();
  await expect(page).toHaveURL(/\/dashboard\/history$/);
  await page.getByRole('button', { name: 'Workspace', exact: true }).click();
  await expect(page).toHaveURL(/\/dashboard\/workspace$/);
});

test('Mator dock has a usable empty state, thread history, model picker, and voice-only switch', async ({
  page,
}, info) => {
  await page.route('**/api/mator/models', async (route) =>
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        models: [
          {
            id: 'openai/gpt-oss-20b',
            name: 'GPT-OSS 20B',
            label: 'Fast reasoning chat',
            role: 'chat',
            tier: 'free',
            price: 'Free',
            notes: 'Chat model',
          },
        ],
        voices: [],
      }),
    }),
  );

  await page.route('**/api/mator/settings', async (route) =>
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        groqKeyConfigured: false,
        keySource: 'none',
        autoApprove: false,
        squashPipelineHistory: false,
        howTtsEnabled: false,
        moderationEnabled: true,
        modelId: 'openai/gpt-oss-20b',
        modelName: 'GPT-OSS 20B',
        modelLabel: 'Fast reasoning chat',
        modelTier: 'free',
        modelPrice: 'Free',
        reasoningEffort: 'medium',
        visionModelId: '',
        sttModelId: '',
        ttsModelId: '',
        ttsVoice: '',
      }),
    }),
  );

  await page.goto('/dashboard/pipeline');
  const dock = page.getByTestId('mator-chat');
  if (!(await dock.isVisible())) {
    await page.getByRole('button', { name: 'Open Mator' }).click();
  }

  await expect(dock).toBeVisible();
  await expect(dock.getByTestId('mator-input')).toBeVisible();
  await expect(dock.getByTestId('mator-empty-thread')).toBeVisible();
  await expect(dock.getByTestId('mator-model-selector')).toBeVisible();

  await dock.getByTestId('mator-thread-pill').click();
  await expect(dock.getByTestId('mator-conversation-switcher')).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(dock.getByTestId('mator-conversation-switcher')).toBeHidden();

  await dock.getByTestId('mator-settings-trigger').click();
  await expect(
    dock.getByRole('dialog', { name: 'Chat settings' }),
  ).toBeVisible();
  await expect(
    dock.getByRole('slider', { name: 'Reasoning effort' }),
  ).toHaveValue('1');
  await page.keyboard.press('Escape');

  await dock.getByTestId('mator-voice-switch').click();
  await expect(dock.getByTestId('mator-composer')).toHaveAttribute(
    'data-mode',
    'voice-only',
  );
  await expect(dock.getByTestId('mator-voice-switch')).toHaveAttribute(
    'aria-checked',
    'true',
  );
  await dock.getByTestId('mator-voice-switch').click();
  await expect(dock.getByTestId('mator-composer')).toHaveAttribute(
    'data-mode',
    'text',
  );
  await capture(page, info, 'mator-dock-text-first');
});

test('Mator renders persisted messages and staged cards without clipping narrow viewports', async ({
  page,
}, info) => {
  const now = '2026-11-01T09:00:00.000Z';
  const shortText = 'Hi Mator';
  const longText = `Review this professional credential: ${'credential'.repeat(24)}`;
  const assistantText = `I can review this evidence: ${'evidence'.repeat(26)}`;
  const confirmationText = `Review this proposal: ${'approval'.repeat(26)}`;
  const workflowId = 'mator-layout-workflow';
  const conversationId = 'mator-layout-thread';
  const plan = {
    version: 1,
    platform: 'linkedin',
    action: 'audit',
    name: 'Profile audit',
    steps: [
      { id: 'start', kind: 'start', title: 'Start run' },
      { id: 'session', kind: 'session', title: 'Authenticated browser' },
      { id: 'action', kind: 'action', title: 'Inspect page' },
      { id: 'finish', kind: 'finish', title: 'Final output' },
    ],
    links: [
      { source: 'start', target: 'session' },
      { source: 'session', target: 'action' },
      { source: 'action', target: 'finish' },
    ],
  };
  await page.route('**/api/workflows', (route) =>
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify([
        {
          id: workflowId,
          ownerId: 'local-owner',
          templateId: null,
          revision: 1,
          createdAt: now,
          updatedAt: now,
          plan,
        },
      ]),
    }),
  );
  await page.route('**/api/mator/workflows/*/conversations', (route) =>
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        currentId: conversationId,
        items: [
          {
            id: conversationId,
            workflowId,
            title: 'Layout regression',
            createdAt: now,
            updatedAt: now,
            lastMessageAt: now,
            boundRevisionId: null,
          },
        ],
      }),
    }),
  );
  await page.route('**/api/mator/conversations/*/events', (route) =>
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify([
        {
          id: 'short-user-message',
          conversationId,
          role: 'user',
          kind: 'message',
          text: shortText,
          createdAt: now,
        },
        {
          id: 'long-user-message',
          conversationId,
          role: 'user',
          kind: 'message',
          text: longText,
          createdAt: '2026-11-01T09:00:01.000Z',
        },
        {
          id: 'assistant-message',
          conversationId,
          role: 'assistant',
          kind: 'message',
          text: assistantText,
          createdAt: '2026-11-01T09:00:02.000Z',
        },
        {
          id: 'informational-noop',
          conversationId,
          role: 'assistant',
          kind: 'action',
          action: { type: 'noop', reason: 'No workflow changes' },
          status: 'applied',
          text: 'No operation',
          createdAt: '2026-11-01T09:00:02.500Z',
        },
        {
          id: 'staged-change',
          conversationId,
          role: 'assistant',
          kind: 'action',
          status: 'staged',
          action: { type: 'edit_step' },
          text: confirmationText,
          createdAt: '2026-11-01T09:00:03.000Z',
        },
      ]),
    }),
  );

  await page.goto('/dashboard/pipeline');
  const dock = page.getByTestId('mator-chat');
  if (!(await dock.isVisible())) {
    await page.getByRole('button', { name: 'Open Mator' }).click();
  }
  const messages = dock.locator('[data-slot="message"]');
  const shortRow = messages.filter({ hasText: shortText });
  const longRow = messages.filter({ hasText: longText });
  const shortContent = shortRow.locator('[data-slot="message-content"]');
  const longContent = longRow.locator('[data-slot="message-content"]');
  const confirm = dock.getByTestId('mator-confirmation');

  await expect(shortContent).toBeVisible();
  await expect(longContent).toBeVisible();
  await expect(confirm).toBeVisible();
  await expect(dock.getByTestId('mator-confirmation')).toHaveCount(1);
  await expect(dock.getByText('No operation')).toHaveCount(0);
  await expect(dock.getByText(assistantText)).toBeVisible();

  const metrics = await dock.evaluate((element) => {
    const rows = [
      ...element.querySelectorAll<HTMLElement>('[data-slot="message"]'),
    ];
    const findRow = (value: string) =>
      rows.find((row) => row.textContent?.includes(value));
    const short = findRow('Hi Mator');
    const long = findRow('credential'.repeat(24));
    const shortBubble = short?.querySelector<HTMLElement>(
      '[data-slot="bubble"]',
    );
    const longBubble = long?.querySelector<HTMLElement>('[data-slot="bubble"]');
    const confirmCard = element.querySelector<HTMLElement>(
      '[data-testid="mator-confirmation"]',
    );
    const assistant = findRow('evidence'.repeat(26));
    const assistantText = assistant?.querySelector<HTMLElement>('p');
    const confirmationText = confirmCard?.querySelector<HTMLElement>('p');
    const shortAvatar = short?.querySelector<HTMLElement>(
      '[data-slot="avatar"]',
    );
    const longAvatar = long?.querySelector<HTMLElement>('[data-slot="avatar"]');
    if (
      !shortBubble ||
      !longBubble ||
      !confirmCard ||
      !assistantText ||
      !confirmationText ||
      !shortAvatar ||
      !longAvatar ||
      !short ||
      !long
    )
      return null;
    const shortBox = shortBubble.getBoundingClientRect();
    const longBox = longBubble.getBoundingClientRect();
    const confirmationBox = confirmCard.getBoundingClientRect();
    const dockBox = element.getBoundingClientRect();
    const shortAvatarBox = shortAvatar.getBoundingClientRect();
    const longAvatarBox = longAvatar.getBoundingClientRect();
    const assistantBox = assistantText.getBoundingClientRect();
    return {
      shortWidth: shortBox.width,
      shortUserBubbleLeft: shortBox.left,
      assistantReplyLeft: assistantBox.left,
      shortBubbleToAvatar: shortAvatarBox.left - shortBox.right,
      longBubbleToAvatar: longAvatarBox.left - longBox.right,
      shortAvatarToRowRight:
        short.getBoundingClientRect().right - shortAvatarBox.right,
      longAvatarToRowRight:
        long.getBoundingClientRect().right - longAvatarBox.right,
      userSideIsEnd:
        short
          .closest('[data-message-side]')
          ?.getAttribute('data-message-side') === 'end',
      assistantSideIsStart: assistant?.getAttribute('data-align') === 'start',
      longWidth: longBox.width,
      confirmWidth: confirmationBox.width,
      dockWidth: dockBox.width,
      longOverflow: longBubble.scrollWidth - longBubble.clientWidth,
      assistantOverflow: assistantText.scrollWidth - assistantText.clientWidth,
      confirmationOverflow:
        confirmationText.scrollWidth - confirmationText.clientWidth,
      messageVisible: shortBubble.textContent?.includes('Hi Mator'),
    };
  });
  expect(
    metrics,
    'Rendered chat bubbles and staged card must be present',
  ).not.toBeNull();
  if (!metrics) throw Error('Expected a measured Mator chat layout');
  expect(metrics.messageVisible).toBe(true);
  expect(metrics?.shortWidth).toBeGreaterThan(55);
  expect(
    metrics?.userSideIsEnd,
    'a persisted user turn must align to the right',
  ).toBe(true);
  expect(
    metrics?.assistantSideIsStart,
    'a Mator reply must align to the left',
  ).toBe(true);
  expect(
    metrics?.shortUserBubbleLeft - metrics?.assistantReplyLeft,
    'user text is visually to the right of Mator',
  ).toBeGreaterThan(36);
  for (const gap of [
    metrics?.shortBubbleToAvatar,
    metrics?.longBubbleToAvatar,
  ]) {
    expect(
      gap,
      'user bubble should sit beside the right-side ME avatar',
    ).toBeGreaterThanOrEqual(-1);
    expect(gap).toBeLessThanOrEqual(24);
  }
  for (const gap of [
    metrics?.shortAvatarToRowRight,
    metrics?.longAvatarToRowRight,
  ]) {
    expect(
      gap,
      'ME avatar stays anchored to the right edge',
    ).toBeGreaterThanOrEqual(-1);
    expect(gap).toBeLessThanOrEqual(2);
  }
  expect(metrics?.shortWidth).toBeLessThan(metrics?.dockWidth * 0.72);
  expect(metrics?.longWidth).toBeLessThanOrEqual(metrics?.dockWidth);
  expect(metrics?.confirmWidth).toBeLessThanOrEqual(
    Math.min(metrics?.dockWidth, 485),
  );
  expect(metrics?.longOverflow).toBeLessThanOrEqual(1);
  expect(metrics?.assistantOverflow).toBeLessThanOrEqual(1);
  expect(metrics?.confirmationOverflow).toBeLessThanOrEqual(1);
  const viewport = dock.getByTestId('mator-thread-viewport');
  await viewport.evaluate((element) => {
    element.scrollTop = element.scrollHeight;
  });
  const tail = await viewport.evaluate((element) => {
    const lastCard = element.querySelector<HTMLElement>(
      '[data-testid="mator-confirmation"]',
    );
    return lastCard
      ? {
          gap:
            element.getBoundingClientRect().bottom -
            lastCard.getBoundingClientRect().bottom,
          pixelTolerance: 1 / window.devicePixelRatio,
        }
      : null;
  });
  expect(tail, 'the final confirmation should be measurable').not.toBeNull();
  if (!tail) throw Error('Expected a measurable final confirmation');
  // Fractional browser layout may overlap the viewport edge by less than one device pixel.
  // Keep the strict 48px upper bound so an anchored-message whitespace regression still fails.
  expect(
    tail?.gap,
    'last chat row stays near the composer',
  ).toBeGreaterThanOrEqual(-tail?.pixelTolerance);
  expect(tail?.gap).toBeLessThanOrEqual(48);
  await capture(page, info, 'mator-content-width-regression');
});

test('Mator sends text, preserves failed drafts, and places the newest reply last', async ({
  page,
}, info) => {
  const workflowId = '11111111-1111-4111-8111-111111111111';
  const conversationId = '22222222-2222-4222-8222-222222222222';
  const now = '2026-11-01T09:00:00.000Z';
  const plan = {
    version: 1,
    platform: 'linkedin',
    action: 'audit',
    name: 'Profile audit',
    steps: [
      { id: 'start', kind: 'start', title: 'Start run' },
      { id: 'finish', kind: 'finish', title: 'Final output' },
    ],
    links: [{ source: 'start', target: 'finish' }],
  };
  let events: Array<{
    id: string;
    conversationId: string;
    role: string;
    kind: string;
    text: string;
    createdAt: string;
  }> = [];
  let failNext = false;
  const sent: string[] = [];

  await page.route('**/api/workflows', (route) =>
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify([
        {
          id: workflowId,
          ownerId: 'local-owner',
          templateId: null,
          revision: 1,
          createdAt: now,
          updatedAt: now,
          plan,
        },
      ]),
    }),
  );
  await page.route('**/api/mator/workflows/*/conversations', (route) =>
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        currentId: conversationId,
        items: [
          {
            id: conversationId,
            workflowId,
            title: 'Delivery regression',
            createdAt: now,
            updatedAt: now,
            lastMessageAt: now,
            boundRevisionId: null,
          },
        ],
      }),
    }),
  );
  await page.route('**/api/mator/conversations/*/events', (route) =>
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify(events),
    }),
  );
  await page.route('**/api/mator/conversations/*/messages', async (route) => {
    const payload = route.request().postDataJSON() as { text: string };
    sent.push(payload.text);
    if (failNext) {
      failNext = false;
      await route.fulfill({
        status: 503,
        contentType: 'application/json',
        body: JSON.stringify({
          error: 'Chat provider temporarily unavailable',
        }),
      });
      return;
    }
    const timestamp = new Date(
      Date.parse(now) + events.length * 1000,
    ).toISOString();
    const user = {
      id: `user-${sent.length}`,
      conversationId,
      role: 'user',
      kind: 'message',
      text: payload.text,
      createdAt: timestamp,
    };
    const assistant = {
      id: `assistant-${sent.length}`,
      conversationId,
      role: 'assistant',
      kind: 'message',
      text: `Reply to: ${payload.text}`,
      createdAt: new Date(Date.parse(timestamp) + 500).toISOString(),
    };
    events = [...events, user, assistant];
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ events: [user, assistant] }),
    });
  });

  await page.goto('/dashboard/pipeline');
  const dock = page.getByTestId('mator-chat');
  if (!(await dock.isVisible())) {
    await page.getByRole('button', { name: 'Open Mator' }).click();
  }
  const input = dock.getByTestId('mator-input');
  await expect(input).toBeVisible();
  await input.fill('First question');
  await dock.getByTestId('mator-send').click();
  await expect(dock.getByText('Reply to: First question')).toBeVisible();
  expect(sent).toEqual(['First question']);

  failNext = true;
  await input.fill('Keep my unsent draft');
  await input.press('Enter');
  await expect(dock.getByRole('alert')).toContainText(
    'Chat provider temporarily unavailable',
  );
  await expect(input).toHaveValue('Keep my unsent draft');
  await dock.getByTestId('mator-send').click();
  await expect(dock.getByText('Reply to: Keep my unsent draft')).toBeVisible();
  await expect(dock.locator('[data-slot="message"]').last()).toContainText(
    'Reply to: Keep my unsent draft',
  );
  expect(sent).toEqual([
    'First question',
    'Keep my unsent draft',
    'Keep my unsent draft',
  ]);

  await page.reload();
  const restored = page.getByTestId('mator-chat');
  if (!(await restored.isVisible())) {
    await page.getByRole('button', { name: 'Open Mator' }).click();
  }
  await expect(
    restored.getByText('Reply to: Keep my unsent draft'),
  ).toBeVisible();
  await expect(restored.locator('[data-slot="message"]').last()).toContainText(
    'Reply to: Keep my unsent draft',
  );
  await capture(page, info, 'mator-message-delivery-and-reload');
});

// Replacement for the old manually-tapped voice deck tests. Uses the real
// composer and hooks, but deterministic browser media and mocked API responses.
async function mockMatorCallWorkspace(
  page: Page,
  workflowId: string,
  conversations: string[],
) {
  const now = '2026-11-02T09:00:00.000Z';
  let current = conversations[0]!;
  await page.route('**/api/workflows', (route) =>
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify([
        {
          id: workflowId,
          ownerId: 'local-owner',
          templateId: null,
          revision: 1,
          createdAt: now,
          updatedAt: now,
          plan: {
            version: 1,
            platform: 'linkedin',
            action: 'audit',
            name: 'Profile audit',
            steps: [
              { id: 'start', kind: 'start', title: 'Start run' },
              { id: 'finish', kind: 'finish', title: 'Final output' },
            ],
            links: [{ source: 'start', target: 'finish' }],
          },
        },
      ]),
    }),
  );
  await page.route('**/api/mator/workflows/*/conversations', (route) =>
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        currentId: current,
        items: conversations.map((id, index) => ({
          id,
          workflowId,
          title: `Thread ${index === 0 ? 'A' : 'B'}`,
          createdAt: now,
          updatedAt: now,
          lastMessageAt: now,
          boundRevisionId: null,
        })),
      }),
    }),
  );
  await page.route('**/api/mator/workflows/*/current', (route) => {
    current = (route.request().postDataJSON() as { conversationId: string })
      .conversationId;
    return route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ currentId: current }),
    });
  });
  await page.route('**/api/mator/conversations/*/events', (route) =>
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: '[]',
    }),
  );
}

test('Mator AI Call automatically handles two audio turns and two matched replies', async ({
  page,
}) => {
  const workflowId = '11111111-1111-4111-8111-111111111111';
  const conversationId = '22222222-2222-4222-8222-222222222222';
  await page.addInitScript(installFakeCallHardware);
  await mockMatorCallWorkspace(page, workflowId, [conversationId]);
  let transcripts = 0;
  let messageCalls = 0;
  const received: string[] = [];
  const spoken: string[] = [];
  await page.route('**/api/mator/audio/transcriptions', (route) => {
    const body = route.request().postDataJSON() as {
      mime: string;
      filename: string;
    };
    expect(body.mime).toBe('audio/wav');
    expect(body.filename).toBe('mator-speech.wav');
    transcripts++;
    return route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        text:
          transcripts === 1
            ? 'First spoken question'
            : 'Second spoken question',
      }),
    });
  });
  await page.route('**/api/mator/conversations/*/messages', (route) => {
    const body = route.request().postDataJSON() as {
      text: string;
      interactionMode: string;
    };
    expect(body.interactionMode).toBe('ai_call');
    const text = body.text;
    received.push(text);
    messageCalls++;
    return route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        events: [
          {
            id: `call-user-${messageCalls}`,
            conversationId,
            role: 'user',
            kind: 'message',
            text,
            createdAt: `2026-11-02T09:00:0${messageCalls}.000Z`,
          },
          {
            id: `call-reply-${messageCalls}`,
            conversationId,
            role: 'assistant',
            kind: 'message',
            text: `Mator answer ${messageCalls}`,
            createdAt: `2026-11-02T09:00:1${messageCalls}.000Z`,
          },
        ],
      }),
    });
  });
  await page.route('**/api/mator/audio/speech', (route) => {
    spoken.push((route.request().postDataJSON() as { text: string }).text);
    return route.fulfill({
      status: 200,
      contentType: 'audio/wav',
      body: 'fake audio',
    });
  });
  await page.goto('/dashboard/pipeline');
  const dock = page.getByTestId('mator-chat');
  if (!(await dock.isVisible()))
    await page.getByRole('button', { name: 'Open Mator' }).click();
  await dock.getByTestId('mator-voice-switch').click();
  await expect(dock.getByTestId('mator-composer')).toHaveAttribute(
    'data-mode',
    'voice-only',
  );
  // Switching the composer mode never opens the microphone.
  expect(
    await page.evaluate(
      () =>
        (window as unknown as { __matorCallQA: { captures: number } })
          .__matorCallQA.captures,
    ),
  ).toBe(0);
  await dock.getByTestId('mator-call-start').click();
  await expect
    .poll(() => received.length, { timeout: 25000 })
    .toBeGreaterThanOrEqual(2);
  await expect
    .poll(() => spoken.length, { timeout: 25000 })
    .toBeGreaterThanOrEqual(2);
  await dock.getByTestId('mator-call-end').click();
  expect(received.slice(0, 2)).toEqual([
    'First spoken question',
    'Second spoken question',
  ]);
  expect(spoken.slice(0, 2)).toEqual(['Mator answer 1', 'Mator answer 2']);
  const qa = await page.evaluate(
    () =>
      (
        window as unknown as {
          __matorCallQA: {
            captures: number;
            plays: number;
            overlapping: number;
            openTracks: number;
          };
        }
      ).__matorCallQA,
  );
  expect(qa.captures).toBe(1);
  expect(qa.plays).toBeGreaterThanOrEqual(2);
  expect(
    qa.overlapping,
    'Barge-in monitoring must overlap microphone access with speech output',
  ).toBeGreaterThanOrEqual(2);
  expect(qa.openTracks, 'hanging up must release microphone tracks').toBe(0);
  await expect(dock.getByTestId('mator-call-status')).toContainText(
    'Call ended',
  );
  await expect(dock.getByText('Mator answer 2')).toBeVisible();
});

test('Mator AI Call cannot deliver a late transcript after switching conversation', async ({
  page,
}) => {
  const workflowId = '11111111-1111-4111-8111-111111111111';
  const a = '22222222-2222-4222-8222-222222222222';
  const b = '33333333-3333-4333-8333-333333333333';
  await page.addInitScript(installFakeCallHardware);
  await mockMatorCallWorkspace(page, workflowId, [a, b]);
  let seenRequest: () => void = () => {};
  let unblock: () => void = () => {};
  const seen = new Promise<void>((resolve) => {
    seenRequest = resolve;
  });
  const pending = new Promise<void>((resolve) => {
    unblock = resolve;
  });
  const sent: string[] = [];
  await page.route('**/api/mator/audio/transcriptions', async (route) => {
    seenRequest();
    await pending;
    try {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ text: 'Only for thread A' }),
      });
    } catch {
      /* The canceled request may already be aborted by the browser. */
    }
  });
  await page.route('**/api/mator/conversations/*/messages', (route) => {
    sent.push(route.request().url());
    return route.fulfill({
      status: 503,
      contentType: 'application/json',
      body: '{"error":"Unexpected call message after thread switch"}',
    });
  });
  await page.goto('/dashboard/pipeline');
  const dock = page.getByTestId('mator-chat');
  if (!(await dock.isVisible()))
    await page.getByRole('button', { name: 'Open Mator' }).click();
  await dock.getByTestId('mator-voice-switch').click();
  await dock.getByTestId('mator-call-start').click();
  await seen;
  await dock.getByTestId('mator-thread-pill').click();
  await dock
    .getByTestId('mator-conversation-switcher')
    .getByRole('button', { name: /Thread B/ })
    .click();
  await expect(dock.getByTestId('mator-thread-pill')).toContainText('Thread B');
  unblock();
  await page.waitForTimeout(150);
  expect(sent, 'no stale call turn should reach the new conversation').toEqual(
    [],
  );
  expect(
    await page.evaluate(
      () =>
        (window as unknown as { __matorCallQA: { openTracks: number } })
          .__matorCallQA.openTracks,
    ),
  ).toBe(0);
  await expect(dock.getByTestId('mator-call-start')).toBeVisible();
});

test('Mator stages multiple images and captions until explicit send, then restores annotation gallery', async ({
  page,
}) => {
  const workflowId = '11111111-1111-4111-8111-111111111111';
  const conversationId = '22222222-2222-4222-8222-222222222222';
  const now = '2026-11-01T09:00:00.000Z';
  const assets: Array<{
    id: string;
    name: string;
    mime: string;
    markers: Array<{ id: string; x: number; y: number; text: string }>;
  }> = [];
  const sent: Array<{ text?: string; attachmentIds?: string[] }> = [];
  let events: Array<Record<string, unknown>> = [];
  let uploads = 0;
  await page.route('**/api/workflows', (route) =>
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify([
        {
          id: workflowId,
          ownerId: 'local-owner',
          templateId: null,
          revision: 1,
          createdAt: now,
          updatedAt: now,
          plan: {
            version: 1,
            platform: 'linkedin',
            action: 'audit',
            name: 'Profile audit',
            steps: [
              { id: 'start', kind: 'start', title: 'Start run' },
              { id: 'finish', kind: 'finish', title: 'Final output' },
            ],
            links: [{ source: 'start', target: 'finish' }],
          },
        },
      ]),
    }),
  );
  await page.route('**/api/mator/workflows/*/conversations', (route) =>
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        currentId: conversationId,
        items: [
          {
            id: conversationId,
            workflowId,
            title: 'Asset draft',
            createdAt: now,
            updatedAt: now,
            lastMessageAt: now,
            boundRevisionId: null,
          },
        ],
      }),
    }),
  );
  await page.route('**/api/mator/conversations/*/events', (route) =>
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify(events),
    }),
  );
  await page.route('**/api/mator/conversations/*/attachments', (route) => {
    uploads += 1;
    const body = route.request().postDataJSON() as {
      filename: string;
      mime: string;
    };
    const asset = {
      id: `upload-${uploads}`,
      name: body.filename,
      mime: body.mime,
      markers: [],
    };
    assets.push(asset);
    return route.fulfill({
      status: 201,
      contentType: 'application/json',
      body: JSON.stringify({
        id: asset.id,
        mime: asset.mime,
        kind: 'image',
        size: 70,
      }),
    });
  });
  await page.route('**/api/mator/attachments/*/markers', (route) => {
    const assetId = route.request().url().split('/').at(-2);
    const asset = assets.find((value) => value.id === assetId);
    if (!asset) throw Error('Unknown uploaded asset');
    asset.markers = (
      route.request().postDataJSON() as { markers: typeof asset.markers }
    ).markers;
    return route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify(asset),
    });
  });
  await page.route('**/api/mator/conversations/*/messages', (route) => {
    const request = route.request().postDataJSON() as {
      text?: string;
      attachmentIds?: string[];
    };
    sent.push(request);
    const user = {
      id: 'asset-user',
      conversationId,
      role: 'user',
      kind: 'message',
      text: request.text,
      attachmentId: request.attachmentIds?.[0],
      attachments: assets.map((asset) => ({ ...asset })),
      createdAt: now,
    };
    const assistant = {
      id: 'asset-reply',
      conversationId,
      role: 'assistant',
      kind: 'message',
      text: 'Both images received for review.',
      createdAt: '2026-11-01T09:00:01.000Z',
    };
    events = [user, assistant];
    return route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ events }),
    });
  });

  await page.goto('/dashboard/pipeline');
  const dock = page.getByTestId('mator-chat');
  if (!(await dock.isVisible()))
    await page.getByRole('button', { name: 'Open Mator' }).click();
  // Wait for the persisted conversation to initialize before staging files.
  // The composer is keyed by conversation ID, so initialization remounts it.
  await expect(dock.getByTestId('mator-thread-pill')).toContainText(
    'Asset draft',
  );
  const png = Buffer.from(
    'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+/0V8AAAAASUVORK5CYII=',
    'base64',
  );
  await dock.locator('input[type="file"]').setInputFiles([
    { name: 'diagram-one.png', mimeType: 'image/png', buffer: png },
    { name: 'diagram-two.jpeg', mimeType: 'image/jpeg', buffer: png },
  ]);
  await expect(
    dock
      .getByTestId('mator-pending-gallery')
      .getByTestId('mator-image-thumbnail'),
  ).toHaveCount(2);
  expect(uploads, 'selection must not contact the backend').toBe(0);
  expect(sent, 'selection must not create a message').toEqual([]);

  await dock
    .getByTestId('mator-pending-gallery')
    .getByTestId('mator-image-thumbnail')
    .first()
    .click();
  const modal = page.locator(
    'dialog[open][data-testid="mator-image-annotation-modal"]',
  );
  await expect(modal).toBeVisible();
  await modal.getByLabel('Annotation comment').fill('Keep the legend readable');
  await modal.getByRole('button', { name: 'Add comment at center' }).click();
  await modal.getByTestId('mator-annotation-save').click();
  await expect(modal).toBeHidden();
  expect(uploads).toBe(0);

  await dock.getByTestId('mator-input').fill('Compare the two diagrams.');
  await dock.getByTestId('mator-send').click();
  await expect(
    dock.getByText('Both images received for review.'),
  ).toBeVisible();
  expect(uploads).toBe(2);
  expect(sent).toEqual([
    {
      text: 'Compare the two diagrams.',
      attachmentIds: ['upload-1', 'upload-2'],
    },
  ]);
  expect(assets[0].markers).toHaveLength(1);
  const gallery = dock.getByTestId('mator-image-gallery').first();
  await expect(gallery.getByTestId('mator-image-thumbnail')).toHaveCount(2);
  await page.reload();
  const restored = page.getByTestId('mator-chat');
  if (!(await restored.isVisible()))
    await page.getByRole('button', { name: 'Open Mator' }).click();
  await expect(
    restored
      .getByTestId('mator-image-gallery')
      .first()
      .getByTestId('mator-image-thumbnail'),
  ).toHaveCount(2);
});

test('Mator approval cards decide the selected proposal, not another staged action', async ({
  page,
}, info) => {
  const workflowId = '11111111-1111-4111-8111-111111111111';
  const conversationId = '22222222-2222-4222-8222-222222222222';
  const firstId = '33333333-3333-4333-8333-333333333333';
  const secondId = '44444444-4444-4444-8444-444444444444';
  const now = '2026-11-01T09:00:00.000Z';
  const actions = [
    {
      id: firstId,
      conversationId,
      role: 'assistant',
      kind: 'action',
      status: 'staged',
      text: 'Change the first step',
      action: { type: 'edit_step', stepId: 'inspect' },
      createdAt: now,
    },
    {
      id: secondId,
      conversationId,
      role: 'assistant',
      kind: 'action',
      status: 'staged',
      text: 'Change the second step',
      action: { type: 'edit_step', stepId: 'verify' },
      createdAt: '2026-11-01T09:00:01.000Z',
    },
  ];
  const decisions: Array<{ stageId: string; decision: string }> = [];
  await page.route('**/api/workflows', (route) =>
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify([
        {
          id: workflowId,
          ownerId: 'local-owner',
          templateId: null,
          revision: 1,
          createdAt: now,
          updatedAt: now,
          plan: {
            version: 1,
            platform: 'linkedin',
            action: 'audit',
            name: 'Profile audit',
            steps: [
              { id: 'start', kind: 'start', title: 'Start run' },
              { id: 'finish', kind: 'finish', title: 'Final output' },
            ],
            links: [{ source: 'start', target: 'finish' }],
          },
        },
      ]),
    }),
  );
  await page.route('**/api/mator/workflows/*/conversations', (route) =>
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        currentId: conversationId,
        items: [
          {
            id: conversationId,
            workflowId,
            title: 'Approval test',
            createdAt: now,
            updatedAt: now,
            lastMessageAt: now,
            boundRevisionId: null,
          },
        ],
      }),
    }),
  );
  await page.route('**/api/mator/conversations/*/events', (route) =>
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify(actions),
    }),
  );
  await page.route('**/api/mator/conversations/*/stage/*/*', (route) => {
    const path = new URL(route.request().url()).pathname;
    const match = path.match(/\/stage\/([^/]+)\/(confirm|reject)$/);
    if (!match) throw Error(`Unexpected approval route: ${path}`);
    decisions.push({ stageId: match[1], decision: match[2] });
    const event = {
      id: `decision-${decisions.length}`,
      conversationId,
      role: 'assistant',
      kind: 'action',
      text: `Decision for proposal ${match[1]}`,
      action: { type: 'edit_step', stepId: 'inspect' },
      status: match[2] === 'confirm' ? 'applied' : 'rejected',
      resolvesEventId: match[1],
      createdAt: `2026-11-01T09:00:0${decisions.length + 1}.000Z`,
    };
    actions.push(event);
    return route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ event }),
    });
  });
  await page.goto('/dashboard/pipeline');
  const dock = page.getByTestId('mator-chat');
  if (!(await dock.isVisible())) {
    await page.getByRole('button', { name: 'Open Mator' }).click();
  }
  const cards = dock.getByTestId('mator-confirmation');
  await expect(cards).toHaveCount(2);
  await expect(dock.getByTestId('mator-stage-confirm-compact')).toHaveCount(0);
  await cards.nth(0).getByTestId('mator-stage-confirm').click();
  await expect(cards.nth(0)).toHaveAttribute('data-status', 'applied');
  await expect(cards).toHaveCount(2); // the linked terminal record must not render a second card
  await expect(cards.nth(1)).toHaveAttribute('data-status', 'staged');
  await cards.nth(1).getByTestId('mator-stage-reject').click();
  await page
    .getByRole('dialog', { name: 'Reject this staged change?' })
    .getByTestId('alert-confirm')
    .click();
  await expect(cards.nth(1)).toHaveAttribute('data-status', 'rejected');
  await expect(cards).toHaveCount(2);
  expect(decisions).toEqual([
    { stageId: firstId, decision: 'confirm' },
    { stageId: secondId, decision: 'reject' },
  ]);
  await capture(page, info, 'mator-independent-staged-decisions');
});

test('Mator creates a persisted workflow and accepts the first chat message', async ({
  page,
}) => {
  const workflowId = '11111111-1111-4111-8111-111111111111';
  const conversationId = '22222222-2222-4222-8222-222222222222';
  const now = '2026-11-01T09:00:00.000Z';
  const record = {
    id: workflowId,
    ownerId: 'local-owner',
    templateId: null,
    revision: 1,
    createdAt: now,
    updatedAt: now,
    plan: {
      version: 1,
      platform: 'linkedin',
      action: 'audit',
      name: 'Profile audit',
      steps: [
        { id: 'start', kind: 'start', title: 'Start run' },
        { id: 'finish', kind: 'finish', title: 'Final output' },
      ],
      links: [{ source: 'start', target: 'finish' }],
    },
  };
  let created = false;
  let conversationCreated = false;
  let message = '';
  await page.route('**/api/workflows', (route) => {
    if (route.request().method() === 'POST') {
      created = true;
      return route.fulfill({
        status: 201,
        contentType: 'application/json',
        body: JSON.stringify(record),
      });
    }
    return route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify(created ? [record] : []),
    });
  });
  await page.route('**/api/mator/workflows/*/conversations', (route) => {
    if (route.request().method() === 'POST') {
      conversationCreated = true;
      return route.fulfill({
        status: 201,
        contentType: 'application/json',
        body: JSON.stringify({
          id: conversationId,
          workflowId,
          title: 'New conversation',
          createdAt: now,
          updatedAt: now,
          lastMessageAt: null,
          boundRevisionId: null,
        }),
      });
    }
    return route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ currentId: null, items: [] }),
    });
  });
  await page.route('**/api/mator/conversations/*/events', (route) =>
    route.fulfill({ status: 200, contentType: 'application/json', body: '[]' }),
  );
  await page.route('**/api/mator/conversations/*/messages', (route) => {
    message = (route.request().postDataJSON() as { text: string }).text;
    return route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        events: [
          {
            id: 'first-input',
            conversationId,
            role: 'user',
            kind: 'message',
            text: message,
            createdAt: now,
          },
          {
            id: 'first-reply',
            conversationId,
            role: 'assistant',
            kind: 'message',
            text: 'Mator received the first message',
            createdAt: '2026-11-01T09:00:01.000Z',
          },
        ],
      }),
    });
  });
  await page.goto('/dashboard/pipeline');
  const dock = page.getByTestId('mator-chat');
  if (!(await dock.isVisible())) {
    await page.getByRole('button', { name: 'Open Mator' }).click();
  }
  const input = dock.getByTestId('mator-input');
  await expect(input).toBeVisible();
  await input.fill('I need my first workflow');
  await dock.getByTestId('mator-send').click();
  await expect(
    dock.getByText('Mator received the first message'),
  ).toBeVisible();
  expect(created).toBe(true);
  expect(conversationCreated).toBe(true);
  expect(message).toBe('I need my first workflow');
});

test('Growth modal uses the YAML catalogue with actionable search and pipeline detail', async ({
  page,
}, info) => {
  const names = [
    'linkedin-profile',
    'linkedin-branding',
    'linkedin-analytics',
    'linkedin-content',
    ...Array.from({ length: 17 }, (_, index) => `linkedin-method-${index}`),
  ];
  await page.route('**/api/growth/templates', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify(
        names.map((id) => ({
          id,
          title: id.replaceAll('-', ' '),
          objective: 'Evidence and owner approval are required',
          platform: 'linkedin',
          pipelineCount: id === 'linkedin-profile' ? 6 : 2,
          coverageCount: 2,
          executable: id === 'linkedin-profile' || id === 'linkedin-branding',
        })),
      ),
    });
  });
  await page.route(
    '**/api/growth/templates/linkedin-analytics',
    async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          id: 'linkedin-analytics',
          title: 'Audience, post and opportunity analytics',
          objective: 'Evidence-based review',
          kind: 'GrowthBlueprintWorkflow',
          executable: false,
          limitation: 'Planning only; no provider actions',
          coverage: [{ id: 'evidence', label: 'Source evidence' }],
          requirements: [],
          pipelines: [],
          stages: [
            {
              id: 'discovery',
              title: 'Evidence and preparation',
              action: 'manual',
              page: 'none',
              dependsOn: 'none',
              sectionIds: ['evidence'],
              stepCount: 5,
              execution: 'design-only',
              plan: {
                version: 1,
                platform: 'linkedin',
                action: 'manual-review',
                name: 'Evidence and preparation',
                steps: ['todo', 'procedure', 'action', 'event', 'verify'].map(
                  (id) => ({
                    id,
                    kind: 'note',
                    title: `Review ${id}`,
                  }),
                ),
                links: [],
              },
            },
          ],
        }),
      });
    },
  );

  await page.goto('/dashboard/pipeline');
  await page.getByRole('button', { name: 'Browse templates' }).click();
  const dialog = page.getByTestId('workflow-template-dialog');
  await expect(dialog).toBeVisible();
  await expect(dialog.getByTestId('growth-template-count')).toContainText(
    '21 workflows',
  );
  await expect(dialog.getByTestId('growth-template-option')).toHaveCount(21);
  await dialog
    .getByRole('searchbox', { name: 'Search workflows' })
    .fill('analytics');
  await expect(dialog.getByTestId('growth-template-option')).toHaveCount(1);
  await expect(
    dialog.getByTestId('growth-template-pipeline-preview'),
  ).toBeVisible();
  await expect(dialog.getByText('Review procedure')).toBeVisible();
  await expect(dialog.getByText('Design only', { exact: true })).toBeVisible();
  await expect(
    dialog.getByRole('link', { name: 'View source YAML' }),
  ).toHaveAttribute('href', '/api/growth/templates/linkedin-analytics/yaml');
  await dialog
    .getByRole('searchbox', { name: 'Search workflows' })
    .fill('not-a-template');
  await expect(dialog.getByTestId('growth-templates-empty')).toBeVisible();
  await dialog.getByRole('button', { name: 'Clear filters' }).click();
  await expect(dialog.getByTestId('growth-template-option')).toHaveCount(21);
  await capture(page, info, 'growth-template-library');
  await page.keyboard.press('Escape');
  await expect(dialog).toBeHidden();
});

async function installMatorClarificationFixture(
  page: Page,
  questions: Array<Record<string, unknown>>,
) {
  const workflowId = '11111111-1111-4111-8111-111111111111';
  const conversationId = '22222222-2222-4222-8222-222222222222';
  const now = '2026-11-01T09:00:00.000Z';
  const received: Array<{ text?: string; attachmentIds?: string[] }> = [];
  let uploads = 0;
  let failNext = false;
  const clarify = {
    id: 'clarify-1',
    conversationId,
    role: 'assistant',
    kind: 'clarify',
    text: 'Please provide the missing source.',
    action: { type: 'clarify', questions },
    createdAt: now,
  };
  const events: Array<Record<string, unknown>> = [clarify];

  await page.route('**/api/workflows', (route) =>
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify([
        {
          id: workflowId,
          ownerId: 'local-owner',
          templateId: null,
          revision: 1,
          createdAt: now,
          updatedAt: now,
          plan: {
            version: 1,
            platform: 'linkedin',
            action: 'audit',
            name: 'Clarification flow',
            steps: [
              { id: 'start', kind: 'start', title: 'Begin' },
              { id: 'finish', kind: 'finish', title: 'Finish' },
            ],
            links: [{ source: 'start', target: 'finish' }],
          },
        },
      ]),
    }),
  );
  await page.route('**/api/mator/workflows/*/conversations', (route) =>
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        currentId: conversationId,
        items: [
          {
            id: conversationId,
            workflowId,
            title: 'Clarification flow',
            createdAt: now,
            updatedAt: now,
            lastMessageAt: now,
            boundRevisionId: null,
          },
        ],
      }),
    }),
  );
  await page.route('**/api/mator/conversations/*/events', (route) =>
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify(events),
    }),
  );
  await page.route('**/api/mator/conversations/*/attachments', (route) => {
    uploads += 1;
    const body = route.request().postDataJSON() as {
      filename: string;
      data: string;
    };
    expect(body.filename).toBeTruthy();
    expect(body.data.length).toBeGreaterThan(0);
    return route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        id: 'uploaded-once',
        filename: body.filename,
        mime: 'image/png',
      }),
    });
  });
  await page.route('**/api/mator/conversations/*/messages', (route) => {
    const payload = route.request().postDataJSON() as {
      text?: string;
      attachmentIds?: string[];
    };
    received.push(payload);
    if (failNext) {
      failNext = false;
      return route.fulfill({
        status: 503,
        contentType: 'application/json',
        body: JSON.stringify({ error: 'Provider busy, retry this answer' }),
      });
    }
    const user = {
      id: `answered-${received.length}`,
      conversationId,
      role: 'user',
      kind: 'message',
      text: payload.text ?? 'Attachment',
      createdAt: '2026-11-01T09:00:01.000Z',
    };
    events.push(user);
    return route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ events: [user] }),
    });
  });
  return {
    received,
    uploads: () => uploads,
    failOnce: () => {
      failNext = true;
    },
  };
}

test('Mator clarification uploads a file only when answers are sent and retries without a second upload', async ({
  page,
}) => {
  const fixture = await installMatorClarificationFixture(page, [
    {
      name: 'evidence',
      prompt: 'Attach supporting evidence',
      required: true,
      multiple: false,
      choices: [],
      inputType: 'file',
    },
  ]);
  await page.goto('/dashboard/pipeline');
  const dock = page.getByTestId('mator-chat');
  if (!(await dock.isVisible()))
    await page.getByRole('button', { name: 'Open Mator' }).click();
  const card = dock.getByTestId('mator-clarify-card');
  await expect(card).toBeVisible();
  await card.getByLabel('Attach supporting evidence').setInputFiles({
    name: 'diagram.png',
    mimeType: 'image/png',
    buffer: Buffer.from('test png file'),
  });
  expect(fixture.uploads()).toBe(0);
  fixture.failOnce();
  await card.getByRole('button', { name: 'Send answers' }).click();
  await expect(card.getByRole('alert')).toContainText(
    'Mator could not send the answers',
  );
  await expect(dock.getByTestId('mator-chat-error')).toContainText(
    'Provider busy',
  );
  expect(fixture.uploads()).toBe(1);
  expect(fixture.received).toHaveLength(1);
  expect(fixture.received[0].attachmentIds).toEqual(['uploaded-once']);
  await card.getByRole('button', { name: 'Send answers' }).click();
  await expect(card).toHaveCount(0);
  expect(fixture.uploads()).toBe(1);
  expect(fixture.received).toHaveLength(2);
  expect(fixture.received[1].attachmentIds).toEqual(['uploaded-once']);
});

test('Mator clarification validates URL protocol before sending any message', async ({
  page,
}) => {
  const fixture = await installMatorClarificationFixture(page, [
    {
      name: 'source',
      prompt: 'Provide source URL',
      required: true,
      multiple: false,
      choices: [],
      inputType: 'url',
      freeform: { label: 'Website link' },
    },
  ]);
  await page.goto('/dashboard/pipeline');
  const dock = page.getByTestId('mator-chat');
  if (!(await dock.isVisible()))
    await page.getByRole('button', { name: 'Open Mator' }).click();
  const card = dock.getByTestId('mator-clarify-card');
  await expect(card).toBeVisible();
  const input = card.getByLabel('Website link');
  await input.fill('javascript:alert(1)');
  await card.getByRole('button', { name: 'Send answers' }).click();
  await expect(card.getByRole('alert')).toContainText('Only HTTP and HTTPS');
  expect(fixture.received).toHaveLength(0);
  await input.fill('https://example.com/evidence');
  await card.getByRole('button', { name: 'Send answers' }).click();
  await expect(card).toHaveCount(0);
  expect(fixture.received).toHaveLength(1);
  expect(fixture.received[0].text).toContain('https://example.com/evidence');
  expect(fixture.uploads()).toBe(0);
});

/** Deterministic fake microphone, local VAD input and playback for browser QA.
 * Keep this fixture inside Playwright's addInitScript: it is not production code.
 */
function installFakeCallHardware() {
  const status = { captures: 0, plays: 0, overlapping: 0, openTracks: 0 };
  Object.defineProperty(window, 'SpeechRecognition', {
    configurable: true,
    value: undefined,
  });
  Object.defineProperty(window, 'webkitSpeechRecognition', {
    configurable: true,
    value: undefined,
  });
  Object.defineProperty(window, '__matorCallQA', {
    configurable: true,
    value: status,
  });
  Object.defineProperty(window, 'AudioContext', {
    configurable: true,
    value: class {
      state = 'running';
      sampleRate = 48000;
      destination = {};
      started = performance.now();
      get currentTime() {
        return (performance.now() - this.started) / 1000;
      }
      createMediaStreamSource() {
        return { connect: () => {}, disconnect: () => {} };
      }
      createAnalyser() {
        return {
          fftSize: 2048,
          getFloatTimeDomainData: (samples: Float32Array) => {
            // Every two seconds a new 450ms utterance arrives without a mic tap.
            const cycle = (performance.now() - this.started) % 2000;
            samples.fill(cycle < 450 ? 0.075 : 0);
          },
        };
      }
      createBufferSource() {
        let ended = false;
        let cancel: ReturnType<typeof setTimeout> | null = null;
        return {
          buffer: null,
          onended: null as null | (() => void),
          connect: () => {},
          disconnect: () => {},
          start() {
            status.plays++;
            if (status.openTracks > 0) status.overlapping++;
            cancel = setTimeout(() => {
              if (ended) return;
              ended = true;
              this.onended?.();
            }, 70);
          },
          stop() {
            if (ended) return;
            ended = true;
            if (cancel) clearTimeout(cancel);
            this.onended?.();
          },
        };
      }
      async decodeAudioData(buffer: ArrayBuffer) {
        void buffer;
        return {
          length: 3840,
          getChannelData: (index: number) => {
            void index;
            return new Float32Array(3840);
          },
        };
      }
      resume() {
        return Promise.resolve();
      }
      close() {
        return Promise.resolve();
      }
    },
  });
  Object.defineProperty(navigator, 'mediaDevices', {
    configurable: true,
    value: {
      getUserMedia: async () => {
        status.captures++;
        status.openTracks++;
        let closed = false;
        const track = {
          get readyState() {
            return closed ? 'ended' : 'live';
          },
          stop: () => {
            if (!closed) {
              closed = true;
              status.openTracks--;
            }
          },
        };
        return { getTracks: () => [track], getAudioTracks: () => [track] };
      },
    },
  });
  // The production duplex audio path emits WAV PCM rather than MediaRecorder blobs.
}
