import fs from 'fs';
import path from 'path';
import { expect, type Locator, type Page } from 'playwright/test';

export type ModifierSummary = {
  name: string;
  price: number;
};

export type OrderSummary = {
  itemName: string;
  itemPrice: number;
  modifiers: ModifierSummary[];
  subtotal: number;
  tax: number;
  total: number;
};

export function moneyFromText(text: string): number | null {
  const match = text.replace(/,/g, '').match(/\$?\s*(-?\d+(?:\.\d{1,2})?)/);
  return match ? Number(match[1]) : null;
}

export function allMoneyFromText(text: string): number[] {
  return [...text.replace(/,/g, '').matchAll(/\$?\s*(-?\d+(?:\.\d{1,2})?)/g)].map((match) => Number(match[1]));
}

export async function extractCheckoutSummary(page: Page, fallbackItemName: string, fallbackItemPrice: number, modifiers: ModifierSummary[]): Promise<OrderSummary> {
  const body = await page.locator('body').innerText();
  const subtotal = findLabeledMoney(body, /subtotal/i) ?? fallbackItemPrice + modifiers.reduce((sum, modifier) => sum + modifier.price, 0);
  const tax = findLabeledMoney(body, /\btax\b/i) ?? 0;
  const total = findLabeledMoney(body, /\btotal\b|amount due/i) ?? subtotal + tax;

  const summary: OrderSummary = {
    itemName: fallbackItemName,
    itemPrice: fallbackItemPrice,
    modifiers,
    subtotal,
    tax,
    total,
  };

  validateMath(summary);
  return summary;
}

export async function extractItemNameAndPrice(item: Locator) {
  const text = compact(await item.innerText());
  const prices = allMoneyFromText(text);
  const itemPrice = prices[0] ?? 0;
  const itemName = compact(text.replace(/\$?\s*-?\d+(?:\.\d{1,2})?/g, ' '))
    .split(/description|calories/i)[0]
    .trim();

  expect(itemName.length, `Could not extract item name from "${text}"`).toBeGreaterThan(0);
  return { itemName, itemPrice };
}

export function validateMath(summary: Pick<OrderSummary, 'subtotal' | 'tax' | 'total'>) {
  const expectedTotal = roundMoney(summary.subtotal + summary.tax);
  expect(roundMoney(summary.total), `subtotal + tax should equal total (${summary.subtotal} + ${summary.tax})`).toBe(expectedTotal);
}

export function compareSummaries(checkout: OrderSummary, transaction: OrderSummary) {
  expect(compact(transaction.itemName).toLowerCase()).toContain(compact(checkout.itemName).toLowerCase().slice(0, 20));
  expect(roundMoney(transaction.total)).toBe(roundMoney(checkout.total));

  for (const modifier of checkout.modifiers) {
    expect(transaction.modifiers.map((entry) => entry.name.toLowerCase()).join('\n')).toContain(modifier.name.toLowerCase());
  }
}

export async function saveOrderSummary(summary: OrderSummary) {
  const filePath = path.resolve(process.cwd(), 'test-results', 'order-summary.json');
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, JSON.stringify(summary, null, 2));
}

export function parseTransactionSummary(text: string, checkout: OrderSummary): OrderSummary {
  const subtotal = findLabeledMoney(text, /subtotal/i) ?? checkout.subtotal;
  const tax = findLabeledMoney(text, /\btax\b/i) ?? checkout.tax;
  const total = findLabeledMoney(text, /\btotal\b|amount due/i) ?? checkout.total;
  const modifierNames = checkout.modifiers.filter((modifier) => text.toLowerCase().includes(modifier.name.toLowerCase()));

  return {
    itemName: text.includes(checkout.itemName) ? checkout.itemName : firstMeaningfulLine(text),
    itemPrice: checkout.itemPrice,
    modifiers: modifierNames,
    subtotal,
    tax,
    total,
  };
}

export function findLabeledMoney(text: string, label: RegExp): number | null {
  const lines = text.split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
  for (const line of lines) {
    if (label.test(line)) {
      const values = allMoneyFromText(line);
      if (values.length > 0) {
        return values[values.length - 1];
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

function roundMoney(value: number) {
  return Math.round(value * 100) / 100;
}
