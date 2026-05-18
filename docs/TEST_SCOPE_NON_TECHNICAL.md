# Resident Ordering Automation Test Scope

## Purpose

This automated test checks whether a resident can successfully place an in-room dining order through the ecomm site.

It is meant to answer:

> Can a resident log in, choose food, place an order, and see that order in their transaction history?

## What The Main Test Does

The main test follows the same basic path a resident would take:

1. Opens the ecomm site.
2. Logs in with a resident first name, room number, and PIN.
3. Finds an available ordering area, such as a revenue center.
4. Finds a menu that contains orderable items.
5. Selects one available menu item.
6. Selects required item options or modifiers if the item has them.
7. Adds the item to the order.
8. Opens checkout.
9. Adds this kitchen message:

   ```text
   Automated Test. Please do not make!
   ```

10. Checks the displayed checkout quantity rows, item/modifier subtotal, tip, tax, service fee, discount, selected payment type, and total.
11. Places the order.
12. Captures and validates the order submission payload.
13. Opens My Transactions.
14. Finds the matching transaction row.
15. Opens the transaction details.
16. Confirms the transaction details match checkout, including check number, date, payment type, quantity rows, items, item prices, modifiers, subtotal, tip, tax, service fee, discount, kitchen message, and total.
17. Returns to In-room Ordering.
18. Logs out.

## How Menu Selection Works

The test does not need a hardcoded menu or item name.

It looks at the site and tries to find a valid ordering path:

1. Finds visible revenue centers.
2. Opens a revenue center.
3. Looks for menus inside it.
4. Opens a menu.
5. Only accepts that menu if priced items appear.
6. If a revenue center or menu does not contain priced order items, the test tries another one.

This is useful because some areas may contain reservations, profile links, or other non-ordering content.

## What The Test Validates

The test validates:

- Resident login works.
- A real ordering menu can be reached.
- An available item can be selected.
- Required modifiers can be selected when present.
- The item can be added to the order.
- Checkout can be opened.
- The kitchen message can be added.
- Checkout quantity rows match the selected items and modifiers when checkout exposes parseable rows.
- Item prices plus modifier prices equal subtotal.
- Subtotal plus tip plus tax plus service fee minus discount equals total.
- The submitted order request payload is captured and includes expected total data.
- The order can be submitted.
- The submitted order appears in My Transactions.
- The transaction details match checkout details, including check number, date, payment type, quantity rows, ordered items, item prices, modifiers, subtotal, tip, tax, service fee, discount, and total.
- Optional configured financial rules match, such as expected tax rate, service fee, discount, or tip.
- The resident can return to ordering and log out.

## Reports

Each run creates reports grouped by site and date:

```text
test-results/reports/<site>/<date>/<run-id>/
```

The report includes:

- Pass or fail result.
- Screenshots on failure.
- Video on failure.
- Trace on retry.
- Order summary JSON.

The latest order summary is also saved here:

```text
test-results/order-summary.json
```

## What The Order Summary Contains

The order summary includes:

- Site name.
- Site URL.
- Date and run ID.
- Revenue center selected.
- Menu selected.
- Item selected.
- Item price.
- Modifier names and prices, if any.
- Checkout quantity rows, if shown.
- Payment type, if shown.
- Subtotal.
- Tip, if shown.
- Tax, if shown.
- Service fee, if shown.
- Discount, if shown.
- Total.
- Whether the submission payload was captured and matched.
- Kitchen message.
- Order ID if visible.
- Whether checkout total matched transaction total.

## Optional Financial Rule Checks

If a site has known expected rules, the test can also check those values directly:

```text
EXPECTED_TIP_AMOUNT
EXPECTED_TAX_RATE
EXPECTED_SERVICE_FEE_AMOUNT
EXPECTED_SERVICE_FEE_RATE
EXPECTED_DISCOUNT_AMOUNT
EXPECTED_DISCOUNT_RATE
```

If these are blank, the test still checks displayed math and checkout-vs-transaction consistency. It does not claim a tax, fee, discount, or tip business rule is correct unless that expected rule is configured.

## Optional Extra Tests

There are extra tests that can be turned on when needed:

- Login and logout only.
- Invalid login.
- Menu navigation.
- Item search.
- Mobile menu view.
- Sold-out or unavailable item check.
- Multi-item order.
- Checkout/payment edge-case inspection.

Some optional tests are disabled by default because they may require special test data or may place extra real orders.

## What This Test Does Not Prove

This test does not prove every possible ordering scenario.

It does not fully cover:

- Every resident account.
- Every revenue center.
- Every menu.
- Every item.
- Every modifier combination.
- Every payment method.
- Every tax rule.
- Every mobile device size.
- All browser types.
- Kitchen fulfillment after order submission.
- Whether staff actually receives or prepares the order.

## Important Notes

- This test places a real order in the system.
- The kitchen message says not to make the order.
- Use a dedicated test resident account when possible.
- Do not run multi-item ordering unless extra test orders are acceptable.
- Site credentials are stored outside the code in environment variables or GitHub Environment secrets.

## Recommended Use

Use this test as a daily smoke test.

It is best for answering:

> Is the resident ordering flow basically working today?

It should not be treated as a complete certification of every menu, item, payment, or resident scenario.
