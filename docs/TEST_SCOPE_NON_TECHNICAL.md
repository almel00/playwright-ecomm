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
   Servingintel automation test. Please do not make!
   ```

10. Checks the displayed subtotal, tax, and total.
11. Places the order.
12. Opens My Transactions.
13. Confirms the order appears there.
14. Opens the transaction details.
15. Confirms the item, modifiers, kitchen message, and total are shown correctly.
16. Returns to In-room Ordering.
17. Logs out.

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
- Subtotal plus tax equals total.
- The order can be submitted.
- The submitted order appears in My Transactions.
- The transaction details match checkout details.
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
- Subtotal.
- Tax, if shown.
- Total.
- Kitchen message.
- Order ID if visible.
- Whether checkout total matched transaction total.

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
