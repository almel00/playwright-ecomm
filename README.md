# Resident Ordering Playwright Tests

Playwright coverage for the resident ordering flow. All URL and credential values come from environment variables.

## Scope

Default coverage proves that a resident can:

1. Log in.
2. Reach revenue centers or direct menus.
3. Dynamically select a revenue center, menu, available item, and modifiers.
4. Add one item to an order.
5. Checkout with a kitchen message.
6. Validate subtotal, tax, and total math.
7. Place the order.
8. Find and open the order in My Transactions.
9. Validate item, modifiers, kitchen message, and total.
10. Return to In Room Ordering and log out.

Additional specs cover login/logout, invalid login, item search, mobile menu navigation, sold-out item detection, multi-item ordering, and checkout/payment edge-case inspection when the needed env flags or fixture data are provided.

## Setup

```powershell
npm install
```

Create `.env` from the example for your default local site:

```powershell
Copy-Item .env.example .env
notepad .env
```

Required:

```text
BASE_URL=
RESIDENT_FIRST_NAME=
RESIDENT_ROOM=
RESIDENT_PIN=
```

Do not commit `.env`.

## Environment Profiles

Use environment profiles when testing multiple ecomm URLs with different resident credentials.

Create a profile from the template:

```powershell
Copy-Item .env.profile.example .env.abc
notepad .env.abc
```

Example profile:

```text
BASE_URL=https://example.servingintel.app/
RESIDENT_FIRST_NAME=Oliver
RESIDENT_ROOM=R123
RESIDENT_PIN=1234
SELECTION_MODE=first
TARGET_REVENUE_CENTER=
TARGET_MENU=
TARGET_ITEM=
```

Run with that profile:

```powershell
$env:ENV_FILE='.env.abc'
npm run test:resident-ordering
```

Run another site by changing only `ENV_FILE`:

```powershell
$env:ENV_FILE='.env.client-a'
npm run test:resident-ordering
```

If `ENV_FILE` is not set, Playwright loads `.env`.

Profile files such as `.env.abc` and `.env.client-a` are ignored by git. Only `.env.example` and `.env.profile.example` are committed.

## Selection Controls

By default, the tests select the first valid visible revenue center, menu, and item.

```text
SELECTION_MODE=first
```

To broaden coverage across runs:

```text
SELECTION_MODE=random
```

To target known data while keeping config outside code:

```text
TARGET_REVENUE_CENTER=
TARGET_MENU=
TARGET_ITEM=
```

Targeted values are preferred when found. If a target is not visible, the test falls back to dynamic discovery.

## Optional Coverage

These are disabled by default:

```text
RUN_SEARCH_TEST=true
SEARCH_ITEM_NAME=

RUN_MULTI_ITEM_ORDER=true

RUN_PAYMENT_FAILURE_TEST=true

INVALID_RESIDENT_FIRST_NAME=
INVALID_RESIDENT_ROOM=
INVALID_RESIDENT_PIN=
```

When `RUN_SEARCH_TEST=true`, the search test uses `SEARCH_ITEM_NAME` if provided. If it is blank, the test discovers a visible item name and searches for that. `RUN_MULTI_ITEM_ORDER=true` places an additional real order. `RUN_PAYMENT_FAILURE_TEST=true` stops at checkout and does not submit.

## Run

Main end-to-end order test:

```powershell
npm run test:resident-ordering
```

Non-ordering focused coverage:

```powershell
npm run test:coverage
```

Everything:

```powershell
npm run test:all
```

Latest order summary:

```text
test-results/order-summary.json
```

The summary includes selected revenue center, menu, item, modifiers, subtotal, tax, total, kitchen message, order id when visible, selection mode, and transaction comparison status.

## Reports

Configured reports/artifacts:

- HTML report
- Screenshot on failure
- Video on failure
- Trace on first retry
- GitHub Actions artifact upload

Open the HTML report:

```powershell
npm run report
```

## CI

GitHub Actions is configured in `.github/workflows/playwright.yml`. Add these repository secrets for the default CI target:

```text
BASE_URL
RESIDENT_FIRST_NAME
RESIDENT_ROOM
RESIDENT_PIN
```

The CI workflow runs the main resident ordering test and uploads Playwright artifacts.

For multiple CI targets, create separate GitHub environments or duplicate workflow jobs with different secret sets, for example `abc`, `client-a`, and `client-b`.
