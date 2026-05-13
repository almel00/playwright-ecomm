import fs from 'fs';
import path from 'path';
import { expect, type Locator, type Page } from '@playwright/test';

export type ModifierSummary = {
  name: string;
  price: number;
};

export type ItemSummary = {
  name: string;
  price: number;
  modifiers: ModifierSummary[];
};

export type OrderSummary = {
  runId: string;
  timestamp: string;
  siteName: string;
  siteSlug: string;
  baseUrl: string;
  envFile: string;
  reportDate: string;
  reportRunId: string;
  reportDir: string;
  selectionMode: string;
  revenueCenterName: string;
  menuName: string;
  itemName: string;
  itemPrice: number;
  items: ItemSummary[];
  modifiers: ModifierSummary[];
  subtotal: number;
  tax: number;
  taxPresent: boolean;
  discount: number;
  total: number;
  orderId: string;
  kitchenMessage: string;
  kitchenMessageSubmitted?: boolean;
  transactionKitchenMessageVisible?: boolean;
  checkoutTotalMatchesTransaction?: boolean;
};

export function moneyFromText(text: string): number | null {
  const match = text.replace(/,/g, '').match(/\$?\s*(-?\d+(?:\.\d{1,2})?)/);
  return match ? Number(match[1]) : null;
}

export function allMoneyFromText(text: string): number[] {
  return [...text.replace(/,/g, '').matchAll(/\$?\s*(-?\d+(?:\.\d{1,2})?)/g)].map((match) => Number(match[1]));
}

export async function extractCheckoutSummary(
  page: Page,
  details: {
    runId: string;
    siteName: string;
    siteSlug: string;
    baseUrl: string;
    envFile: string;
    reportDate: string;
    reportRunId: string;
    reportDir: string;
    selectionMode: string;
    revenueCenterName: string;
    menuName: string;
    items: ItemSummary[];
    kitchenMessage: string;
  },
): Promise<OrderSummary> {
  const body = await page.locator('body').innerText();
  const firstItem = details.items[0];
  const itemTotal = details.items.reduce((sum, item) => sum + item.price + item.modifiers.reduce((modifierSum, modifier) => modifierSum + modifier.price, 0), 0);
  const taxValue = findLabeledMoney(body, /\btax\b/i);
  const subtotal = findLabeledMoney(body, /subtotal/i) ?? itemTotal;
  const discount = findLabeledMoney(body, /discount/i) ?? 0;
  const tax = taxValue ?? 0;
  const total = findLabeledMoney(body, /amount due/i) ?? findLabeledMoney(body, /^total$/i) ?? subtotal + tax - discount;
  const orderId = findOrderId(body);
  const modifiers = details.items.flatMap((item) => item.modifiers);

  const summary: OrderSummary = {
    runId: details.runId,
    timestamp: new Date().toISOString(),
    siteName: details.siteName,
    siteSlug: details.siteSlug,
    baseUrl: details.baseUrl,
    envFile: details.envFile,
    reportDate: details.reportDate,
    reportRunId: details.reportRunId,
    reportDir: details.reportDir,
    selectionMode: details.selectionMode,
    revenueCenterName: details.revenueCenterName,
    menuName: details.menuName,
    itemName: firstItem.name,
    itemPrice: firstItem.price,
    items: details.items,
    modifiers,
    subtotal,
    tax,
    taxPresent: taxValue !== null,
    discount,
    total,
    orderId,
    kitchenMessage: details.kitchenMessage,
    kitchenMessageSubmitted: false,
  };

  validateMath(summary);
  return summary;
}

export async function extractItemNameAndPrice(item: Locator) {
  const rawText = await item.innerText();
  const text = compact(rawText);
  const prices = allMoneyFromText(text);
  const itemPrice = prices[0] ?? 0;
  const itemName = rawText
    .split(/\r?\n/)
    .map((line) => compact(line.replace(/\$?\s*-?\d+(?:\.\d{1,2})?/g, ' ')))
    .find((line) => line && !/description|calories|sold out|unavailable/i.test(line)) ?? compact(text.replace(/\$?\s*-?\d+(?:\.\d{1,2})?/g, ' '));

  expect(itemName.length, `Could not extract item name from "${text}"`).toBeGreaterThan(0);
  return { itemName, itemPrice };
}

