# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: mator-groq.e2e.test.ts >> Mator Groq settings and chat >> settings show free and paid models, and a chat turn reaches the backend
- Location: tests\mator-groq.e2e.test.ts:6:7

# Error details

```
Error: expect(locator).toBeVisible() failed

Locator: getByTestId('mator-model-chat')
Expected: visible
Timeout: 12000ms
Error: element(s) not found

Call log:
  - Expect "toBeVisible" getByTestId('mator-model-chat') with timeout 12000ms
  - waiting for getByTestId('mator-model-chat')

```

```yaml
- paragraph: Utomator / Studio
- paragraph: Local automation, evidence first
- status "Connecting to the engine"
- button "Account menu"
- complementary:
  - button "Workspace"
  - button "Résumés"
  - button "Intelligence"
  - button "Creator research"
  - button "Editorial drafts"
  - button "Growth"
- main:
  - complementary:
    - paragraph: Sodiq (Opeyemi) Oladejo
    - paragraph: 0 linked
    - navigation "Account":
      - button "Profile"
      - button "Networks"
      - button "Mator"
      - button "Preferences"
  - region "Mator":
    - heading "Mator" [level=1]
    - paragraph: Your key lets Mator write, listen, and look at pictures with you. It stays private after you save it.
- button "Open Mator": Mator
- alert
```

# Test source

```ts
  1  | import { expect, test } from '@playwright/test';
  2  | 
  3  | test.describe('Mator Groq settings and chat', () => {
  4  |   test.setTimeout(120_000);
  5  | 
  6  |   test('settings show free and paid models, and a chat turn reaches the backend', async ({
  7  |     page,
  8  |   }) => {
  9  |     const health = await page.request.get('http://127.0.0.1:3101/health');
  10 |     expect(health.ok(), 'Start the backend with pnpm dev:backend').toBeTruthy();
  11 | 
  12 |     await page.goto('/dashboard/settings');
  13 |     await expect(page.getByTestId('mator-settings-card')).toBeVisible();
  14 |     const chatModel = page.getByTestId('mator-model-chat');
> 15 |     await expect(chatModel).toBeVisible();
     |                             ^ Error: expect(locator).toBeVisible() failed
  16 |     const options = await chatModel.locator('option').allTextContents();
  17 |     expect(options.some((text) => text.includes('Free'))).toBeTruthy();
  18 |     expect(options.some((text) => text.includes('Paid'))).toBeTruthy();
  19 |     await expect(page.getByTestId('mator-model-vision')).toBeVisible();
  20 |     await expect(page.getByTestId('mator-model-speech-to-text')).toBeVisible();
  21 |     await expect(page.getByTestId('mator-model-text-to-speech')).toBeVisible();
  22 |     await expect(page.getByTestId('mator-reasoning-effort')).toBeVisible();
  23 |     await expect(page.getByTestId('mator-key-status')).toContainText(
  24 |       /Environment key|Saved key/,
  25 |     );
  26 | 
  27 |     const settings = await page.request.get('/api/mator/models');
  28 |     expect(settings.ok()).toBeTruthy();
  29 | 
  30 |     await page.goto('/dashboard/pipeline');
  31 |     const composer = page.locator('#mator-composer-input');
  32 |     await expect(composer).toBeVisible();
  33 |     await expect
  34 |       .poll(async () =>
  35 |         page.getByTestId('mator-conversation-switcher').inputValue(),
  36 |       )
  37 |       .not.toBe('');
  38 |     await expect(page.getByTestId('mator-chat')).toContainText(/Free|Paid/);
  39 | 
  40 |     const messageResponse = page.waitForResponse(
  41 |       (response) =>
  42 |         response.url().includes('/api/mator/conversations/') &&
  43 |         response.url().includes('/messages') &&
  44 |         response.request().method() === 'POST',
  45 |       { timeout: 90_000 },
  46 |     );
  47 |     await composer.fill(
  48 |       'Reply with a short how note only. Do not change any workflow step. Say ready.',
  49 |     );
  50 |     await page.getByRole('button', { name: 'Send message' }).click();
  51 |     const response = await messageResponse;
  52 |     expect(response.status(), await response.text()).toBe(200);
  53 |     const body = (await response.json()) as {
  54 |       events?: Array<{ role?: string; text?: string; status?: string }>;
  55 |     };
  56 |     expect(body.events?.some((event) => event.role === 'user')).toBeTruthy();
  57 |     const assistant = body.events?.find(
  58 |       (event) =>
  59 |         event.role === 'assistant' &&
  60 |         event.status !== 'error' &&
  61 |         (event.text?.length ?? 0) > 0,
  62 |     );
  63 |     expect(assistant?.text).toBeTruthy();
  64 |     await expect(page.getByTestId('mator-chat')).toContainText(
  65 |       assistant?.text?.slice(0, 24),
  66 |     );
  67 |   });
  68 | });
  69 | 
```