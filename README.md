# Resident Ordering Playwright Test

This project contains a Playwright automation for the resident ordering flow.

## Automation Plan

1. Open `BASE_URL`.
2. Log in with `RESIDENT_FIRST_NAME`, `RESIDENT_ROOM`, and `RESIDENT_PIN`.
3. Detect whether the app is showing revenue centers or menu choices.
4. If revenue centers are present, select a visible revenue center that leads to menus.
5. Select a visible menu dynamically.
6. Select the first available menu item dynamically.
7. Detect modifiers. Select enough required modifiers to enable add-to-check, and select an available modifier when modifiers exist.
8. Add the item to the order and open checkout.
9. Add the kitchen message: `Servingintel test. Please do not make!`
10. Capture item, modifiers, subtotal, tax, and total, then validate `subtotal + tax = total`.
11. Place the order.
12. Open My Transactions, open the matching transaction, and validate item, modifiers, kitchen message, and total.
13. Return to In Room Ordering.
14. Log out and verify the login page is visible.

## Setup

Install dependencies:

```powershell
npm install
```

Create `.env` from the example:

```powershell
Copy-Item .env.example .env
notepad .env
```

Required environment variables:

```text
BASE_URL=
RESIDENT_FIRST_NAME=
RESIDENT_ROOM=
RESIDENT_PIN=
```

All URL and credential configuration comes from environment variables. Do not commit `.env`.

## Run

```powershell
npm run test:resident-ordering
```

The test writes the latest order summary to:

```text
test-results/order-summary.json
```

## Reports

Playwright is configured for:

- HTML report
- Screenshot on failure
- Video on failure
- Trace on first retry

Open the HTML report:

```powershell
npm run report
```