export function validateMath(summary: Pick<OrderSummary, 'subtotal' | 'tax' | 'total'>) {
  const discount = 'discount' in summary && typeof summary.discount === 'number' ? summary.discount : 0;
  const expectedTotal = roundMoney(summary.subtotal + summary.tax - discount);
  expect(roundMoney(summary.total), `subtotal + tax - discount should equal total (${summary.subtotal} + ${summary.tax} - ${discount})`).toBe(expectedTotal);
}

export function compareSummaries(checkout: OrderSummary, transaction: OrderSummary) {
  expect(compact(transaction.itemName).toLowerCase()).toContain(compact(checkout.itemName).toLowerCase().slice(0, 20));
  expect(roundMoney(transaction.total)).toBe(roundMoney(checkout.total));

  for (const modifier of checkout.modifiers) {
    expect(transaction.modifiers.map((entry) => entry.name.toLowerCase()).join('\n')).toContain(modifier.name.toLowerCase());
  }

  checkout.checkoutTotalMatchesTransaction = roundMoney(transaction.total) === roundMoney(checkout.total);
}

export async function saveOrderSummary(summary: OrderSummary) {
  const latestPath = path.resolve(process.cwd(), 'test-results', 'order-summary.json');
  const runPath = path.resolve(summary.reportDir, 'order-summary.json');
  const dailyIndexPath = path.resolve(process.cwd(), 'test-results', 'reports', summary.siteSlug, summary.reportDate, 'runs.jsonl');

  for (const filePath of [latestPath, runPath, dailyIndexPath]) {
    fs.mkdirSync(path.dirname(filePath), { recursive: true });
  }

  fs.writeFileSync(latestPath, JSON.stringify(summary, null, 2));
  fs.writeFileSync(runPath, JSON.stringify(summary, null, 2));
  fs.appendFileSync(dailyIndexPath, `${JSON.stringify(summary)}\n`);
}

export function parseTransactionSummary(text: string, checkout: OrderSummary): OrderSummary {
  const subtotal = findLabeledMoney(text, /subtotal/i) ?? checkout.subtotal;
  const tax = findLabeledMoney(text, /\btax\b/i) ?? checkout.tax;
  const discount = findLabeledMoney(text, /discount/i) ?? checkout.discount;
  const total = findLabeledMoney(text, /amount due/i) ?? findLabeledMoney(text, /^total$/i) ?? checkout.total;
  const modifierNames = checkout.modifiers.filter((modifier) => text.toLowerCase().includes(modifier.name.toLowerCase()));

  return {
    runId: checkout.runId,
    timestamp: new Date().toISOString(),
    siteName: checkout.siteName,
    siteSlug: checkout.siteSlug,
    baseUrl: checkout.baseUrl,
    envFile: checkout.envFile,
    reportDate: checkout.reportDate,
    reportRunId: checkout.reportRunId,
    reportDir: checkout.reportDir,
    selectionMode: checkout.selectionMode,
    revenueCenterName: checkout.revenueCenterName,
    menuName: checkout.menuName,
    itemName: text.includes(checkout.itemName) ? checkout.itemName : firstMeaningfulLine(text),
    itemPrice: checkout.itemPrice,
    items: checkout.items,
    modifiers: modifierNames,
    subtotal,
    tax,
    taxPresent: findLabeledMoney(text, /\btax\b/i) !== null,
    discount,
    total,
    orderId: findOrderId(text) || checkout.orderId,
    kitchenMessage: checkout.kitchenMessage,
    kitchenMessageSubmitted: checkout.kitchenMessageSubmitted,
    transactionKitchenMessageVisible: text.includes(checkout.kitchenMessage),
  };
}

export function findLabeledMoney(text: string, label: RegExp): number | null {
  const lines = text.split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index];
    if (label.test(line)) {
      const values = allMoneyFromText(line);
      if (values.length > 0) {
        return values[values.length - 1];
      }
      const nearbyValues = allMoneyFromText(lines.slice(index + 1, index + 4).join('\n'));
      if (nearbyValues.length > 0) {
        return nearbyValues[0];
      }
    }
  }
  return null;
}

function firstMeaningfulLine(text: string) {
  return text.split(/\r?\n/).map((line) => line.trim()).find((line) => line.length > 0) ?? '';
}

export function compact(text: string) {
  return text.replace(/\s+/g, ' ').trim();
}

function findOrderId(text: string) {
  return text.match(/(?:order|confirmation|transaction)\s*(?:#|id|number)?\s*:?\s*([A-Z0-9-]{4,})/i)?.[1] ?? '';
}

function roundMoney(value: number) {
  return Math.round(value * 100) / 100;
}
