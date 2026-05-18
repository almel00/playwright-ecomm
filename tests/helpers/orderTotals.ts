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

export type TransactionLineSummary = {
  quantity: number;
  description: string;
  unitPrice: number;
  totalPrice: number;
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
  tip: number;
  tax: number;
  taxPresent: boolean;
  serviceFee: number;
  discount: number;
  total: number;
  orderId: string;
  kitchenMessage: string;
  kitchenMessageSubmitted?: boolean;
  transactionKitchenMessageVisible?: boolean;
  checkoutTotalMatchesTransaction?: boolean;
  checkoutLineItems?: TransactionLineSummary[];
  checkoutPaymentType?: string;
  submissionPayloadText?: string;
  submissionPayloadMatched?: boolean;
  transactionDetailText?: string;
  transactionCheckNumber?: string;
  transactionDate?: string;
  paymentType?: string;
  transactionLineItems?: TransactionLineSummary[];
};

export function moneyFromText(text: string): number | null {
  const match = text.replace(/,/g, '').match(/\$?\s*(-?\d+(?:\.\d{1,2})?)/);
  return match ? Number(match[1]) : null;
}

export function allMoneyFromText(text: string): number[] {
  return [...text.replace(/,/g, '').matchAll(/\$?\s*(-?\d+(?:\.\d{1,2})?)/g)].map((match) => Number(match[1]));
}

function currencyAmountsFromText(text: string): number[] {
  return [...text.replace(/,/g, '').matchAll(/\$\s*(-?\d+(?:\.\d{1,2})?)/g)].map((match) => Number(match[1]));
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
  const tip = findLabeledMoney(body, /\btip\b/i) ?? 0;
  const serviceFee = findLabeledMoney(body, /service\s*fee/i) ?? 0;
  const discount = findLabeledMoney(body, /discount/i) ?? 0;
  const tax = taxValue ?? 0;
  const total = findLabeledMoney(body, /amount due/i) ?? findLabeledMoney(body, /^total$/i) ?? subtotal + tip + tax + serviceFee - discount;
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
    tip,
    tax,
    taxPresent: taxValue !== null,
    serviceFee,
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
  const prices = currencyAmountsFromText(text);
  const itemPrice = prices.at(-1) ?? 0;
  const itemName = rawText
    .split(/\r?\n/)
    .map((line) => compact(line.replace(/\$?\s*-?\d+(?:\.\d{1,2})?/g, ' ')))
    .find((line) => line && !/description|calories|sold out|unavailable/i.test(line)) ?? compact(text.replace(/\$?\s*-?\d+(?:\.\d{1,2})?/g, ' '));

  expect(itemName.length, `Could not extract item name from "${text}"`).toBeGreaterThan(0);
  return { itemName, itemPrice };
}

type TotalMathSummary = Pick<OrderSummary, 'subtotal' | 'tax' | 'total'> & Partial<Pick<OrderSummary, 'discount' | 'items' | 'serviceFee' | 'tip'>>;

export function validateMath(summary: TotalMathSummary) {
  const discount = 'discount' in summary && typeof summary.discount === 'number' ? summary.discount : 0;
  const tip = 'tip' in summary && typeof summary.tip === 'number' ? summary.tip : 0;
  const serviceFee = 'serviceFee' in summary && typeof summary.serviceFee === 'number' ? summary.serviceFee : 0;
  expect(roundMoney(summary.subtotal), 'Subtotal should not be negative').toBeGreaterThanOrEqual(0);
  expect(roundMoney(tip), 'Tip should not be negative').toBeGreaterThanOrEqual(0);
  expect(roundMoney(summary.tax), 'Tax should not be negative').toBeGreaterThanOrEqual(0);
  expect(roundMoney(serviceFee), 'Service fee should not be negative').toBeGreaterThanOrEqual(0);
  expect(roundMoney(discount), 'Discount should not be negative').toBeGreaterThanOrEqual(0);
  expect(roundMoney(discount), `Discount should not exceed subtotal plus tip plus tax plus service fee (${summary.subtotal} + ${tip} + ${summary.tax} + ${serviceFee})`).toBeLessThanOrEqual(roundMoney(summary.subtotal + tip + summary.tax + serviceFee));

  if (summary.items && summary.items.length > 0) {
    const expectedSubtotal = roundMoney(summary.items.reduce((sum, item) => sum + item.price + item.modifiers.reduce((modifierSum, modifier) => modifierSum + modifier.price, 0), 0));
    expect(roundMoney(summary.subtotal), `Line item prices plus modifiers should equal subtotal (${expectedSubtotal})`).toBe(expectedSubtotal);
  }

  validateConfiguredFinancialRules(summary, { discount, tip, serviceFee });

  const impliedDiscount = roundMoney(summary.subtotal + tip + summary.tax + serviceFee - summary.total);
  expect(roundMoney(discount), `Displayed discount should equal subtotal + tip + tax + service fee - total (${summary.subtotal} + ${tip} + ${summary.tax} + ${serviceFee} - ${summary.total})`).toBe(impliedDiscount);

  const expectedTotal = roundMoney(summary.subtotal + tip + summary.tax + serviceFee - discount);
  expect(roundMoney(summary.total), `subtotal + tip + tax + service fee - discount should equal total (${summary.subtotal} + ${tip} + ${summary.tax} + ${serviceFee} - ${discount})`).toBe(expectedTotal);
}

