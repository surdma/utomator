import axe from 'axe-core';
import { expect, test, type Page, type TestInfo } from '@playwright/test';
import {
  connectorAccount,
  installConnectorApi,
  iso,
  openConnectorDialog,
} from './support/connector-mocks';

const mobileBrowser = (page: Page) =>
  page.evaluate(() => /Android|iPhone|iPad|iPod/i.test(navigator.userAgent));

async function capture(page: Page, info: TestInfo, label: string) {
  await info.attach(label + '.png', {
    body: await page.screenshot({ animations: 'disabled' }),
    contentType: 'image/png',
  });
}

async function assertLayout(page: Page) {
  const problems = await page.evaluate(() => {
    const dialog = document.querySelector<HTMLDialogElement>(
      '[data-testid="connector-onboarding-dialog"]'
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
        issues.push(name + ' has a touch target smaller than 44x44px');
      if (bounds.left < -1 || bounds.right > window.innerWidth + 1)
        issues.push(name + ' lies outside the viewport horizontally');
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
      '[data-testid="connector-onboarding-dialog"]'
    );
    if (!dialog) throw new Error('Missing connector dialog');
    return audit.run(dialog, {
      runOnly: {
        type: 'tag',
        values: ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa'],
      },
    });
  });
  await info.attach('accessibility-' + label + '.json', {
    body: Buffer.from(
      JSON.stringify(
        {
          violations: result.violations,
          passes: result.passes.map((item) => item.id),
          incomplete: result.incomplete.map((item) => item.id),
        },
        null,
        2
      )
    ),
    contentType: 'application/json',
  });
  const failures = result.violations.map(
    (item) =>
      item.id +
      ' (' +
      item.impact +
      '): ' +
      item.nodes.map((node) => node.target.join(' ')).join(', ')
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
    dialog.getByRole('button', { name: /Other networks/ })
  ).toHaveAttribute('aria-expanded', 'true');
  const icons = dialog.getByTestId('linkedin-connector').locator('svg');
  await expect(icons).toHaveCount(5);
  const dimensions = await icons.evaluateAll((elements) =>
    elements.map((element) => {
      const rect = element.getBoundingClientRect();
      return { width: rect.width, height: rect.height };
    })
  );
  for (const icon of dimensions) {
    expect(icon.width).toBeGreaterThanOrEqual(19);
    expect(icon.width).toBeLessThanOrEqual(21);
    expect(icon.height).toBeGreaterThanOrEqual(19);
    expect(icon.height).toBeLessThanOrEqual(21);
  }
  await expect(
    dialog.getByTestId('linkedin-connector').locator('svg')
  ).toHaveCount(5);
  await expect(
    dialog.locator('[aria-label="Connection progress"]')
  ).toHaveCount(0);
  const title = dialog.getByRole('heading', {
    name: 'Connect your social accounts',
  });
  const titleSize = await title.evaluate((element) =>
    parseFloat(getComputedStyle(element).fontSize)
  );
  expect(titleSize).toBeGreaterThanOrEqual(20);
  const width = await dialog.evaluate(
    (element) => element.getBoundingClientRect().width
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
    dialog.getByRole('button', { name: 'LinkedIn', exact: true })
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
      'The Connect action should be on screen without scrolling'
    ).toBeLessThanOrEqual(actionBounds.modalBottom - 4);
  }
  await assertLayout(page);
  await capture(page, info, 'linkedin-unlinked');

  await dialog.getByRole('button', { name: /Other networks/ }).click();
  await dialog.getByRole('button', { name: 'Instagram' }).click();
  await expect(dialog.getByTestId('connector-status')).toHaveText(
    'Unavailable'
  );
  await expect(
    dialog.getByText(/Official API connector not available yet/)
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
      dialog.getByText(/Mobile Chrome and Safari cannot share/)
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
    'Session connected'
  );
  const name = dialog.getByText(/long professional profile display name/);
  const handle = dialog.getByText(
    '@an-unusually-long-professional-profile-handle'
  );
  await expect(name).toBeVisible();
  await expect(handle).toBeVisible();
  // A hidden CSS ellipsis is not readable on compact screens.
  expect(
    await name.evaluate(
      (element) => element.scrollWidth <= element.clientWidth + 1
    )
  ).toBe(true);
  expect(
    await handle.evaluate(
      (element) => element.scrollWidth <= element.clientWidth + 1
    )
  ).toBe(true);
  await assertLayout(page);
  await capture(page, info, 'linkedin-connected');
  await expect(
    dialog.getByRole('button', { name: 'Disconnect', exact: true })
  ).toBeVisible();
  await dialog.getByRole('button', { name: 'Disconnect', exact: true }).click();
  await expect(
    dialog.getByRole('button', { name: 'Confirm disconnect' })
  ).toBeVisible();
  await assertLayout(page);
  await dialog.getByRole('button', { name: 'Cancel', exact: true }).click();
  await expect(dialog.getByTestId('connector-status')).toHaveText(
    'Session connected'
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
    event.method === 'GET' ? { status: 503 } : undefined
  );
  const dialog = await openConnectorDialog(page);
  await expect(dialog.getByRole('alert')).toContainText(
    'Social connections unavailable'
  );
  await assertLayout(page);
  await capture(page, info, 'network-error');
  await expect(
    dialog.getByRole('button', { name: 'LinkedIn', exact: true })
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
      element.contains(document.activeElement)
    );
    expect(focusInside, 'Tab focus must remain within the open modal').toBe(
      true
    );
  }
  await page.keyboard.press('Escape');
  await expect(dialog).toBeHidden();
});

