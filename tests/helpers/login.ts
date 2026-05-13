import { expect, type Page } from '@playwright/test';

export type ResidentCredentials = {
  firstName: string;
  room: string;
  pin: string;
};

export async function loginResident(page: Page, credentials: ResidentCredentials) {
  console.log('[login] Opening resident ordering site');
  await openResidentSite(page);
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
  const visiblePinInput = page.getByRole('textbox', { name: /enter pin/i });
  if (!(await isResidentOrderingReadyNow(page)) && await isVisible(visiblePinInput, 2_000)) {
    console.log('[login] PIN screen still visible after submit; retrying PIN once');
    await enterPin(page, credentials.pin);
    const loginButton = page.getByRole('button', { name: /^login$/i }).first();
    if (await isVisible(loginButton, 2_000)) {
      await loginButton.click();
      await waitForAppReady(page);
    }
  }

  await dismissOptionalDialog(page);
  await expectResidentOrderingReady(page);
}

async function openResidentSite(page: Page) {
  for (let attempt = 1; attempt <= 2; attempt += 1) {
    try {
      await page.goto('/', { waitUntil: 'domcontentloaded', timeout: 90_000 });
      return;
    } catch (error) {
      if (attempt === 2) {
        throw error;
      }
      console.log('[login] Site did not finish loading; retrying initial navigation');
      await page.goto('about:blank').catch(() => {});
    }
  }
}

export async function logoutResident(page: Page) {
  console.log('[logout] Returning to logged-out state');
  for (let attempt = 1; attempt <= 2; attempt += 1) {
    const namedLogout = page.getByRole('button', { name: /logout|log out|sign out/i }).first();
    if (await isVisible(namedLogout, 1_000)) {
      await namedLogout.click();
    } else {
      const clicked = await clickLowerLeftIconButton(page);
      if (!clicked) {
        console.log('[logout] Logout icon was not visible; clearing browser session as cleanup fallback');
        await clearSessionAndOpenLogin(page);
        break;
      }
    }

    await waitForAppReady(page);
    await dismissOptionalDialog(page);
    if (await isLoggedOutNow(page)) {
      break;
    }
  }
  await expectLoggedOut(page);
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

async function enterPin(page: Page, pin: string) {
  const pinInput = page
    .getByRole('textbox', { name: /enter pin/i })
    .or(page.locator('input[name*="pin" i], input[id*="pin" i], input[aria-label*="pin" i], input[type="password"]'))
    .first();

  await expect(pinInput).toBeVisible({ timeout: 15_000 });
  await pinInput.scrollIntoViewIfNeeded();
  await pinInput.click();
  await pinInput.press(process.platform === 'darwin' ? 'Meta+A' : 'Control+A').catch(() => {});
  if (await isResidentOrderingReadyNow(page)) {
    return;
  }
  await pinInput.fill('').catch(async (error) => {
    if (await isResidentOrderingReadyNow(page)) {
      return;
    }
    throw error;
  });
  await pinInput.type(pin, { delay: 75 });

  if (!(await isVisible(pinInput, 1_000))) {
    return;
  }

  const currentValue = await pinInput.inputValue().catch(() => pin);
  if (currentValue !== pin) {
    await pinInput.evaluate((element, value) => {
      const input = element as HTMLInputElement;
      input.value = value;
      input.dispatchEvent(new Event('input', { bubbles: true }));
      input.dispatchEvent(new Event('change', { bubbles: true }));
    }, pin).catch(() => {});
  }

  if (await isVisible(pinInput, 1_000)) {
    await expect(pinInput).toHaveValue(pin, { timeout: 5_000 });
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

async function expectLoggedOut(page: Page) {
  await expect.poll(async () => {
    return isLoggedOutNow(page);
  }, {
    message: 'Expected logged-out login screen with first-name and room inputs',
    timeout: 30_000,
  }).toBe(true);
}

async function isLoggedOutNow(page: Page) {
  const bodyText = (await page.locator('body').innerText().catch(() => '')).toLowerCase();
  const visibleInputCount = await visibleCount(page.locator('input'));
  const loginButtonVisible = await isVisible(page.getByRole('button', { name: /^login$/i }).first(), 500);
  return loginButtonVisible && visibleInputCount >= 2 && (bodyText.includes('first name') || bodyText.includes('please log into your account'));
}

async function isResidentOrderingReadyNow(page: Page) {
  return (await isVisible(page.getByText(/in-?room ordering/i).first(), 500)) ||
    (await isVisible(page.getByText(/my transactions/i).first(), 500)) ||
    (await isVisible(page.getByRole('button', { name: /^menu$/i }).first(), 500));
}

async function clickLowerLeftIconButton(page: Page) {
  const buttons = page.locator('button').filter({ has: page.locator('svg') });
  const count = await buttons.count();
  let selectedBox: { x: number; y: number; width: number; height: number } | null = null;
  let selectedScore = Number.NEGATIVE_INFINITY;
  const viewport = page.viewportSize() ?? { width: 1920, height: 1080 };

  for (let index = 0; index < count; index += 1) {
    const button = buttons.nth(index);
    if (!(await isVisible(button, 500))) {
      continue;
    }

    const box = await button.boundingBox().catch(() => null);
    if (!box) {
      continue;
    }

    const isLeftSide = box.x < viewport.width * 0.45;
    const isLowerHalf = box.y > viewport.height * 0.35;
    if (!isLeftSide || !isLowerHalf) {
      continue;
    }

    const score = box.y - box.x + (box.x < viewport.width * 0.2 ? 500 : 0);
    if (score > selectedScore) {
      selectedScore = score;
      selectedBox = box;
    }
  }

  if (!selectedBox) {
    return false;
  }

  await page.mouse.click(selectedBox.x + selectedBox.width / 2, selectedBox.y + selectedBox.height / 2);
  return true;
}

async function clearSessionAndOpenLogin(page: Page) {
  await page.evaluate(() => {
    window.localStorage.clear();
    window.sessionStorage.clear();
  }).catch(() => {});
  await page.context().clearCookies().catch(() => {});
  await page.goto('/', { waitUntil: 'domcontentloaded' }).catch(() => {});
  await waitForAppReady(page);
}

async function visibleCount(locator: ReturnType<Page['locator']>) {
  const count = await locator.count();
  let visible = 0;
  for (let index = 0; index < count; index += 1) {
    if (await isVisible(locator.nth(index), 250)) {
      visible += 1;
    }
  }
  return visible;
}
