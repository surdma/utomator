import { expect, test } from '@playwright/test';

test.describe('Mator Groq settings and chat', () => {
  test.setTimeout(120_000);

  test('settings show free and paid models, and a chat turn reaches the backend', async ({
    page,
  }) => {
    const health = await page.request.get('http://127.0.0.1:3101/health');
    expect(health.ok(), 'Start the backend with pnpm dev:backend').toBeTruthy();

    await page.goto('/dashboard/settings');
    await expect(page.getByTestId('mator-settings-card')).toBeVisible();
    const chatModel = page.getByTestId('mator-model-chat');
    await expect(chatModel).toBeVisible();
    const options = await chatModel.locator('option').allTextContents();
    expect(options.some((text) => text.includes('Free'))).toBeTruthy();
    expect(options.some((text) => text.includes('Paid'))).toBeTruthy();
    await expect(page.getByTestId('mator-model-vision')).toBeVisible();
    await expect(page.getByTestId('mator-model-speech-to-text')).toBeVisible();
    await expect(page.getByTestId('mator-model-text-to-speech')).toBeVisible();
    await expect(page.getByTestId('mator-reasoning-effort')).toBeVisible();
    await expect(page.getByTestId('mator-key-status')).toContainText(
      /Environment key|Saved key/
    );

    const settings = await page.request.get('/api/mator/models');
    expect(settings.ok()).toBeTruthy();

    await page.goto('/dashboard/pipeline');
    const composer = page.locator('#mator-composer-input');
    await expect(composer).toBeVisible();
    await expect
      .poll(async () =>
        page.getByTestId('mator-conversation-switcher').inputValue()
      )
      .not.toBe('');
    await expect(page.getByTestId('mator-chat')).toContainText(/Free|Paid/);

    const messageResponse = page.waitForResponse(
      (response) =>
        response.url().includes('/api/mator/conversations/') &&
        response.url().includes('/messages') &&
        response.request().method() === 'POST',
      { timeout: 90_000 }
    );
    await composer.fill(
      'Reply with a short how note only. Do not change any workflow step. Say ready.'
    );
    await page.getByRole('button', { name: 'Send message' }).click();
    const response = await messageResponse;
    expect(response.status(), await response.text()).toBe(200);
    const body = (await response.json()) as {
      events?: Array<{ role?: string; text?: string; status?: string }>;
    };
    expect(body.events?.some((event) => event.role === 'user')).toBeTruthy();
    const assistant = body.events?.find(
      (event) =>
        event.role === 'assistant' &&
        event.status !== 'error' &&
        (event.text?.length ?? 0) > 0
    );
    expect(assistant?.text).toBeTruthy();
    await expect(page.getByTestId('mator-chat')).toContainText(
      assistant!.text!.slice(0, 24)
    );
  });
});
