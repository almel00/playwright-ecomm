import { expect, type Locator, type Page } from 'playwright/test';
import { compact, extractCheckoutSummary, extractItemNameAndPrice, moneyFromText, parseTransactionSummary, type ModifierSummary, type OrderSummary } from './orderTotals';
import { dismissOptionalDialog, isVisible, waitForAppReady } from './login';

const KITCHEN_MESSAGE = 'Servingintel test. Please do not make!';

export async function completeOrderingFlow(page: Page): Promise<OrderSummary> {
  console.log('[order] Detecting revenue centers or direct menu view');
  await selectRevenueCenterIfPresent(page);

  console.log('[order] Selecting a menu dynamically');
  await selectFirstMenu(page);

  console.log('[order] Selecting an available item dynamically');
  const item = await chooseFirstAvailableItem(page);
  const { itemName, itemPrice } = await extractItemNameAndPrice(item);
  await item.click();
  await waitForAppReady(page);

  console.log(`[order] Selected item: ${itemName} ($${itemPrice.toFixed(2)})`);
  const modifiers = await selectModifiersIfPresent(page);

  console.log('[order] Adding item to order');
  await clickButtonByName(page, /add to check|add to cart|add item|add/i);
  await waitForAppReady(page);

  console.log('[order] Opening checkout from lower-right popup/button');
  await openCheckout(page);

  console.log('[checkout] Adding kitchen message');
  await addKitchenMessage(page, KITCHEN_MESSAGE);

  console.log('[checkout] Capturing subtotal, tax, and total');
  const summary = await extractCheckoutSummary(page, itemName, itemPrice, modifiers);
  await choosePaymentIfNeeded(page);

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
  expect(transactionText).toContain(KITCHEN_MESSAGE);

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

async function selectRevenueCenterIfPresent(page: Page) {
  const menuAlreadyVisible = await hasMenuSignals(page);
  if (menuAlreadyVisible) {
    return;
  }

  const candidates = await visibleChoiceCandidates(page);
  for (const candidate of candidates) {
    const text = compact(await candidate.innerText().catch(() => ''));
    if (!text || isChromeOrActionText(text)) {
      continue;
    }

    await candidate.click();
    await waitForAppReady(page);
    if (await hasMenuSignals(page)) {
      console.log(`[order] Revenue center selected: ${text}`);
      return;
    }
    await page.goBack({ waitUntil: 'domcontentloaded' }).catch(() => {});
    await waitForAppReady(page);
  }
}

async function selectFirstMenu(page: Page) {
  const candidates = await visibleChoiceCandidates(page);
  for (const candidate of candidates) {
    const text = compact(await candidate.innerText().catch(() => ''));
    if (!text || isChromeOrActionText(text)) {
      continue;
    }

    await candidate.click();
    await waitForAppReady(page);
    if (await hasItemSignals(page)) {
      console.log(`[order] Menu selected: ${text}`);
      return;
    }
  }
  throw new Error('Could not find a visible menu with items.');
}

async function chooseFirstAvailableItem(page: Page): Promise<Locator> {
  const itemCards = page.locator('[data-testid*="item" i], [aria-label*="$"], .MuiCard-root', { hasText: /\$\s*\d/ });
  const count = await itemCards.count();
  for (let index = 0; index < count; index += 1) {
    const item = itemCards.nth(index);
    const text = compact(await item.innerText().catch(() => ''));
    if (await isVisible(item) && /\$\s*\d/.test(text) && !/sold out|unavailable/i.test(text)) {
      return item;
    }
  }

  const pricedText = page.getByText(/\$\s*\d/).first();
  await expect(pricedText).toBeVisible();
  return pricedText;
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
    if (await isVisible(candidate, 500)) {
      candidates.push(candidate);
    }
  }
  return candidates;
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
  return /login|logout|log out|privacy|terms|checkout|cart|profile|transactions|in-?room ordering|^menu$|close|ok/i.test(text);
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

function escapeRegex(value: string) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}