test('dashboard navigation stays usable after extracting the shell', async ({
  page,
}) => {
  await page.goto('/dashboard/pipeline');
  const sidebar = page.getByTestId('automation-navigation-sidebar');
  const toggle = page.getByRole('button', { name: 'Toggle navigation' });
  if (await toggle.isVisible()) {
    await toggle.click();
    await expect(toggle).toHaveAttribute('aria-expanded', 'true');
  }
  await expect(
    sidebar.getByRole('button', { name: 'Run history' })
  ).toBeVisible();
  await sidebar.getByRole('button', { name: 'Run history' }).click();
  await expect(page).toHaveURL(/\/dashboard\/history$/);
  if (await toggle.isVisible()) await toggle.click();
  await sidebar.getByRole('button', { name: 'Pipeline', exact: true }).click();
  await expect(page).toHaveURL(/\/dashboard\/pipeline$/);
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
    })
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
    })
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
  await expect(dock.getByRole('dialog', { name: 'Chat settings' })).toBeVisible();
  await expect(dock.getByRole('slider', { name: 'Reasoning effort' })).toHaveValue('1');
  await page.keyboard.press('Escape');

  await dock.getByTestId('mator-voice-switch').click();
  await expect(dock.getByTestId('mator-composer')).toHaveAttribute('data-mode', 'voice-only');
  await expect(dock.getByTestId('mator-voice-switch')).toHaveAttribute('aria-checked', 'true');
  await dock.getByTestId('mator-voice-switch').click();
  await expect(dock.getByTestId('mator-composer')).toHaveAttribute('data-mode', 'text');
  await capture(page, info, 'mator-dock-text-first');
});