export function compareSummaries(checkout: OrderSummary, transaction: OrderSummary) {
  const transactionDetailText = transaction.transactionDetailText ?? transaction.itemName;
  const normalizedTransactionText = compact(transactionDetailText).toLowerCase();

  for (const item of checkout.items) {
    expect(detailContainsItem(transactionDetailText, item), `Transaction detail should include ordered item "${item.name}" at ${formatMoney(item.price)}`).toBe(true);
    expect(transactionDetailText, `Transaction detail should include ordered item price ${formatMoney(item.price)} for "${item.name}"`).toMatch(moneyPattern(item.price));
  }

  expect(roundMoney(transaction.subtotal), 'Transaction subtotal should match checkout subtotal').toBe(roundMoney(checkout.subtotal));
  expect(roundMoney(transaction.tip), 'Transaction tip should match checkout tip').toBe(roundMoney(checkout.tip));
  expect(roundMoney(transaction.tax), 'Transaction tax should match checkout tax').toBe(roundMoney(checkout.tax));
  expect(roundMoney(transaction.serviceFee), 'Transaction service fee should match checkout service fee').toBe(roundMoney(checkout.serviceFee));
  expect(roundMoney(transaction.discount), 'Transaction discount should match checkout discount').toBe(roundMoney(checkout.discount));
  expect(roundMoney(transaction.total)).toBe(roundMoney(checkout.total));
  expect(transaction.transactionCheckNumber || transaction.orderId, 'Transaction detail should include a check/order number').toMatch(/\S/);
  expect(transaction.transactionDate, 'Transaction detail should include a transaction date').toMatch(/\S/);
  expect(normalizeDate(transaction.transactionDate), 'Transaction date should match the checkout run date').toBe(checkout.reportDate);
  expect(transaction.paymentType, 'Transaction detail should include a payment type').toMatch(/\S/);
  expect(normalizePaymentType(transaction.paymentType), 'Transaction payment type should match expected transaction billing type').toBe(expectedTransactionPaymentType(checkout));
  assertTransactionLineItems(checkout, transaction);

  for (const modifier of checkout.modifiers) {
    expect(normalizedTransactionText, `Transaction detail should include modifier "${modifier.name}"`).toContain(compact(modifier.name).toLowerCase());
    if (roundMoney(modifier.price) !== 0) {
      expect(transactionDetailText, `Transaction detail should include modifier price ${formatMoney(modifier.price)} for "${modifier.name}"`).toMatch(moneyPattern(modifier.price));
    }
  }

  if (checkout.orderId && transaction.orderId) {
    expect(transaction.orderId, 'Transaction order id should match checkout order id').toBe(checkout.orderId);
  }

  checkout.checkoutTotalMatchesTransaction = roundMoney(transaction.total) === roundMoney(checkout.total);
}

export function validateCheckoutDetails(summary: OrderSummary) {
  if (summary.checkoutPaymentType) {
    expect(summary.checkoutPaymentType, 'Checkout should expose the selected payment type when payment controls are visible').toMatch(/\S/);
  }

  if (summary.checkoutLineItems && summary.checkoutLineItems.length > 0) {
    assertLineItemsMatchOrder(summary.checkoutLineItems, summary, 'Checkout');
  }
}

