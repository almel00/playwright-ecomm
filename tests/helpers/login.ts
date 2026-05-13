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
  await enterPin(page, credentials.pin);
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
  await applyBrowserZoom(page);
  await page.waitForLoadState('networkidle', { timeout: 10_000 }).catch(() => {});
  await page.locator('[role="progressbar"], .MuiCircularProgress-root').first().waitFor({ state: 'hidden', timeout: 10_000 }).catch(() => {});
  await applyBrowserZoom(page);
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

async function enterPin(page: Page, pin: string) {
  const pinInput = page
    .locator('input[name*="pin" i], input[id*="pin" i], input[aria-label*="pin" i], input[type="password"], input')
    .last();

  await expect(pinInput).toBeVisible({ timeout: 15_000 });
  await pinInput.scrollIntoViewIfNeeded();
  await pinInput.click();
  await pinInput.press(process.platform === 'darwin' ? 'Meta+A' : 'Control+A').catch(() => {});
  await pinInput.fill('');
  await pinInput.type(pin, { delay: 75 });

  const currentValue = await pinInput.inputValue().catch(() => '');
  if (currentValue !== pin) {
    await pinInput.evaluate((element, value) => {
      const input = element as HTMLInputElement;
      input.value = value;
      input.dispatchEvent(new Event('input', { bubbles: true }));
      input.dispatchEvent(new Event('change', { bubbles: true }));
    }, pin);
  }

  await expect(pinInput).toHaveValue(pin, { timeout: 5_000 });
}

async function applyBrowserZoom(page: Page) {
  const zoom = Number(process.env.BROWSER_ZOOM || '0.67');
  if (!Number.isFinite(zoom) || zoom <= 0) {
    return;
  }

  await page.evaluate((value) => {
    document.documentElement.style.zoom = String(value);
    document.body.style.zoom = String(value);
  }, zoom).catch(() => {});
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
