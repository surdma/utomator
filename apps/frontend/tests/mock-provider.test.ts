import { join } from 'node:path';
import { expect, type Page, test } from '@playwright/test';

/** Self-contained mock provider page used to rehearse the sign-in flow. */
function fixtureUrl(search: string) {
  const file = join(
    process.cwd(),
    'tests',
    'mocks',
    'mock-provider-signin.html',
  ).replace(/\\/g, '/');
  return `file:///${file}${search}`;
}

const stage = (page: Page) => page.getByTestId('mock-provider-stage');

test('Mock provider happy path: sign-in → MFA → consent → success', async ({
  page,
}) => {
  await page.goto(fixtureUrl('?stage=signin'));
  await expect(stage(page)).toHaveAttribute('data-stage', 'signin');

  await page.getByTestId('mock-continue').click();
  await expect(stage(page)).toHaveAttribute('data-stage', 'mfa');

  await page.getByLabel('Authentication code').fill('246810');
  await page.getByTestId('mock-mfa-verify').click();
  await expect(stage(page)).toHaveAttribute('data-stage', 'consent');

  await page.getByTestId('mock-consent-allow').click();
  await expect(stage(page)).toHaveAttribute('data-stage', 'success');
  await expect(page.getByTestId('mock-owner-only-control')).toHaveText(
    'Edit profile',
  );
});

test('Mock provider MFA failure stops the flow before consent', async ({
  page,
}) => {
  await page.goto(fixtureUrl('?stage=mfa'));
  await page.getByLabel('Authentication code').fill('000000');
  await page.getByTestId('mock-mfa-verify').click();
  await expect(stage(page)).toHaveAttribute('data-stage', 'failure');

  // Retry returns to the beginning; consent is never reached.
  await page.getByTestId('mock-retry').click();
  await expect(stage(page)).toHaveAttribute('data-stage', 'signin');
  await expect(page.getByTestId('mock-consent-allow')).toBeHidden();
});

test('Mock provider consent denial and deliberate failures end in failure', async ({
  page,
}) => {
  await page.goto(fixtureUrl('?stage=consent'));
  await page.getByTestId('mock-consent-deny').click();
  await expect(stage(page)).toHaveAttribute('data-stage', 'failure');

  await page.goto(fixtureUrl('?stage=signin'));
  await page.getByTestId('mock-signin-fail').click();
  await expect(stage(page)).toHaveAttribute('data-stage', 'failure');

  await page.goto(fixtureUrl('?stage=mfa'));
  await page.getByTestId('mock-mfa-fail').click();
  await expect(stage(page)).toHaveAttribute('data-stage', 'failure');
});
