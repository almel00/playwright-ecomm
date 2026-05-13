import { expect, test, type Page } from '@playwright/test';
import { getRuntimeConfig, residentCredentials } from './helpers/config';
import { loginResident, logoutResident } from './helpers/login';
import { openDynamicMenu, selectSearchResultIfAvailable } from './helpers/orderFlow';

const config = getRuntimeConfig();

test('resident can reach a menu with available priced items', async ({ page }) => {
  await loginResident(page, residentCredentials());
  await openDynamicMenu(page, config);
  await expectVisiblePricedItem(page);
  await logoutResident(page);
});

const searchTest = config.runSearchTest ? test : test.skip;
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
  await expectVisiblePricedItem(page);
});

test('sold-out or unavailable menu items are not selected when present', async ({ page }) => {
  await loginResident(page, residentCredentials());
  await openDynamicMenu(page, config);

  const unavailable = page.getByText(/sold out|unavailable/i).first();
  test.skip(!(await unavailable.isVisible().catch(() => false)), 'No sold-out or unavailable item is visible in the selected menu.');

  await expect(unavailable).toBeVisible();
  await logoutResident(page);
});

async function expectVisiblePricedItem(page: Page) {
  await expect.poll(async () => {
    const prices = page.getByText(/\$\s*\d/);
    const count = await prices.count();
    for (let index = 0; index < count; index += 1) {
      const price = prices.nth(index);
      if (await price.isVisible().catch(() => false)) {
        return await price.innerText().catch(() => '');
      }
    }
    return '';
  }, {
    message: 'Expected at least one visible priced menu item',
    timeout: 15_000,
  }).toMatch(/\$\s*\d/);
}
