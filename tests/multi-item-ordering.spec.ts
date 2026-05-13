import { test } from '@playwright/test';
import { getRuntimeConfig, residentCredentials } from './helpers/config';
import { loginResident, logoutResident } from './helpers/login';
import { completeOrderingFlow, verifyTransaction } from './helpers/orderFlow';
import { compareSummaries, saveOrderSummary, validateMath } from './helpers/orderTotals';

const config = getRuntimeConfig();
const multiItemTest = config.runMultiItemOrder ? test : test.skip;

multiItemTest('resident can place a multi-item order when enabled', async ({ page }) => {
  await loginResident(page, residentCredentials());
  const checkoutSummary = await completeOrderingFlow(page, { config, itemCount: 2 });
  validateMath(checkoutSummary);
  const transactionSummary = await verifyTransaction(page, checkoutSummary);
  validateMath(transactionSummary);
  compareSummaries(checkoutSummary, transactionSummary);
  await saveOrderSummary(checkoutSummary);
  await logoutResident(page);
});
