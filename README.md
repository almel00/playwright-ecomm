# Resident Ordering Playwright Tests

Playwright coverage for the resident ordering flow. All URL and credential values come from environment variables.

For a non-technical scope summary, see:

```text
docs/TEST_SCOPE_NON_TECHNICAL.md
```

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

Watch the browser locally:

```powershell
npm run test:resident-ordering -- --headed --slow-mo=500
```

Headed Chromium starts maximized with a `1920x1080` window size and a browser scale factor tuned for this UI.

Keep the browser open for step-by-step debugging:

```powershell
npm run test:resident-ordering:debug
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

The summary includes site name, base URL, env profile, report folder, selected revenue center, menu, item, modifiers, subtotal, tax, total, kitchen message, order id when visible, selection mode, and transaction comparison status.

## Daily Reports

Each run writes report artifacts under a site/date/run folder:

```text
test-results/reports/<site>/<yyyy-mm-dd>/<run-id>/
```

Example:

```text
test-results/reports/abcseniorliving-servingintel-app/2026-05-13/2026-05-13-05-18-22-a1b2c3/
```

Inside each run folder:

```text
html/
artifacts/
order-summary.json
```

Each site/date also gets a daily JSONL index:

```text
test-results/reports/<site>/<yyyy-mm-dd>/runs.jsonl
```

Use `SITE_NAME` in `.env` or profile files when you want a friendly report label:

```text
SITE_NAME=ABC Senior Living
```

If `SITE_NAME` is blank, the report uses the `BASE_URL` hostname.

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

That opens the latest generated nested HTML report.

## GitHub Runner

GitHub Actions is configured as the first version of the test runner dashboard.

### One-Time Site Setup

In GitHub, create one **Environment** per ecomm site:

```text
abc
canterbury
client-a
```

For each Environment, add these secrets:

```text
BASE_URL
RESIDENT_FIRST_NAME
RESIDENT_ROOM
RESIDENT_PIN
```

Optional Environment secrets:

```text
INVALID_RESIDENT_FIRST_NAME
INVALID_RESIDENT_ROOM
INVALID_RESIDENT_PIN
```

Optional Environment variables:

```text
SITE_NAME
SELECTION_MODE
TARGET_REVENUE_CENTER
TARGET_MENU
TARGET_ITEM
KITCHEN_MESSAGE
RUN_SEARCH_TEST
SEARCH_ITEM_NAME
RUN_MULTI_ITEM_ORDER
RUN_PAYMENT_FAILURE_TEST
```

Create a repository variable for scheduled runs:

```text
DEFAULT_TEST_ENVIRONMENT=abc
```

### Manual Run

Use GitHub as the runner UI:

1. Open the repository in GitHub.
2. Go to **Actions**.
3. Select **Resident Ordering Tests**.
4. Click **Run workflow**.
5. Choose the Environment/site.
6. Choose the test suite:
   - `resident-ordering`
   - `coverage`
   - `all`
7. Click **Run workflow**.

The run uploads artifacts containing:

```text
test-results/reports
test-results/order-summary.json
```

The workflow summary also prints the latest order summary when an order was submitted.

### Daily Runs

The workflow is scheduled daily at `12:00 UTC`.

Scheduled runs use:

```text
DEFAULT_TEST_ENVIRONMENT
```

and run the `resident-ordering` suite.
