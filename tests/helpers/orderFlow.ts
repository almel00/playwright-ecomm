import { expect, type Locator, type Page } from '@playwright/test';
import { getRuntimeConfig, type RuntimeConfig } from './config';
import { compact, extractCheckoutSummary, extractItemNameAndPrice, moneyFromText, parseTransactionSummary, type ItemSummary, type ModifierSummary, type OrderSummary } from './orderTotals';
import { dismissOptionalDialog, isVisible, waitForAppReady } from './login';

export type OrderFlowOptions = {
  itemCount?: number;
  placeOrder?: boolean;
  config?: RuntimeConfig;
};

export async function completeOrderingFlow(page: Page, options: OrderFlowOptions = {}): Promise<OrderSummary> {
  const config = options.config ?? getRuntimeConfig();
  const itemCount = options.itemCount ?? 1;
  const runId = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

  console.log('[order] Detecting revenue centers or direct menu view');
  await assertNotOnPinScreen(page);
  const revenueCenterName = await selectRevenueCenterIfPresent(page, config);

  console.log('[order] Selecting a menu dynamically');
  const menuName = await selectMenu(page, config);

  const items: ItemSummary[] = [];
  for (let index = 0; index < itemCount; index += 1) {
    console.log(`[order] Selecting available item ${index + 1} of ${itemCount}`);
    const item = await chooseAvailableItem(page, config, index);
    const { itemName, itemPrice } = await extractItemNameAndPrice(item);
    await item.click();
    await waitForAppReady(page);

    console.log(`[order] Selected item: ${itemName} ($${itemPrice.toFixed(2)})`);
    const modifiers = await selectModifiersIfPresent(page);

    console.log('[order] Adding item to order');
    await clickButtonByName(page, /add to check|add to cart|add item|add/i);
    await waitForAppReady(page);
    items.push({ name: itemName, price: itemPrice, modifiers });
  }

  console.log('[order] Opening checkout from lower-right popup/button');
  await openCheckout(page);

  console.log('[checkout] Adding kitchen message');
  await addKitchenMessage(page, config.kitchenMessage);

  console.log('[checkout] Capturing subtotal, tax, and total');
  const summary = await extractCheckoutSummary(page, {
    runId,
    siteName: config.siteName,
    siteSlug: config.siteSlug,
    baseUrl: config.baseUrl,
    envFile: config.envFile,
    reportDate: config.reportDate,
    reportRunId: config.reportRunId,
    reportDir: config.reportDir,
    selectionMode: config.selectionMode,
    revenueCenterName,
    menuName,
    items,
    kitchenMessage: config.kitchenMessage,
  });
  await choosePaymentIfNeeded(page);

  if (options.placeOrder === false) {
    return summary;
  }

  console.log('[checkout] Placing order');
  await clickButtonByName(page, /submit order|place order|confirm order|complete order/i);
  await waitForAppReady(page);
  await dismissOptionalDialog(page);

  return summary;
}

export async function verifyTransaction(page: Page, checkoutSummary: OrderSummary): Promise<OrderSummary> {
  console.log('[transactions] Opening My Transactions');
  await navigateByText(page, /my transactions/i);
  await waitForAppReady(page);

  console.log('[transactions] Opening latest matching transaction');
  const row = page.locator('tr', { hasText: String(Math.trunc(checkoutSummary.total)) }).first();
  if (await isVisible(row, 5_000)) {
    const rowButton = row.getByRole('button').first();
    if (await isVisible(rowButton, 1_000)) {
      await rowButton.click();
    } else {
      await row.click();
    }
  } else {
    await page.getByText(new RegExp(escapeRegex(checkoutSummary.itemName), 'i')).first().click();
  }
  await waitForAppReady(page);

  const dialog = page.getByRole('dialog').first();
  const transactionText = await (await isVisible(dialog, 2_000) ? dialog.innerText() : page.locator('body').innerText());
  expect(transactionText).toContain(checkoutSummary.itemName);
  expect(transactionText).toContain(checkoutSummary.kitchenMessage);

  const transactionSummary = parseTransactionSummary(transactionText, checkoutSummary);
  const close = page.getByRole('button', { name: /close|ok/i }).first();
  if (await isVisible(close, 1_000)) {
    await close.click();
    await waitForAppReady(page);
  }

  console.log('[navigation] Returning to In Room Ordering');
  await navigateByText(page, /in-?room ordering/i);
  await waitForAppReady(page);
  return transactionSummary;
}

