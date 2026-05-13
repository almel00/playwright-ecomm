import { test } from '@playwright/test';
import { getRuntimeConfig, residentCredentials } from './helpers/config';
import { loginResident, logoutResident } from './helpers/login';
import { completeOrderingFlow, verifyTransaction } from './helpers/orderFlow';
import { compareSummaries, saveOrderSummary, validateMath } from './helpers/orderTotals';

const config = getRuntimeConfig();
const modifierItemTest = config.runModifierItemOrder ? test : test.skip;

modifierItemTest('resident can place an order with item modifiers when enabled', async ({ page }) => {
  await loginResident(page, residentCredentials());
  const checkoutSummary = await completeOrderingFlow(page, { config, requireModifier: true });
  validateMath(checkoutSummary);
  const transactionSummary = await verifyTransaction(page, checkoutSummary);
  validateMath(transactionSummary);
  compareSummaries(checkoutSummary, transactionSummary);
  await saveOrderSummary(checkoutSummary);
  await logoutResident(page);
});
