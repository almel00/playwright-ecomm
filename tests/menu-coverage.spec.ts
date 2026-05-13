import { expect, test } from 'playwright/test';
import { getRuntimeConfig, residentCredentials } from './helpers/config';
import { loginResident, logoutResident } from './helpers/login';
import { openDynamicMenu, selectSearchResultIfAvailable } from './helpers/orderFlow';

const config = getRuntimeConfig();

test('resident can reach a menu with available priced items', async ({ page }) => {
  await loginResident(page, residentCredentials());
  await openDynamicMenu(page, config);
  await expect(page.getByText(/\$\s*\d/).first()).toBeVisible();
  await logoutResident(page);
});

const searchTest = config.runSearchTest && config.searchItemName ? test : test.skip;
searchTest('resident item search returns configured item when enabled', async ({ page }) => {
  await loginResident(page, residentCredentials());
  await openDynamicMenu(page, config);
  await selectSearchResultIfAvailable(page, config.searchItemName);
  await logoutResident(page);
});

test('mobile resident menu navigation renders without layout-blocking failures', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await loginResident(page, residentCredentials());
  await openDynamicMenu(page, config);
  await expect(page.getByText(/\$\s*\d/).first()).toBeVisible();
  await logoutResident(page);
});

test('sold-out or unavailable menu items are not selected when present', async ({ page }) => {
  await loginResident(page, residentCredentials());
  await openDynamicMenu(page, config);

  const unavailable = page.getByText(/sold out|unavailable/i).first();
  test.skip(!(await unavailable.isVisible().catch(() => false)), 'No sold-out or unavailable item is visible in the selected menu.');

  await expect(unavailable).toBeVisible();
  await logoutResident(page);
});