test('Mator renders persisted messages and staged cards without clipping narrow viewports', async ({
  page,
}, info) => {
  const now = '2026-11-01T09:00:00.000Z';
  const shortText = 'Hi Mator';
  const longText = 'Review this professional credential: ' + 'credential'.repeat(24);
  const assistantText = 'I can review this evidence: ' + 'evidence'.repeat(26);
  const confirmationText = 'Review this proposal: ' + 'approval'.repeat(26);
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
    })
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
    })
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
    })
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
  await expect(dock.getByText(assistantText)).toBeVisible();

  const metrics = await dock.evaluate((element) => {
    const rows = [...element.querySelectorAll<HTMLElement>('[data-slot="message"]')];
    const findRow = (value: string) => rows.find((row) => row.textContent?.includes(value));
    const short = findRow('Hi Mator');
    const long = findRow('credential'.repeat(24));
    const shortBubble = short?.querySelector<HTMLElement>('[data-slot="bubble"]');
    const longBubble = long?.querySelector<HTMLElement>('[data-slot="bubble"]');
    const confirmCard = element.querySelector<HTMLElement>('[data-testid="mator-confirmation"]');
    const assistant = findRow('evidence'.repeat(26));
    const assistantText = assistant?.querySelector<HTMLElement>('p');
    const confirmationText = confirmCard?.querySelector<HTMLElement>('p');
    if (!shortBubble || !longBubble || !confirmCard || !assistantText || !confirmationText) return null;
    const shortBox = shortBubble.getBoundingClientRect();
    const longBox = longBubble.getBoundingClientRect();
    const confirmationBox = confirmCard.getBoundingClientRect();
    const dockBox = element.getBoundingClientRect();
    return {
      shortWidth: shortBox.width,
      longWidth: longBox.width,
      confirmWidth: confirmationBox.width,
      dockWidth: dockBox.width,
      longOverflow: longBubble.scrollWidth - longBubble.clientWidth,
      assistantOverflow: assistantText.scrollWidth - assistantText.clientWidth,
      confirmationOverflow: confirmationText.scrollWidth - confirmationText.clientWidth,
      messageVisible: shortBubble.textContent?.includes('Hi Mator'),
    };
  });
  expect(metrics, 'Rendered chat bubbles and staged card must be present').not.toBeNull();
  expect(metrics!.messageVisible).toBe(true);
  expect(metrics!.shortWidth).toBeGreaterThan(55);
  expect(metrics!.shortWidth).toBeLessThan(metrics!.dockWidth * 0.72);
  expect(metrics!.longWidth).toBeLessThanOrEqual(metrics!.dockWidth);
  expect(metrics!.confirmWidth).toBeLessThanOrEqual(Math.min(metrics!.dockWidth, 485));
  expect(metrics!.longOverflow).toBeLessThanOrEqual(1);
  expect(metrics!.assistantOverflow).toBeLessThanOrEqual(1);
  expect(metrics!.confirmationOverflow).toBeLessThanOrEqual(1);
  await capture(page, info, 'mator-content-width-regression');
});

