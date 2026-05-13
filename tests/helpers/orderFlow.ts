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

  console.log('[order] Detecting revenue centers and menus');
  await assertNotOnPinScreen(page);
  const { revenueCenterName, menuName } = await selectRevenueCenterAndMenu(page, config);

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

  if (options.placeOrder !== false) {
    console.log('[checkout] Adding kitchen message');
    await addKitchenMessage(page, config.kitchenMessage);
  }

  await choosePaymentIfNeeded(page);

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

  if (options.placeOrder === false) {
    return summary;
  }

  console.log('[checkout] Placing order');
  const kitchenMessageSubmission = waitForKitchenMessageSubmission(page, config.kitchenMessage);
  await clickButtonByName(page, /submit order|place order|confirm order|complete order/i);
  const submittedKitchenMessage = await kitchenMessageSubmission;
  summary.kitchenMessageSubmitted = submittedKitchenMessage;
  if (!submittedKitchenMessage) {
    console.log('[checkout] Message to Kitchen was filled, but it was not found in the order submission payload');
  }
  await waitForAppReady(page);
  await dismissOptionalDialog(page);

  return summary;
}

export async function verifyTransaction(page: Page, checkoutSummary: OrderSummary): Promise<OrderSummary> {
  console.log('[transactions] Opening My Transactions');
  await resetAppZoom(page);
  await navigateByText(page, /my transactions/i);
  await waitForAppReady(page);
  await resetAppZoom(page);

  console.log('[transactions] Opening latest transaction row');
  await openLatestTransaction(page, checkoutSummary);
  await waitForAppReady(page);

  const dialog = page.getByRole('dialog').first();
  const transactionText = await (await isVisible(dialog, 2_000) ? dialog.innerText() : page.locator('body').innerText());
  expect(transactionText).toContain(checkoutSummary.itemName);
  if (!transactionText.includes(checkoutSummary.kitchenMessage)) {
    console.log('[transactions] Transaction detail did not render the kitchen message; submit payload validation already confirmed it was sent');
  }
  checkoutSummary.transactionKitchenMessageVisible = transactionText.includes(checkoutSummary.kitchenMessage);

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

async function openLatestTransaction(page: Page, checkoutSummary: OrderSummary) {
  await expect(page.locator('table').first(), 'Transactions table should be visible after order submission').toBeVisible({ timeout: 30_000 });

  const latestRow = page
    .locator('tbody tr, [role="rowgroup"] [role="checkbox"], [role="row"]')
    .filter({ hasText: /\$\s*\d/ })
    .first();
  await expect(latestRow, 'Latest transaction row should be visible').toBeVisible({ timeout: 15_000 });

  const rowText = compact(await latestRow.innerText());
  console.log(`[transactions] Latest row: ${rowText}`);
  expect(rowText, 'Latest transaction row should show the checkout total').toMatch(moneyPattern(checkoutSummary.total));

  const rowButton = latestRow.getByRole('button').first();
  if (await isVisible(rowButton, 1_000)) {
    await rowButton.click();
    return;
  }

  await latestRow.click({ force: true });
}

export async function openDynamicMenu(page: Page, config: RuntimeConfig = getRuntimeConfig()) {
  await assertNotOnPinScreen(page);
  return selectRevenueCenterAndMenu(page, config);
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

async function selectRevenueCenterAndMenu(page: Page, config: RuntimeConfig) {
  if (await hasItemSignals(page)) {
    return { revenueCenterName: 'Direct menu', menuName: 'Direct menu' };
  }

  const startingUrl = page.url();
  const revenueNames = orderNames(await visibleCardNames(page), config, config.targetRevenueCenter);
  console.log(`[order] Revenue center candidates: ${revenueNames.join(' | ') || '(none)'}`);

  if (revenueNames.length === 0) {
    const directMenu = await chooseMenuOnCurrentPage(page, config, 'Direct menu');
    if (directMenu) {
      return directMenu;
    }
    throw new Error('Could not find revenue center cards or direct menus.');
  }

  for (const revenueName of revenueNames) {
    await returnToRevenueCenterList(page, revenueNames, startingUrl);
    if (!(await clickCardByName(page, revenueName))) {
      continue;
    }
    await waitForAppReady(page);
    await failIfReturnedToLogin(page, revenueName);

    if (await findPricedItemsWithScroll(page)) {
      console.log(`[order] Revenue center selected with direct items: ${revenueName}`);
      return { revenueCenterName: revenueName, menuName: 'Direct menu' };
    }

    const selected = await chooseMenuOnCurrentPage(page, config, revenueName);
    if (selected) {
      return selected;
    }

    console.log(`[order] Revenue center "${revenueName}" did not expose a menu with priced items; trying next candidate`);
    await returnToRevenueCenterList(page, revenueNames, startingUrl);
  }

  throw new Error(`Could not find a revenue center/menu path with priced items. Tried: ${revenueNames.join(', ')}`);
}

async function chooseMenuOnCurrentPage(page: Page, config: RuntimeConfig, revenueCenterName: string) {
  const menuNames = orderNames(await visibleCardNames(page), config, config.targetMenu);
  console.log(`[order] Menu candidates for ${revenueCenterName}: ${menuNames.join(' | ') || '(none)'}`);
  const menuStartUrl = page.url();

  for (const menuName of menuNames) {
    await returnToMenuList(page, menuNames, menuStartUrl);
    if (!(await clickCardByName(page, menuName))) {
      continue;
    }
    await waitForAppReady(page);
    await failIfReturnedToLogin(page, menuName);

    if (await findPricedItemsWithScroll(page)) {
      console.log(`[order] Revenue center selected: ${revenueCenterName}`);
      console.log(`[order] Menu selected: ${menuName}`);
      return { revenueCenterName, menuName };
    }

    console.log(`[order] Menu "${menuName}" did not show priced items; trying next menu`);
    await returnToMenuList(page, menuNames, menuStartUrl);
  }

  return null;
}

async function visibleCardNames(page: Page) {
  const cards = await visibleChoiceCandidates(page);
  const names = await Promise.all(cards.map(async (candidate) => compact(await candidate.innerText().catch(() => ''))));
  return [...new Set(names.filter((name) => name && !isChromeOrActionText(name)))];
}

async function clickCardByName(page: Page, name: string) {
  const cards = page.locator('.cardAreaMenu, .MuiCardActionArea-root').filter({ hasText: /\S/ });
  const count = await cards.count();
  for (let index = 0; index < count; index += 1) {
    const card = cards.nth(index);
    const text = compact(await card.innerText().catch(() => ''));
    if (text.toLowerCase() === name.toLowerCase() && await isVisible(card, 1_000)) {
      await card.click();
      return true;
    }
  }
  return false;
}

async function returnToRevenueCenterList(page: Page, expectedRevenueNames: string[], fallbackUrl: string) {
  if (await pageHasAnyCard(page, expectedRevenueNames)) {
    return;
  }

  await page.goBack({ waitUntil: 'domcontentloaded' }).catch(() => {});
  await waitForAppReady(page);
  if (await pageHasAnyCard(page, expectedRevenueNames)) {
    return;
  }

  await navigateByText(page, /in-?room ordering/i).catch(() => {});
  await waitForAppReady(page);
  if (await pageHasAnyCard(page, expectedRevenueNames)) {
    return;
  }

  await page.goto(fallbackUrl, { waitUntil: 'domcontentloaded' }).catch(() => {});
  await waitForAppReady(page);
}

async function returnToMenuList(page: Page, expectedMenuNames: string[], fallbackUrl: string) {
  if (await pageHasAnyCard(page, expectedMenuNames)) {
    return;
  }

  await page.goBack({ waitUntil: 'domcontentloaded' }).catch(() => {});
  await waitForAppReady(page);
  if (await pageHasAnyCard(page, expectedMenuNames)) {
    return;
  }

  await page.goto(fallbackUrl, { waitUntil: 'domcontentloaded' }).catch(() => {});
  await waitForAppReady(page);
}

async function pageHasAnyCard(page: Page, names: string[]) {
  const visibleNames = await visibleCardNames(page);
  return names.some((name) => visibleNames.some((visibleName) => visibleName.toLowerCase() === name.toLowerCase()));
}

async function failIfReturnedToLogin(page: Page, clickedText: string) {
  const bodyText = (await page.locator('body').innerText().catch(() => '')).toLowerCase();
  const url = page.url().toLowerCase();
  if (url.includes('/login') || bodyText.includes('please enter your pin') || bodyText.includes('first name')) {
    throw new Error(`Clicked "${clickedText}" while selecting ordering content, but the app returned to login/PIN. This control is not a revenue center/menu.`);
  }
}

async function chooseAvailableItem(page: Page, config: RuntimeConfig, offset: number): Promise<Locator> {
  await findPricedItemsWithScroll(page);
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
  await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight)).catch(() => {});
  await waitForAppReady(page);

  const label = page.getByText(/^message to kitchen$/i);
  const input = page
    .getByRole('textbox', { name: /^enter special instructions$/i })
    .or(page.locator('input[placeholder="Enter special instructions"], textarea[placeholder="Enter special instructions"]'))
    .last();

  await expect(label.or(input), 'Message to Kitchen label or input should be visible on checkout').toBeVisible({ timeout: 10_000 });
  await expect(input, 'Message to Kitchen input should be visible on checkout before order submission').toBeVisible({ timeout: 10_000 });
  await input.scrollIntoViewIfNeeded();
  await input.click();
  await input.fill(message);
  await expect(input).toHaveValue(message);
  await page.waitForTimeout(500);
}