export async function openDynamicMenu(page: Page, config: RuntimeConfig = getRuntimeConfig()) {
  await assertNotOnPinScreen(page);
  const revenueCenterName = await selectRevenueCenterIfPresent(page, config);
  const menuName = await selectMenu(page, config);
  return { revenueCenterName, menuName };
}

async function assertNotOnPinScreen(page: Page) {
  const bodyText = (await page.locator('body').innerText().catch(() => '')).toLowerCase();
  if (bodyText.includes('please enter your pin') || bodyText.includes('enter pin')) {
    throw new Error('Expected resident ordering screen, but the app is still on the PIN login page. Verify RESIDENT_PIN and PIN input handling.');
  }
}

export async function selectSearchResultIfAvailable(page: Page, searchText?: string) {
  const query = searchText || await visibleItemName(page);
  const searchBox = page.locator('input[type="search"], input[placeholder*="search" i], input[name*="search" i], input[id*="search" i]').first();
  if (await isVisible(searchBox, 2_000)) {
    await searchBox.fill(query);
    await searchBox.press('Enter').catch(() => {});
    await waitForAppReady(page);
    await expect(page.getByText(new RegExp(escapeRegex(query), 'i')).first()).toBeVisible();
    return;
  }

  testSkip(`Search input was not visible for discovered item "${query}".`);
}

async function selectRevenueCenterIfPresent(page: Page, config: RuntimeConfig) {
  const menuAlreadyVisible = await hasMenuSignals(page);
  if (menuAlreadyVisible) {
    return 'Direct menu';
  }

  const candidates = await orderCandidates(await visibleChoiceCandidates(page), config, config.targetRevenueCenter);
  for (const candidate of candidates) {
    const text = compact(await candidate.innerText().catch(() => ''));
    if (!text || isChromeOrActionText(text)) {
      continue;
    }

    await candidate.click();
    await waitForAppReady(page);
    await failIfReturnedToLogin(page, text);
    if (await hasMenuSignals(page)) {
      console.log(`[order] Revenue center selected: ${text}`);
      return text;
    }
    await page.goBack({ waitUntil: 'domcontentloaded' }).catch(() => {});
    await waitForAppReady(page);
  }
}

async function selectMenu(page: Page, config: RuntimeConfig) {
  const candidates = await orderCandidates(await visibleChoiceCandidates(page), config, config.targetMenu);
  for (const candidate of candidates) {
    const text = compact(await candidate.innerText().catch(() => ''));
    if (!text || isChromeOrActionText(text)) {
      continue;
    }

    await candidate.click();
    await waitForAppReady(page);
    await failIfReturnedToLogin(page, text);
    if (await hasItemSignals(page)) {
      console.log(`[order] Menu selected: ${text}`);
      return text;
    }
  }
  throw new Error('Could not find a visible menu with items.');
}

async function failIfReturnedToLogin(page: Page, clickedText: string) {
  const bodyText = (await page.locator('body').innerText().catch(() => '')).toLowerCase();
  const url = page.url().toLowerCase();
  if (url.includes('/login') || bodyText.includes('please enter your pin') || bodyText.includes('first name')) {
    throw new Error(`Clicked "${clickedText}" while selecting ordering content, but the app returned to login/PIN. This control is not a revenue center/menu.`);
  }
}