test('Mator sends text, preserves failed drafts, and places the newest reply last', async ({ page }, info) => {
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
      body: JSON.stringify([{
        id: workflowId,
        ownerId: 'local-owner',
        templateId: null,
        revision: 1,
        createdAt: now,
        updatedAt: now,
        plan,
      }]),
    })
  );
  await page.route('**/api/mator/workflows/*/conversations', (route) =>
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        currentId: conversationId,
        items: [{
          id: conversationId,
          workflowId,
          title: 'Delivery regression',
          createdAt: now,
          updatedAt: now,
          lastMessageAt: now,
          boundRevisionId: null,
        }],
      }),
    })
  );
  await page.route('**/api/mator/conversations/*/events', (route) =>
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify(events),
    })
  );
  await page.route('**/api/mator/conversations/*/messages', async (route) => {
    const payload = route.request().postDataJSON() as { text: string };
    sent.push(payload.text);
    if (failNext) {
      failNext = false;
      await route.fulfill({
        status: 503,
        contentType: 'application/json',
        body: JSON.stringify({ error: 'Chat provider temporarily unavailable' }),
      });
      return;
    }
    const timestamp = new Date(Date.parse(now) + events.length * 1000).toISOString();
    const user = {
      id: 'user-' + sent.length,
      conversationId,
      role: 'user',
      kind: 'message',
      text: payload.text,
      createdAt: timestamp,
    };
    const assistant = {
      id: 'assistant-' + sent.length,
      conversationId,
      role: 'assistant',
      kind: 'message',
      text: 'Reply to: ' + payload.text,
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
  await expect(dock.getByRole('alert')).toContainText('Chat provider temporarily unavailable');
  await expect(input).toHaveValue('Keep my unsent draft');
  await dock.getByTestId('mator-send').click();
  await expect(dock.getByText('Reply to: Keep my unsent draft')).toBeVisible();
  await expect(dock.locator('[data-slot="message"]').last()).toContainText('Reply to: Keep my unsent draft');
  expect(sent).toEqual(['First question', 'Keep my unsent draft', 'Keep my unsent draft']);

  await page.reload();
  const restored = page.getByTestId('mator-chat');
  if (!(await restored.isVisible())) {
    await page.getByRole('button', { name: 'Open Mator' }).click();
  }
  await expect(restored.getByText('Reply to: Keep my unsent draft')).toBeVisible();
  await expect(restored.locator('[data-slot="message"]').last()).toContainText('Reply to: Keep my unsent draft');
  await capture(page, info, 'mator-message-delivery-and-reload');
});

test('Mator accepts recorded speech when SpeechRecognition is unavailable', async ({ page }) => {
  const workflowId = '11111111-1111-4111-8111-111111111111';
  const conversationId = '22222222-2222-4222-8222-222222222222';
  const now = '2026-11-01T09:00:00.000Z';
  await page.addInitScript(() => {
    Object.defineProperty(window, 'SpeechRecognition', { configurable: true, value: undefined });
    Object.defineProperty(window, 'webkitSpeechRecognition', { configurable: true, value: undefined });
    Object.defineProperty(navigator, 'mediaDevices', {
      configurable: true,
      value: { getUserMedia: async () => ({
        getTracks: () => [{ stop: () => {} }],
      }) },
    });
    Object.defineProperty(window, 'MediaRecorder', {
      configurable: true,
      value: class {
        state = 'inactive';
        mimeType = 'audio/mp4';
        ondataavailable: ((event: { data: Blob }) => void) | null = null;
        onstop: (() => void) | null = null;
        start() { this.state = 'recording'; }
        stop() {
          this.state = 'inactive';
          this.ondataavailable?.({ data: new Blob(['recorded speech'], { type: 'audio/mp4' }) });
          this.onstop?.();
        }
      },
    });
  });
  await page.route('**/api/workflows', (route) =>
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify([{
        id: workflowId, ownerId: 'local-owner', templateId: null,
        revision: 1, createdAt: now, updatedAt: now,
        plan: {
          version: 1, platform: 'linkedin', action: 'audit',
          name: 'Profile audit',
          steps: [
            { id: 'start', kind: 'start', title: 'Start run' },
            { id: 'finish', kind: 'finish', title: 'Final output' },
          ],
          links: [{ source: 'start', target: 'finish' }],
        },
      }]),
    })
  );
  await page.route('**/api/mator/workflows/*/conversations', (route) =>
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        currentId: conversationId,
        items: [{
          id: conversationId, workflowId, title: 'Speech regression',
          createdAt: now, updatedAt: now, lastMessageAt: now, boundRevisionId: null,
        }],
      }),
    })
  );
  await page.route('**/api/mator/conversations/*/events', (route) =>
    route.fulfill({ status: 200, contentType: 'application/json', body: '[]' })
  );
  let transcriptionFilename = '';
  await page.route('**/api/mator/audio/transcriptions', (route) => {
    const request = route.request().postDataJSON() as { filename: string; mime: string };
    transcriptionFilename = request.filename;
    expect(request.mime).toBe('audio/mp4');
    return route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ text: 'Spoken profile question' }),
    });
  });
  let received = '';
  let spoken = '';
  await page.route('**/api/mator/audio/speech', async (route) => {
    spoken = (route.request().postDataJSON() as { text: string }).text;
    await route.fulfill({
      status: 200,
      contentType: 'audio/wav',
      body: 'audio playback fixture',
    });
  });
  await page.route('**/api/mator/conversations/*/messages', async (route) => {
    received = (route.request().postDataJSON() as { text: string }).text;
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        events: [
          { id: 'voice-user', conversationId, role: 'user', kind: 'message', text: received, createdAt: now },
          { id: 'voice-reply', conversationId, role: 'assistant', kind: 'message', text: 'Heard your profile question', createdAt: '2026-11-01T09:00:01.000Z' },
        ],
      }),
    });
  });
  await page.goto('/dashboard/pipeline');
  const dock = page.getByTestId('mator-chat');
  if (!(await dock.isVisible())) {
    await page.getByRole('button', { name: 'Open Mator' }).click();
  }
  await dock.getByTestId('mator-voice-switch').click();
  await expect(dock.getByTestId('mator-composer')).toHaveAttribute('data-mode', 'voice-only');
  const mic = dock.getByTestId('mator-voice-listening');
  await expect(mic).toBeEnabled();
  await mic.click();
  await expect(mic).toHaveAttribute('aria-pressed', 'true');
  await mic.click();
  await expect(dock.getByText('Heard your profile question')).toBeVisible();
  expect(received).toBe('Spoken profile question');
  expect(transcriptionFilename).toBe('mator-speech.m4a');
  await expect.poll(() => spoken).toBe('Heard your profile question');
  await dock.getByTestId('mator-voice-switch').click();
  await expect(dock.getByTestId('mator-input')).toHaveValue('');
});