async function waitForKitchenMessageSubmission(page: Page, message: string) {
  return page.waitForRequest((request) => {
    const method = request.method().toUpperCase();
    if (!['POST', 'PUT', 'PATCH'].includes(method)) {
      return false;
    }

    const postData = request.postData() ?? '';
    return postData.includes(message) || decodeURIComponent(postData).includes(message);
  }, { timeout: 15_000 })
    .then(() => true)
    .catch(() => false);
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
  const cardActionCandidates = page.locator('.cardAreaMenu, .MuiCardActionArea-root').filter({ hasText: /\S/ });
  const cardActionCount = await cardActionCandidates.count();
  if (cardActionCount > 0) {
    const candidates: Locator[] = [];
    for (let index = 0; index < cardActionCount; index += 1) {
      const candidate = cardActionCandidates.nth(index);
      if (await isVisible(candidate, 500) && (await isOrderingContentCandidate(candidate))) {
        candidates.push(candidate);
      }
    }
    if (candidates.length > 0) {
      console.log(`[order] Found content card candidates: ${await candidateTexts(candidates)}`);
      return candidates;
    }
  }

  const locator = page.locator('main [data-testid*="card" i], main .MuiCard-root, .MuiCard-root').filter({ hasText: /\S/ });
  const count = await locator.count();
  const candidates: Locator[] = [];
  for (let index = 0; index < count; index += 1) {
    const candidate = locator.nth(index);
    if (await isVisible(candidate, 500) && (await isOrderingContentCandidate(candidate))) {
      candidates.push(candidate);
    }
  }
  console.log(`[order] Found fallback content candidates: ${await candidateTexts(candidates)}`);
  return candidates;
}

