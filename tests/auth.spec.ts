import { expect, test } from '@playwright/test';
import { getRuntimeConfig, residentCredentials } from './helpers/config';
import { dismissOptionalDialog, loginResident, logoutResident, waitForAppReady } from './helpers/login';

const config = getRuntimeConfig();

test('resident can log in and log out', async ({ page }) => {
  await loginResident(page, residentCredentials());
  await logoutResident(page);
});

const invalidLoginTest = config.invalidFirstName && config.invalidRoom && config.invalidPin ? test : test.skip;
invalidLoginTest('invalid resident login is rejected when invalid credentials are configured', async ({ page }) => {
  await page.goto('/', { waitUntil: 'domcontentloaded' });
  await waitForAppReady(page);
  await page.getByRole('textbox', { name: /first name/i }).fill(config.invalidFirstName);
  await page.getByRole('textbox', { name: /room #|room number|room/i }).fill(config.invalidRoom);
  await page.getByRole('button', { name: /^login$/i }).click();
  await waitForAppReady(page);

  const pinInput = page.getByRole('textbox', { name: /enter pin|pin/i }).or(page.locator('input[type="password"]')).first();
  if (await pinInput.isVisible().catch(() => false)) {
    await pinInput.fill(config.invalidPin);
    await page.getByRole('button', { name: /^login$/i }).click();
    await waitForAppReady(page);
  }

  await dismissOptionalDialog(page);
  await expect(page.getByRole('textbox', { name: /first name|enter pin|pin/i }).first()).toBeVisible();
});