async function chooseAvailableItem(page: Page, config: RuntimeConfig, offset: number): Promise<Locator> {
  const itemCards = page.locator('[data-testid*="item" i], [aria-label*="$"], .MuiCard-root', { hasText: /\$\s*\d/ });
  const candidates: Locator[] = [];
  const count = await itemCards.count();
  for (let index = 0; index < count; index += 1) {
    const item = itemCards.nth(index);
    const text = compact(await item.innerText().catch(() => ''));
    if (await isVisible(item) && /\$\s*\d/.test(text) && !/sold out|unavailable/i.test(text)) {
      candidates.push(item);
    }
  }

  if (candidates.length === 0) {
    const pricedText = page.getByText(/\$\s*\d/).first();
    await expect(pricedText).toBeVisible();
    return pricedText;
  }

  const ordered = await orderCandidates(candidates, config, config.targetItem);
  return ordered[Math.min(offset, ordered.length - 1)];
}

async function visibleItemName(page: Page) {
  const item = await chooseAvailableItem(page, { ...getRuntimeConfig(), targetItem: undefined }, 0);
  const { itemName } = await extractItemNameAndPrice(item);
  return itemName;
}

async function selectModifiersIfPresent(page: Page): Promise<ModifierSummary[]> {
  const addButton = page.getByRole('button', { name: /add to check|add to cart|add item|add/i }).first();
  const modifiers: ModifierSummary[] = [];

  if (await isVisible(addButton, 1_500) && await addButton.isEnabled()) {
    return modifiers;
  }

  const optionControls = page.locator('label, [role="checkbox"], [role="radio"], input[type="checkbox"], input[type="radio"]').filter({ hasNotText: /pickup|delivery|meal credit|cash|card/i });
  const count = await optionControls.count();
  for (let index = 0; index < count; index += 1) {
    const option = optionControls.nth(index);
    if (!(await isVisible(option, 500))) {
      continue;
    }

    const text = compact(await option.innerText().catch(() => ''));
    if (!text || isChromeOrActionText(text)) {
      continue;
    }

    await option.click({ force: true });
    await waitForAppReady(page);
    modifiers.push({
      name: text.replace(/\$?\s*-?\d+(?:\.\d{1,2})?/g, '').trim() || text,
      price: moneyFromText(text) ?? 0,
    });

    if (await isVisible(addButton, 1_000) && await addButton.isEnabled()) {
      break;
    }
  }

  if (await isVisible(addButton, 1_000)) {
    await expect(addButton).toBeEnabled();
  }
  return dedupeModifiers(modifiers);
}

async function openCheckout(page: Page) {
  const checkoutText = page.getByText(/^checkout$/i).last();
  if (await isVisible(checkoutText, 2_000)) {
    await checkoutText.click();
    await waitForAppReady(page);
  }

  const proceed = page.getByRole('button', { name: /proceed to checkout|checkout/i }).first();
  if (await isVisible(proceed, 5_000)) {
    await proceed.click();
    await waitForAppReady(page);
  }
}

async function addKitchenMessage(page: Page, message: string) {
  const input = page.getByRole('textbox', { name: /special instructions|kitchen|message/i }).first();
  await expect(input).toBeVisible();
  await input.fill(message);
}

async function choosePaymentIfNeeded(page: Page) {
  const mealCredit = page.getByRole('button', { name: /meal credit/i }).or(page.getByText(/^meal credit$/i)).first();
  if (await isVisible(mealCredit, 2_000)) {
    await mealCredit.click();
    await waitForAppReady(page);
  }
}

async function clickButtonByName(page: Page, name: RegExp) {
  const button = page.getByRole('button', { name }).first();
  await expect(button).toBeVisible();
  await expect(button).toBeEnabled();
  await button.click();
}

async function navigateByText(page: Page, text: RegExp) {
  const link = page.getByRole('link', { name: text }).or(page.locator('a').filter({ hasText: text })).first();
  await expect(link).toBeVisible();
  await link.click();
}

