import { test } from 'playwright/test';
import { loginResident, logoutResident } from './helpers/login';
import { completeOrderingFlow, verifyTransaction } from './helpers/orderFlow';
import { compareSummaries, saveOrderSummary, validateMath } from './helpers/orderTotals';

test('resident can place an order and verify it in transactions', async ({ page }) => {
  const credentials = {
    firstName: requiredEnv('RESIDENT_FIRST_NAME'),
    room: requiredEnv('RESIDENT_ROOM'),
    pin: requiredEnv('RESIDENT_PIN'),
  };

  await test.step('log in as resident', async () => {
    await loginResident(page, credentials);
  });

  let checkoutSummary = await test.step('discover menu, place order, and capture checkout totals', async () => {
    return completeOrderingFlow(page);
  });

  await test.step('persist order summary json', async () => {
    validateMath(checkoutSummary);
    await saveOrderSummary(checkoutSummary);
  });

  await test.step('verify order in My Transactions', async () => {
    const transactionSummary = await verifyTransaction(page, checkoutSummary);
    validateMath(transactionSummary);
    compareSummaries(checkoutSummary, transactionSummary);
  });

  await test.step('return to ordering and logout', async () => {
    await logoutResident(page);
  });
});

function requiredEnv(name: string) {
  const value = process.env[name];
  if (!value) {
    throw new Error(`Missing required environment variable ${name}.`);
  }
  return value;
}