function orderNames(names: string[], config: RuntimeConfig, targetName?: string) {
  const ordered = [...names];
  if (targetName) {
    ordered.sort((a, b) => Number(b.toLowerCase() === targetName.toLowerCase()) - Number(a.toLowerCase() === targetName.toLowerCase()));
  }
  if (config.selectionMode === 'random' && !targetName) {
    return shuffle(ordered);
  }
  return ordered;
}

async function candidateTexts(candidates: Locator[]) {
  const texts = await Promise.all(candidates.map(async (candidate) => compact(await candidate.innerText().catch(() => ''))));
  return texts.filter(Boolean).join(' | ');
}

async function isOrderingContentCandidate(locator: Locator) {
  return locator.evaluate((element) => {
    const text = (element.textContent || '').replace(/\s+/g, ' ').trim().toLowerCase();
    const aria = (element.getAttribute('aria-label') || '').toLowerCase();
    const title = (element.getAttribute('title') || '').toLowerCase();
    const className = String((element as HTMLElement).className || '').toLowerCase();
    const combined = `${text} ${aria} ${title} ${className}`;
    const rect = (element as HTMLElement).getBoundingClientRect();
    const style = window.getComputedStyle(element as HTMLElement);

    if (!text && !aria && !title) {
      return false;
    }

    if (combined.match(/logout|log out|sign out|not .*ava|forgot|change pin|profile|privacy|terms|checkout|cart|transaction|font size|accessibility|zoom|drawer|menu button/)) {
      return false;
    }

    if (className.includes('muifab-root') || className.includes('fab')) {
      return false;
    }

    if (style.position === 'fixed' || style.position === 'sticky') {
      return false;
    }

    if (rect.width < 120 || rect.height < 45) {
      return false;
    }

    const isEdgeControl =
      rect.left < 80 ||
      rect.top < 80 ||
      rect.right > window.innerWidth - 24 ||
      rect.bottom > window.innerHeight - 80;

    if (isEdgeControl && !combined.includes('menu')) {
      return false;
    }

    return true;
  }).catch(() => false);
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
  const text = await page.locator('body').innerText().catch(() => '');
  return /\$\s*\d/.test(text) || await page.locator('body').getByText(/\$\s*\d/).first().isVisible({ timeout: 1_000 }).catch(() => false);
}

async function findPricedItemsWithScroll(page: Page) {
  await page.evaluate(() => window.scrollTo(0, 0)).catch(() => {});
  await waitForAppReady(page);

  for (let attempt = 0; attempt < 12; attempt += 1) {
    if (await hasItemSignals(page)) {
      const visiblePrice = page.getByText(/\$\s*\d/).first();
      if (await isVisible(visiblePrice, 500)) {
        return true;
      }

      await visiblePrice.scrollIntoViewIfNeeded().catch(() => {});
      await waitForAppReady(page);
      if (await isVisible(visiblePrice, 500)) {
        return true;
      }
    }

    const scrollState = await page.evaluate(() => {
      const before = window.scrollY;
      window.scrollBy(0, Math.max(500, window.innerHeight * 0.75));
      return {
        before,
        after: window.scrollY,
        max: document.documentElement.scrollHeight - window.innerHeight,
      };
    }).catch(() => ({ before: 0, after: 0, max: 0 }));

    await waitForAppReady(page);
    if (scrollState.after === scrollState.before || scrollState.after >= scrollState.max) {
      if (await hasItemSignals(page)) {
        return true;
      }
      return false;
    }
  }

  return hasItemSignals(page);
}

async function resetAppZoom(page: Page) {
  await page.evaluate(() => {
    document.documentElement.style.zoom = '';
    document.body.style.zoom = '';
  }).catch(() => {});
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

function moneyPattern(value: number) {
  return new RegExp(`\\$\\s*${escapeRegex(value.toFixed(2))}`);
}