async function visibleChoiceCandidates(page: Page) {
  const locator = page.locator('button, [role="button"], [data-testid*="card" i], .MuiCard-root').filter({ hasText: /\S/ });
  const count = await locator.count();
  const candidates: Locator[] = [];
  for (let index = 0; index < count; index += 1) {
    const candidate = locator.nth(index);
    if (await isVisible(candidate, 500) && !(await isNonOrderingControl(candidate))) {
      candidates.push(candidate);
    }
  }
  return candidates;
}

async function isNonOrderingControl(locator: Locator) {
  return locator.evaluate((element) => {
    const text = (element.textContent || '').replace(/\s+/g, ' ').trim().toLowerCase();
    const aria = (element.getAttribute('aria-label') || '').toLowerCase();
    const title = (element.getAttribute('title') || '').toLowerCase();
    const className = String((element as HTMLElement).className || '').toLowerCase();
    const combined = `${text} ${aria} ${title} ${className}`;
    const rect = (element as HTMLElement).getBoundingClientRect();
    const style = window.getComputedStyle(element as HTMLElement);

    if (!text && !aria && !title) {
      return true;
    }

    if (combined.match(/logout|log out|sign out|not .*ava|forgot|change pin|profile|privacy|terms|checkout|cart|transaction|font size|accessibility|zoom|drawer|menu button/)) {
      return true;
    }

    if (className.includes('muifab-root') || className.includes('fab')) {
      return true;
    }

    if ((style.position === 'fixed' || style.position === 'sticky') && (rect.bottom > window.innerHeight - 160 || rect.left < 120)) {
      return true;
    }

    return false;
  }).catch(() => true);
}

async function hasMenuSignals(page: Page) {
  const menuChoices = page.locator('button, [role="button"], .MuiCard-root').filter({ hasText: /menu/i });
  const count = await menuChoices.count();
  for (let index = 0; index < count; index += 1) {
    const choice = menuChoices.nth(index);
    const text = compact(await choice.innerText().catch(() => ''));
    if (await isVisible(choice, 500) && text && !isChromeOrActionText(text)) {
      return true;
    }
  }
  return false;
}

async function hasItemSignals(page: Page) {
  return await page.locator('body').getByText(/\$\s*\d/).first().isVisible({ timeout: 3_000 }).catch(() => false);
}

function isChromeOrActionText(text: string) {
  return /login|logout|log out|sign out|not .*ava|forgot|change pin|privacy|terms|checkout|cart|profile|transactions|font size|accessibility|in-?room ordering|^menu$|close|ok/i.test(text);
}

function dedupeModifiers(modifiers: ModifierSummary[]) {
  const seen = new Set<string>();
  return modifiers.filter((modifier) => {
    const key = `${modifier.name}:${modifier.price}`;
    if (seen.has(key)) {
      return false;
    }
    seen.add(key);
    return true;
  });
}

async function orderCandidates(candidates: Locator[], config: RuntimeConfig, targetName?: string) {
  const ordered = [...candidates];
  if (targetName) {
    const scored = await Promise.all(ordered.map(async (locator) => ({
      locator,
      matchesTarget: await locatorMayContain(locator, targetName),
    })));
    return scored
      .sort((a, b) => Number(b.matchesTarget) - Number(a.matchesTarget))
      .map((entry) => entry.locator);
  }
  if (config.selectionMode === 'random' && !targetName) {
    return shuffle(ordered);
  }
  return ordered;
}

async function locatorMayContain(locator: Locator, value: string) {
  const text = compact(await locator.innerText().catch(() => ''));
  return text.toLowerCase().includes(value.toLowerCase());
}

function shuffle<T>(values: T[]) {
  const shuffled = [...values];
  for (let index = shuffled.length - 1; index > 0; index -= 1) {
    const swapIndex = Math.floor(Math.random() * (index + 1));
    [shuffled[index], shuffled[swapIndex]] = [shuffled[swapIndex], shuffled[index]];
  }
  return shuffled;
}

function testSkip(message: string): never {
  throw new Error(`SKIP: ${message}`);
}

function escapeRegex(value: string) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}