test('Mator approval cards decide the selected proposal, not another staged action', async ({ page }, info) => {
  const workflowId = '11111111-1111-4111-8111-111111111111';
  const conversationId = '22222222-2222-4222-8222-222222222222';
  const firstId = '33333333-3333-4333-8333-333333333333';
  const secondId = '44444444-4444-4444-8444-444444444444';
  const now = '2026-11-01T09:00:00.000Z';
  const actions = [
    { id: firstId, conversationId, role: 'assistant', kind: 'action', status: 'staged', text: 'Change the first step', action: { type: 'edit_step', stepId: 'inspect' }, createdAt: now },
    { id: secondId, conversationId, role: 'assistant', kind: 'action', status: 'staged', text: 'Change the second step', action: { type: 'edit_step', stepId: 'verify' }, createdAt: '2026-11-01T09:00:01.000Z' },
  ];
  const decisions: Array<{ stageId: string; decision: string }> = [];
  await page.route('**/api/workflows', (route) => route.fulfill({
    status: 200, contentType: 'application/json',
    body: JSON.stringify([{
      id: workflowId, ownerId: 'local-owner', templateId: null,
      revision: 1, createdAt: now, updatedAt: now,
      plan: {
        version: 1, platform: 'linkedin', action: 'audit', name: 'Profile audit',
        steps: [
          { id: 'start', kind: 'start', title: 'Start run' },
          { id: 'finish', kind: 'finish', title: 'Final output' },
        ],
        links: [{ source: 'start', target: 'finish' }],
      },
    }]),
  }));
  await page.route('**/api/mator/workflows/*/conversations', (route) => route.fulfill({
    status: 200, contentType: 'application/json',
    body: JSON.stringify({
      currentId: conversationId,
      items: [{ id: conversationId, workflowId, title: 'Approval test',
        createdAt: now, updatedAt: now, lastMessageAt: now, boundRevisionId: null }],
    }),
  }));
  await page.route('**/api/mator/conversations/*/events', (route) => route.fulfill({
    status: 200, contentType: 'application/json', body: JSON.stringify(actions),
  }));
  await page.route('**/api/mator/conversations/*/stage/*/*', (route) => {
    const path = new URL(route.request().url()).pathname;
    const match = path.match(/\/stage\/([^/]+)\/(confirm|reject)$/);
    if (!match) throw Error('Unexpected approval route: ' + path);
    decisions.push({ stageId: match[1], decision: match[2] });
    const event = {
      id: 'decision-' + decisions.length,
      conversationId,
      role: 'assistant',
      kind: 'action',
      text: 'Decision for proposal ' + match[1],
      action: { type: 'edit_step', stepId: 'inspect' },
      status: match[2] === 'confirm' ? 'applied' : 'rejected',
      resolvesEventId: match[1],
      createdAt: '2026-11-01T09:00:0' + (decisions.length + 1) + '.000Z',
    };
    actions.push(event);
    return route.fulfill({
      status: 200, contentType: 'application/json', body: JSON.stringify({ event }),
    });
  });
  await page.goto('/dashboard/pipeline');
  const dock = page.getByTestId('mator-chat');
  if (!(await dock.isVisible())) {
    await page.getByRole('button', { name: 'Open Mator' }).click();
  }
  const cards = dock.getByTestId('mator-confirmation');
  await expect(cards).toHaveCount(2);
  await cards.nth(0).getByTestId('mator-stage-confirm').click();
  await expect(cards.nth(0)).toHaveAttribute('data-status', 'applied');
  await expect(cards.nth(1)).toHaveAttribute('data-status', 'staged');
  await cards.nth(1).getByTestId('mator-stage-reject').click();
  await page.getByRole('dialog', { name: 'Reject this staged change?' }).getByTestId('alert-confirm').click();
  await expect(cards.nth(1)).toHaveAttribute('data-status', 'rejected');
  expect(decisions).toEqual([
    { stageId: firstId, decision: 'confirm' },
    { stageId: secondId, decision: 'reject' },
  ]);
  await capture(page, info, 'mator-independent-staged-decisions');
});

