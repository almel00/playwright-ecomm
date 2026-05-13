import { test } from '@playwright/test';
import { loginResident, logoutResident } from './helpers/login';
import { completeOrderingFlow, verifyTransaction } from './helpers/orderFlow';
import { getRuntimeConfig, residentCredentials } from './helpers/config';
import { compareSummaries, saveOrderSummary, validateMath } from './helpers/orderTotals';

test('resident can place an order and verify it in transactions', async ({ page }) => {
  const config = getRuntimeConfig();

  await test.step('log in as resident', async () => {
    await loginResident(page, residentCredentials());
  });

  const checkoutSummary = await test.step('discover menu, place order, and capture checkout totals', async () => {
    return completeOrderingFlow(page, { config });
  });

  await test.step('persist order summary json', async () => {
    validateMath(checkoutSummary);
    await saveOrderSummary(checkoutSummary);
  });

  await test.step('verify order in My Transactions', async () => {
    const transactionSummary = await verifyTransaction(page, checkoutSummary);
    validateMath(transactionSummary);
    compareSummaries(checkoutSummary, transactionSummary);
    await saveOrderSummary(checkoutSummary);
  });

  await test.step('return to ordering and logout', async () => {
    await logoutResident(page);
  });
});
