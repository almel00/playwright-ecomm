import { expect, type Page } from '@playwright/test';

export type ResidentCredentials = {
  firstName: string;
  room: string;
  pin: string;
};

export async function loginResident(page: Page, credentials: ResidentCredentials) {
  console.log('[login] Opening resident ordering site');
  await page.goto('/', { waitUntil: 'domcontentloaded' });
  await waitForAppReady(page);

  console.log('[login] Entering first name and room');
  await page.getByRole('textbox', { name: /first name/i }).fill(credentials.firstName);
  await page.getByRole('textbox', { name: /room #|room number|room/i }).fill(credentials.room);
  await page.getByRole('button', { name: /^login$/i }).click();
  await waitForAppReady(page);

  console.log('[login] Entering PIN');
  const pinInput = page.getByRole('textbox', { name: /enter pin|pin/i }).or(page.locator('input[type="password"]')).first();
  await expect(pinInput).toBeVisible();
  await pinInput.fill(credentials.pin);
  await page.getByRole('button', { name: /^login$/i }).click();
  await waitForAppReady(page);

  await dismissOptionalDialog(page);
  await expectResidentOrderingReady(page);
}

export async function logoutResident(page: Page) {
  console.log('[logout] Returning to logged-out state');
  const lowerLeftButton = page.locator('button').filter({ has: page.locator('svg') }).last();
  const namedLogout = page.getByRole('button', { name: /logout|log out|sign out/i }).first();

  if (await isVisible(namedLogout, 1_000)) {
    await namedLogout.click();
  } else {
    await lowerLeftButton.click();
  }

  await waitForAppReady(page);
  await dismissOptionalDialog(page);
  await expect(page.getByRole('textbox', { name: /first name/i })).toBeVisible({ timeout: 30_000 });
}

export async function dismissOptionalDialog(page: Page) {
  const ok = page.getByRole('button', { name: /^ok$/i }).first();
  if (await isVisible(ok, 2_000)) {
    await ok.click();
    await waitForAppReady(page);
  }
}

export async function waitForAppReady(page: Page) {
  await page.waitForLoadState('domcontentloaded').catch(() => {});
  await page.waitForLoadState('networkidle', { timeout: 10_000 }).catch(() => {});
  await page.locator('[role="progressbar"], .MuiCircularProgress-root').first().waitFor({ state: 'hidden', timeout: 10_000 }).catch(() => {});
  await page.waitForTimeout(500);
}

export async function isVisible(locator: ReturnType<Page['locator']>, timeout = 750) {
  try {
    await locator.waitFor({ state: 'visible', timeout });
    return true;
  } catch {
    return false;
  }
}

async function expectResidentOrderingReady(page: Page) {
  await page.waitForFunction(() => {
    const bodyText = document.body.innerText.toLowerCase();
    const stillOnPinScreen = bodyText.includes('please enter your pin') || bodyText.includes('enter pin');
    const hasOrderingSignal =
      bodyText.includes('in-room ordering') ||
      bodyText.includes('in room ordering') ||
      bodyText.includes('my transactions') ||
      bodyText.includes('menu') ||
      bodyText.includes('checkout') ||
      /\$\s*\d/.test(bodyText);

    return hasOrderingSignal && !stillOnPinScreen;
  }, null, { timeout: 30_000 }).catch(async () => {
    const bodyText = await page.locator('body').innerText().catch(() => '');
    throw new Error(`Resident login did not reach ordering/menu screen after PIN entry. Current page text starts with: ${bodyText.slice(0, 500)}`);
  });
}