test('Mator creates a persisted workflow and accepts the first chat message', async ({ page }) => {
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
      version: 1, platform: 'linkedin', action: 'audit', name: 'Profile audit',
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
      return route.fulfill({ status: 201, contentType: 'application/json', body: JSON.stringify(record) });
    }
    return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(created ? [record] : []) });
  });
  await page.route('**/api/mator/workflows/*/conversations', (route) => {
    if (route.request().method() === 'POST') {
      conversationCreated = true;
      return route.fulfill({ status: 201, contentType: 'application/json',
        body: JSON.stringify({ id: conversationId, workflowId, title: 'New conversation',
          createdAt: now, updatedAt: now, lastMessageAt: null, boundRevisionId: null }),
      });
    }
    return route.fulfill({ status: 200, contentType: 'application/json',
      body: JSON.stringify({ currentId: null, items: [] }),
    });
  });
  await page.route('**/api/mator/conversations/*/events', (route) =>
    route.fulfill({ status: 200, contentType: 'application/json', body: '[]' })
  );
  await page.route('**/api/mator/conversations/*/messages', (route) => {
    message = (route.request().postDataJSON() as { text: string }).text;
    return route.fulfill({ status: 200, contentType: 'application/json',
      body: JSON.stringify({ events: [
        { id: 'first-input', conversationId, role: 'user', kind: 'message', text: message, createdAt: now },
        { id: 'first-reply', conversationId, role: 'assistant', kind: 'message',
          text: 'Mator received the first message',
          createdAt: '2026-11-01T09:00:01.000Z' },
      ] }),
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
  await expect(dock.getByText('Mator received the first message')).toBeVisible();
  expect(created).toBe(true);
  expect(conversationCreated).toBe(true);
  expect(message).toBe('I need my first workflow');
});

test('Growth modal uses the YAML catalogue with actionable search and pipeline detail', async ({ page }, info) => {
  const names = [
    'linkedin-profile', 'linkedin-branding', 'linkedin-analytics', 'linkedin-content',
    ...Array.from({ length: 17 }, (_, index) => 'linkedin-method-' + index),
  ];
  await page.route('**/api/growth/templates', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify(names.map((id) => ({
        id,
        title: id.replaceAll('-', ' '),
        objective: 'Evidence and owner approval are required',
        platform: 'linkedin',
        pipelineCount: id === 'linkedin-profile' ? 6 : 2,
        coverageCount: 2,
        executable: id === 'linkedin-profile' || id === 'linkedin-branding',
      }))),
    });
  });
  await page.route('**/api/growth/templates/linkedin-analytics', async (route) => {
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
        stages: [{
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
            steps: ['todo', 'procedure', 'action', 'event', 'verify'].map((id) => ({
              id, kind: 'note', title: 'Review ' + id,
            })),
            links: [],
          },
        }],
      }),
    });
  });

  await page.goto('/dashboard/pipeline');
  await page.getByRole('button', { name: 'Choose workflow template' }).click();
  const dialog = page.getByTestId('workflow-template-dialog');
  await expect(dialog).toBeVisible();
  await expect(dialog.getByTestId('growth-template-count')).toContainText('21 workflows');
  await expect(dialog.getByTestId('growth-template-option')).toHaveCount(21);
  await dialog.getByRole('searchbox', { name: 'Search Growth workflows' }).fill('analytics');
  await expect(dialog.getByTestId('growth-template-option')).toHaveCount(1);
  await expect(dialog.getByTestId('growth-template-pipeline-preview')).toBeVisible();
  await expect(dialog.getByText('Review procedure')).toBeVisible();
  await expect(dialog.getByText('Design only', { exact: true })).toBeVisible();
  await expect(dialog.getByRole('link', { name: 'View source YAML' })).toHaveAttribute('href', '/api/growth/templates/linkedin-analytics/yaml');
  await dialog.getByRole('searchbox', { name: 'Search Growth workflows' }).fill('not-a-template');
  await expect(dialog.getByTestId('growth-templates-empty')).toBeVisible();
  await dialog.getByRole('button', { name: 'Clear filters' }).click();
  await expect(dialog.getByTestId('growth-template-option')).toHaveCount(21);
  await capture(page, info, 'growth-template-library');
  await page.keyboard.press('Escape');
  await expect(dialog).toBeHidden();
});
