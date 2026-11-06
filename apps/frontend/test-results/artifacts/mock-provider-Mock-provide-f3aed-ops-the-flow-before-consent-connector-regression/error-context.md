# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: mock-provider.test.ts >> Mock provider MFA failure stops the flow before consent
- Location: tests\mock-provider.test.ts:37:5

# Error details

```
Error: page.goto: net::ERR_FILE_NOT_FOUND at file:///C:/Users/olaitan/Dev/utomator/apps/frontend/tests/mocks/mock-provider-signin.html?stage=mfa
Call log:
  - navigating to "file:///C:/Users/olaitan/Dev/utomator/apps/frontend/tests/mocks/mock-provider-signin.html?stage=mfa", waiting until "load"

```

# Test source

```ts
  1  | import { join } from 'node:path';
  2  | import { expect, type Page, test } from '@playwright/test';
  3  | 
  4  | /** Self-contained mock provider page used to rehearse the sign-in flow. */
  5  | function fixtureUrl(search: string) {
  6  |   const file = join(
  7  |     process.cwd(),
  8  |     'tests',
  9  |     'mocks',
  10 |     'mock-provider-signin.html',
  11 |   ).replace(/\\/g, '/');
  12 |   return `file:///${file}${search}`;
  13 | }
  14 | 
  15 | const stage = (page: Page) => page.getByTestId('mock-provider-stage');
  16 | 
  17 | test('Mock provider happy path: sign-in → MFA → consent → success', async ({
  18 |   page,
  19 | }) => {
  20 |   await page.goto(fixtureUrl('?stage=signin'));
  21 |   await expect(stage(page)).toHaveAttribute('data-stage', 'signin');
  22 | 
  23 |   await page.getByTestId('mock-continue').click();
  24 |   await expect(stage(page)).toHaveAttribute('data-stage', 'mfa');
  25 | 
  26 |   await page.getByLabel('Authentication code').fill('246810');
  27 |   await page.getByTestId('mock-mfa-verify').click();
  28 |   await expect(stage(page)).toHaveAttribute('data-stage', 'consent');
  29 | 
  30 |   await page.getByTestId('mock-consent-allow').click();
  31 |   await expect(stage(page)).toHaveAttribute('data-stage', 'success');
  32 |   await expect(page.getByTestId('mock-owner-only-control')).toHaveText(
  33 |     'Edit profile',
  34 |   );
  35 | });
  36 | 
  37 | test('Mock provider MFA failure stops the flow before consent', async ({
  38 |   page,
  39 | }) => {
> 40 |   await page.goto(fixtureUrl('?stage=mfa'));
     |              ^ Error: page.goto: net::ERR_FILE_NOT_FOUND at file:///C:/Users/olaitan/Dev/utomator/apps/frontend/tests/mocks/mock-provider-signin.html?stage=mfa
  41 |   await page.getByLabel('Authentication code').fill('000000');
  42 |   await page.getByTestId('mock-mfa-verify').click();
  43 |   await expect(stage(page)).toHaveAttribute('data-stage', 'failure');
  44 | 
  45 |   // Retry returns to the beginning; consent is never reached.
  46 |   await page.getByTestId('mock-retry').click();
  47 |   await expect(stage(page)).toHaveAttribute('data-stage', 'signin');
  48 |   await expect(page.getByTestId('mock-consent-allow')).toBeHidden();
  49 | });
  50 | 
  51 | test('Mock provider consent denial and deliberate failures end in failure', async ({
  52 |   page,
  53 | }) => {
  54 |   await page.goto(fixtureUrl('?stage=consent'));
  55 |   await page.getByTestId('mock-consent-deny').click();
  56 |   await expect(stage(page)).toHaveAttribute('data-stage', 'failure');
  57 | 
  58 |   await page.goto(fixtureUrl('?stage=signin'));
  59 |   await page.getByTestId('mock-signin-fail').click();
  60 |   await expect(stage(page)).toHaveAttribute('data-stage', 'failure');
  61 | 
  62 |   await page.goto(fixtureUrl('?stage=mfa'));
  63 |   await page.getByTestId('mock-mfa-fail').click();
  64 |   await expect(stage(page)).toHaveAttribute('data-stage', 'failure');
  65 | });
  66 | 
```