export function validateSubmissionPayload(summary: OrderSummary) {
  const payload = summary.submissionPayloadText ?? '';
  if (!payload.trim()) {
    console.log('[checkout] Order submission payload was not captured; continuing with checkout and transaction detail validation');
    summary.submissionPayloadMatched = false;
    return;
  }

  const decodedPayload = decodePayload(payload).toLowerCase();
  for (const item of summary.items) {
    const itemName = compact(item.name).toLowerCase();
    if (decodedPayload.includes(itemName)) {
      continue;
    }

    console.log(`[checkout] Submission payload did not include item name "${item.name}"; payload may use item ids instead`);
  }

  expect(payloadContainsMoney(decodedPayload, summary.total), `Order submission payload should include total ${formatMoney(summary.total)} or cents equivalent`).toBe(true);
  if (summary.subtotal !== summary.total) {
    expect(payloadContainsMoney(decodedPayload, summary.subtotal), `Order submission payload should include subtotal ${formatMoney(summary.subtotal)} or cents equivalent`).toBe(true);
  }

  summary.submissionPayloadMatched = true;
}

export function transactionMatchesCheckout(checkout: OrderSummary, transaction: OrderSummary) {
  const detailText = transaction.transactionDetailText ?? '';
  return roundMoney(transaction.total) === roundMoney(checkout.total)
    && checkout.items.every((item) => detailContainsItem(detailText, item))
    && (!transaction.transactionDate || normalizeDate(transaction.transactionDate) === checkout.reportDate)
    && (!checkout.orderId || !transaction.orderId || checkout.orderId === transaction.orderId);
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
  const tip = findLabeledMoney(text, /\btip\b/i) ?? checkout.tip;
  const tax = findLabeledMoney(text, /\btax\b/i) ?? checkout.tax;
  const serviceFee = findLabeledMoney(text, /service\s*fee/i) ?? checkout.serviceFee;
  const discount = findLabeledMoney(text, /discount/i) ?? checkout.discount;
  const total = findLabeledMoney(text, /amount due/i) ?? findLabeledMoney(text, /^total$/i) ?? checkout.total;
  const modifierNames = checkout.modifiers.filter((modifier) => text.toLowerCase().includes(modifier.name.toLowerCase()));
  const transactionCheckNumber = findCheckNumber(text);

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
    tip,
    tax,
    taxPresent: findLabeledMoney(text, /\btax\b/i) !== null,
    serviceFee,
    discount,
    total,
    orderId: transactionCheckNumber || findOrderId(text) || checkout.orderId,
    kitchenMessage: checkout.kitchenMessage,
    kitchenMessageSubmitted: checkout.kitchenMessageSubmitted,
    transactionKitchenMessageVisible: text.includes(checkout.kitchenMessage),
    transactionDetailText: text,
    transactionCheckNumber,
    transactionDate: findTransactionDate(text),
    paymentType: findPaymentType(text),
    transactionLineItems: parseTransactionLineItems(text),
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
  return text.match(/(?:order|confirmation|transaction)\s*(?:#|id|number)\s*:?\s*([A-Z0-9-]*\d[A-Z0-9-]*)/i)?.[1] ?? '';
}

function findCheckNumber(text: string) {
  return text.match(/check\s*#\s*:?\s*([A-Z0-9-]*\d[A-Z0-9-]*)/i)?.[1] ?? '';
}

function findTransactionDate(text: string) {
  return text.match(/date\s*:?\s*([A-Za-z]+\.?\s+\d{1,2},\s+\d{4}|\d{1,2}\/\d{1,2}\/\d{2,4}|\d{4}-\d{2}-\d{2})/i)?.[1] ?? '';
}

function findPaymentType(text: string) {
  return text.match(/payment\s*type\s*:?\s*([^\r\n]+)/i)?.[1].trim() ?? '';
}

function parseTransactionLineItems(text: string): TransactionLineSummary[] {
  const lines = text.split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
  const quantityHeaderIndex = lines.findIndex((line) => /^quantity$/i.test(line));
  const subtotalIndex = lines.findIndex((line) => /^subtotal:?$/i.test(line));
  if (quantityHeaderIndex === -1 || subtotalIndex === -1 || subtotalIndex <= quantityHeaderIndex) {
    return [];
  }

  const values = lines.slice(quantityHeaderIndex + 4, subtotalIndex);
  const rows: TransactionLineSummary[] = [];
  for (let index = 0; index + 3 < values.length; index += 4) {
    const quantity = Number(values[index]);
    const description = values[index + 1];
    const unitPrice = moneyFromText(values[index + 2]);
    const totalPrice = moneyFromText(values[index + 3]);
    if (!Number.isFinite(quantity) || unitPrice === null || totalPrice === null || !description) {
      return [];
    }

    rows.push({ quantity, description, unitPrice, totalPrice });
  }
  return rows;
}

function assertTransactionLineItems(checkout: OrderSummary, transaction: OrderSummary) {
  const transactionLines = transaction.transactionLineItems ?? [];
  expect(transactionLines.length, 'Transaction detail should include parseable quantity/description/unit price/total price rows').toBeGreaterThan(0);

  assertLineItemsMatchOrder(transactionLines, checkout, 'Transaction detail');
}

function assertLineItemsMatchOrder(lineItems: TransactionLineSummary[], checkout: OrderSummary, surfaceName: string) {
  expect(lineItems.length, `${surfaceName} should include parseable quantity/description/unit price/total price rows`).toBeGreaterThan(0);

  for (const line of lineItems) {
    expect(line.quantity, `${surfaceName} line "${line.description}" should have positive quantity`).toBeGreaterThan(0);
    expect(roundMoney(line.totalPrice), `${surfaceName} line "${line.description}" total should equal quantity times unit price`).toBe(roundMoney(line.quantity * line.unitPrice));
  }

  const expectedLines = summarizeExpectedLines(checkout);
  const actualLines = summarizeTransactionLines(lineItems);
  for (const expected of expectedLines) {
    const matchingLine = actualLines.find((line) => namesMatch(line.description, expected.name) && roundMoney(line.unitPrice) === roundMoney(expected.unitPrice));
    expect(matchingLine, `${surfaceName} should include line "${expected.name}" at ${formatMoney(expected.unitPrice)}`).toBeTruthy();
    expect(matchingLine?.quantity, `${surfaceName} quantity should match checkout for "${expected.name}"`).toBe(expected.quantity);
    expect(roundMoney(matchingLine?.totalPrice ?? NaN), `${surfaceName} line total should match checkout for "${expected.name}"`).toBe(roundMoney(expected.quantity * expected.unitPrice));
  }
}

function summarizeExpectedLines(checkout: OrderSummary) {
  const lines = new Map<string, { name: string; quantity: number; unitPrice: number }>();
  for (const item of checkout.items) {
    addExpectedLine(lines, item.name, item.price);
    for (const modifier of item.modifiers) {
      addExpectedLine(lines, modifier.name, modifier.price);
    }
  }
  return [...lines.values()];
}

function addExpectedLine(lines: Map<string, { name: string; quantity: number; unitPrice: number }>, name: string, unitPrice: number) {
  const key = `${normalizeItemName(name)}:${roundMoney(unitPrice)}`;
  const existing = lines.get(key);
  if (existing) {
    existing.quantity += 1;
    return;
  }

  lines.set(key, { name: normalizeItemName(name), quantity: 1, unitPrice });
}

function summarizeTransactionLines(transactionLines: TransactionLineSummary[]) {
  const lines = new Map<string, TransactionLineSummary>();
  for (const line of transactionLines) {
    const key = `${compact(line.description).toLowerCase()}:${roundMoney(line.unitPrice)}`;
    const existing = lines.get(key);
    if (existing) {
      existing.quantity += line.quantity;
      existing.totalPrice = roundMoney(existing.totalPrice + line.totalPrice);
      continue;
    }

    lines.set(key, { ...line, description: compact(line.description) });
  }
  return [...lines.values()];
}

function normalizeDate(value: string) {
  if (!value) {
    return '';
  }

  const normalizedValue = value.trim().replace(/\b([A-Za-z]{3,9})\.\s+/g, '$1 ');

  if (/^\d{4}-\d{2}-\d{2}$/.test(normalizedValue)) {
    return normalizedValue;
  }

  const date = new Date(normalizedValue);
  if (Number.isNaN(date.getTime())) {
    return normalizedValue;
  }
  return date.toISOString().slice(0, 10);
}

function normalizePaymentType(value: string) {
  return compact(value).toLowerCase();
}

function expectedTransactionPaymentType(checkout: OrderSummary) {
  if (roundMoney(checkout.total) > 0) {
    return 'direct billing';
  }

  return normalizePaymentType(checkout.checkoutPaymentType || 'meal credit');
}

function detailContainsName(detailText: string, itemName: string) {
  return normalizeItemName(detailText).includes(normalizeItemName(itemName));
}

function detailContainsItem(detailText: string, item: ItemSummary) {
  if (detailContainsName(detailText, item.name)) {
    return true;
  }

  if (!moneyPattern(item.price).test(detailText)) {
    return false;
  }

  const detailTokens = meaningfulNameTokens(detailText);
  const itemTokens = meaningfulNameTokens(item.name);
  return itemTokens.some((token) => detailTokens.has(token));
}

function namesMatch(actualName: string, expectedName: string) {
  const actual = normalizeItemName(actualName);
  const expected = normalizeItemName(expectedName);
  if (actual.includes(expected) || expected.includes(actual)) {
    return true;
  }

  const actualTokens = meaningfulNameTokens(actualName);
  const expectedTokens = meaningfulNameTokens(expectedName);
  return [...expectedTokens].some((token) => actualTokens.has(token));
}

function normalizeItemName(value: string) {
  return compact(value)
    .toLowerCase()
    .replace(/\$?\s*-?\d+(?:\.\d{1,2})?/g, ' ')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

function meaningfulNameTokens(value: string) {
  return new Set(normalizeItemName(value)
    .split(/\s+/)
    .filter((token) => token.length >= 4 && !['with', 'and', 'the', 'meal', 'item'].includes(token)));
}

function decodePayload(payload: string) {
  try {
    return decodeURIComponent(payload);
  } catch {
    return payload;
  }
}

function payloadContainsMoney(payload: string, value: number) {
  const dollars = roundMoney(value).toFixed(2);
  const dollarsWithoutTrailingZeroes = String(roundMoney(value));
  const cents = String(Math.round(roundMoney(value) * 100));
  return payload.includes(dollars) || payload.includes(dollarsWithoutTrailingZeroes) || payload.includes(cents);
}

function validateConfiguredFinancialRules(summary: TotalMathSummary, amounts: { discount: number; tip: number; serviceFee: number }) {
  const expectedTipAmount = optionalMoneyEnv('EXPECTED_TIP_AMOUNT');
  if (expectedTipAmount !== null) {
    expect(roundMoney(amounts.tip), 'Tip should match EXPECTED_TIP_AMOUNT').toBe(roundMoney(expectedTipAmount));
  }

  const expectedTaxRate = optionalRateEnv('EXPECTED_TAX_RATE');
  if (expectedTaxRate !== null) {
    expect(roundMoney(summary.tax), 'Tax should match EXPECTED_TAX_RATE times subtotal').toBe(roundMoney(summary.subtotal * expectedTaxRate));
  }

  const expectedServiceFeeAmount = optionalMoneyEnv('EXPECTED_SERVICE_FEE_AMOUNT');
  if (expectedServiceFeeAmount !== null) {
    expect(roundMoney(amounts.serviceFee), 'Service fee should match EXPECTED_SERVICE_FEE_AMOUNT').toBe(roundMoney(expectedServiceFeeAmount));
  }

  const expectedServiceFeeRate = optionalRateEnv('EXPECTED_SERVICE_FEE_RATE');
  if (expectedServiceFeeRate !== null) {
    expect(roundMoney(amounts.serviceFee), 'Service fee should match EXPECTED_SERVICE_FEE_RATE times subtotal').toBe(roundMoney(summary.subtotal * expectedServiceFeeRate));
  }

  const expectedDiscountAmount = optionalMoneyEnv('EXPECTED_DISCOUNT_AMOUNT');
  if (expectedDiscountAmount !== null) {
    expect(roundMoney(amounts.discount), 'Discount should match EXPECTED_DISCOUNT_AMOUNT').toBe(roundMoney(expectedDiscountAmount));
  }

  const expectedDiscountRate = optionalRateEnv('EXPECTED_DISCOUNT_RATE');
  if (expectedDiscountRate !== null) {
    expect(roundMoney(amounts.discount), 'Discount should match EXPECTED_DISCOUNT_RATE times subtotal').toBe(roundMoney(summary.subtotal * expectedDiscountRate));
  }
}

function optionalMoneyEnv(name: string) {
  const value = process.env[name]?.trim();
  if (!value) {
    return null;
  }

  const parsed = moneyFromText(value);
  expect(parsed, `${name} should be a money amount such as 1.25 or $1.25`).not.toBeNull();
  return parsed;
}

function optionalRateEnv(name: string) {
  const value = process.env[name]?.trim();
  if (!value) {
    return null;
  }

  const isPercent = value.endsWith('%');
  const numeric = Number(value.replace('%', ''));
  expect(Number.isFinite(numeric), `${name} should be a decimal rate such as 0.0825 or a percent such as 8.25%`).toBe(true);
  return isPercent ? numeric / 100 : numeric;
}

function roundMoney(value: number) {
  return Math.round(value * 100) / 100;
}

function formatMoney(value: number) {
  return `$${roundMoney(value).toFixed(2)}`;
}

function moneyPattern(value: number) {
  return new RegExp(`\\$\\s*${escapeRegex(roundMoney(value).toFixed(2))}`);
}

function escapeRegex(value: string) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}
