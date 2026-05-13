import { expect, test } from '@playwright/test';
import { getRuntimeConfig, residentCredentials } from './helpers/config';
import { loginResident } from './helpers/login';
import { completeOrderingFlow } from './helpers/orderFlow';
import { validateMath } from './helpers/orderTotals';

const config = getRuntimeConfig();
const paymentEdgeTest = config.runPaymentFailureTest ? test : test.skip;

paymentEdgeTest('checkout can be inspected without submitting when payment failure coverage is enabled', async ({ page }) => {
  await loginResident(page, residentCredentials());
  const checkoutSummary = await completeOrderingFlow(page, { config, placeOrder: false });
  validateMath(checkoutSummary);

  const bodyText = await page.locator('body').innerText();
  await expect(page.getByRole('button', { name: /submit order|place order|confirm order|complete order/i })).toBeVisible();
  expect(bodyText).toMatch(/meal credit|payment|amount due|total/i);
});
