const state = {
  runs: [],
  filter: 'all',
  query: '',
  expanded: new Set(),
};

const elements = {
  runs: document.querySelector('#runs'),
  latestStatus: document.querySelector('#latestStatus'),
  latestMeta: document.querySelector('#latestMeta'),
  passRate: document.querySelector('#passRate'),
  passRateMeta: document.querySelector('#passRateMeta'),
  latestCheck: document.querySelector('#latestCheck'),
  latestPayment: document.querySelector('#latestPayment'),
  latestTotal: document.querySelector('#latestTotal'),
  latestSite: document.querySelector('#latestSite'),
  refresh: document.querySelector('#refreshButton'),
  search: document.querySelector('#searchInput'),
  actionsLink: document.querySelector('#actionsLink'),
  template: document.querySelector('#runTemplate'),
};

const money = new Intl.NumberFormat('en-US', {
  style: 'currency',
  currency: 'USD',
});

const dateTime = new Intl.DateTimeFormat(undefined, {
  month: 'short',
  day: 'numeric',
  hour: 'numeric',
  minute: '2-digit',
});

elements.refresh.addEventListener('click', loadRuns);
elements.search.addEventListener('input', (event) => {
  state.query = event.target.value.toLowerCase().trim();
  renderRuns();
});

document.querySelectorAll('.tab').forEach((button) => {
  button.addEventListener('click', () => {
    document.querySelectorAll('.tab').forEach((tab) => tab.classList.remove('is-active'));
    button.classList.add('is-active');
    state.filter = button.dataset.filter;
    renderRuns();
  });
});

loadRuns();

async function loadRuns() {
  setBusy(true);
  try {
    const response = await fetch('/.netlify/functions/github-runs', {
      headers: { accept: 'application/json' },
    });

    if (!response.ok) {
      throw new Error(`Dashboard API returned ${response.status}`);
    }

    const data = await response.json();
    if (data.actionsUrl) {
      elements.actionsLink.href = data.actionsUrl;
    }
    state.runs = data.runs || [];
    renderSummary();
    renderRuns();
  } catch (error) {
    state.runs = sampleRuns();
    renderSummary();
    renderRuns(error instanceof Error ? error.message : 'Unable to load GitHub Actions data.');
  } finally {
    setBusy(false);
  }
}

function renderSummary() {
  const latest = state.runs[0];
  if (!latest) {
    elements.latestStatus.textContent = 'No runs';
    elements.latestMeta.textContent = 'No workflow data found';
    elements.passRate.textContent = '--';
    elements.latestCheck.textContent = '--';
    elements.latestPayment.textContent = '--';
    elements.latestTotal.textContent = '--';
    elements.latestSite.textContent = '--';
    return;
  }

  const completed = state.runs.filter((run) => run.status === 'completed');
  const passed = completed.filter((run) => run.conclusion === 'success');
  const passRate = completed.length ? Math.round((passed.length / completed.length) * 100) : 0;
  const summary = latest.summary || {};

  elements.latestStatus.textContent = labelForRun(latest);
  elements.latestMeta.textContent = `${formatDate(latest.createdAt)} - run #${latest.number}`;
  elements.passRate.textContent = completed.length ? `${passRate}%` : '--';
  elements.passRateMeta.textContent = `${passed.length}/${completed.length} completed runs passed`;
  elements.latestCheck.textContent = summary.transactionCheckNumber || summary.orderId || '--';
  elements.latestPayment.textContent = summary.paymentType || summary.checkoutPaymentType || '--';
  elements.latestTotal.textContent = formatMoney(summary.total);
  elements.latestSite.textContent = summary.siteName || summary.siteSlug || '--';
}

function renderRuns(errorMessage) {
  elements.runs.innerHTML = '';

  if (errorMessage) {
    const panel = document.createElement('div');
    panel.className = 'error-panel';
    panel.textContent = `${errorMessage}. Showing sample layout data.`;
    elements.runs.append(panel);
  }

  const visibleRuns = state.runs.filter(matchesFilter).filter(matchesQuery);
  if (!visibleRuns.length) {
    const empty = document.createElement('div');
    empty.className = 'empty';
    empty.textContent = 'No runs match the current view.';
    elements.runs.append(empty);
    return;
  }

  visibleRuns.forEach((run, index) => {
    const node = elements.template.content.firstElementChild.cloneNode(true);
    const summary = run.summary || {};
    const status = stateForRun(run);
    const runId = String(run.id || run.number);
    const isExpanded = state.expanded.has(runId);

    node.dataset.state = status;
    node.dataset.expanded = String(isExpanded);
    node.style.animationDelay = `${Math.min(index * 28, 180)}ms`;
    node.querySelector('.run-card__summary').setAttribute('aria-expanded', String(isExpanded));
    node.querySelector('.run-details').hidden = !isExpanded;
    node.querySelector('.run-number').textContent = `#${run.number}`;
    node.querySelector('.run-time').textContent = formatDate(run.createdAt);
    node.querySelector('[data-field="site"]').textContent = summary.siteName || summary.siteSlug || summary.baseUrl || '--';
    node.querySelector('[data-field="item"]').textContent = summary.itemName || firstItemName(summary) || '--';
    node.querySelector('[data-field="total"]').textContent = formatMoney(summary.total);
    node.querySelector('[data-field="check"]').textContent = summary.transactionCheckNumber || summary.orderId || '--';
    node.querySelector('[data-field="payment"]').textContent = summary.paymentType || summary.checkoutPaymentType || '--';
    node.querySelector('[data-field="duration"]').textContent = duration(run.createdAt, run.updatedAt);
    node.querySelector('.badge').dataset.state = status;
    node.querySelector('.badge').textContent = labelForRun(run);

    setDetail(node, 'revenueCenter', summary.revenueCenterName);
    setDetail(node, 'menu', summary.menuName);
    setDetail(node, 'itemPrice', formatMoney(summary.itemPrice));
    setDetail(node, 'subtotal', formatMoney(summary.subtotal));
    setDetail(node, 'tax', formatMoney(summary.tax));
    setDetail(node, 'discount', formatMoney(summary.discount));
    setDetail(node, 'detailTotal', formatMoney(summary.total));
    setDetail(node, 'checkoutPayment', summary.checkoutPaymentType);
    setDetail(node, 'transactionCheck', summary.transactionCheckNumber);
    setDetail(node, 'orderId', summary.orderId);
    setDetail(node, 'transactionDate', summary.transactionDate);
    setDetail(node, 'transactionPayment', summary.paymentType);
    setDetail(node, 'totalMatched', yesNo(summary.checkoutTotalMatchesTransaction));
    setDetail(node, 'kitchenMessage', kitchenMessageStatus(summary));
    setDetail(node, 'payloadMatched', yesNo(summary.submissionPayloadMatched));
    setDetail(node, 'artifactName', run.artifactName);
    setDetail(node, 'note', resultNote(run));
    node.querySelector('[data-link="run"]').href = run.htmlUrl;
    node.querySelector('[data-link="artifacts"]').href = run.artifactsUrl || run.htmlUrl;

    const summaryButton = node.querySelector('[data-action="toggle"]');
    summaryButton.addEventListener('click', () => toggleRun(runId));
    summaryButton.addEventListener('keydown', (event) => {
      if (event.key === 'Enter' || event.key === ' ') {
        event.preventDefault();
        toggleRun(runId);
      }
    });

    elements.runs.append(node);
  });
}

function toggleRun(runId) {
  if (state.expanded.has(runId)) {
    state.expanded.delete(runId);
  } else {
    state.expanded.add(runId);
  }
  renderRuns();
}

function setDetail(node, name, value) {
  node.querySelector(`[data-detail="${name}"]`).textContent = value || '--';
}

function matchesFilter(run) {
  if (state.filter === 'all') {
    return true;
  }
  if (state.filter === 'running') {
    return run.status !== 'completed';
  }
  return run.conclusion === state.filter;
}

function matchesQuery(run) {
  if (!state.query) {
    return true;
  }

  const summary = run.summary || {};
  return [
    run.name,
    run.number,
    run.conclusion,
    summary.siteName,
    summary.siteSlug,
    summary.itemName,
    summary.transactionCheckNumber,
    summary.orderId,
    summary.paymentType,
    summary.checkoutPaymentType,
  ].filter(Boolean).join(' ').toLowerCase().includes(state.query);
}

function stateForRun(run) {
  if (run.status !== 'completed') {
    return 'running';
  }
  return run.conclusion || 'cancelled';
}

function labelForRun(run) {
  if (run.status !== 'completed') {
    return 'Running';
  }
  if (run.conclusion === 'success') {
    return 'Passed';
  }
  if (run.conclusion === 'failure') {
    return 'Failed';
  }
  return run.conclusion || 'Done';
}

function resultNote(run) {
  const summary = run.summary || {};
  if (run.summaryError) {
    return run.summaryError;
  }
  if (run.conclusion === 'failure') {
    return 'The workflow failed. Open the run or artifacts to inspect the Playwright report, screenshots, video, and trace.';
  }
  if (summary.checkoutTotalMatchesTransaction === false) {
    return 'Checkout total did not match the transaction total.';
  }
  if (summary.transactionKitchenMessageVisible === false) {
    return 'Transaction matched. The kitchen message was not visible in the transaction detail.';
  }
  if (run.conclusion === 'success') {
    return 'Checkout and transaction validation completed.';
  }
  return 'Run is still in progress or has not produced a summary yet.';
}

function kitchenMessageStatus(summary) {
  if (summary.transactionKitchenMessageVisible === true) {
    return 'Visible in transaction';
  }
  if (summary.transactionKitchenMessageVisible === false) {
    return 'Not shown in transaction';
  }
  if (summary.kitchenMessageSubmitted === true) {
    return 'Submitted';
  }
  if (summary.kitchenMessageSubmitted === false) {
    return 'Not confirmed';
  }
  return '--';
}

function yesNo(value) {
  if (value === true) {
    return 'Yes';
  }
  if (value === false) {
    return 'No';
  }
  return '--';
}

function formatMoney(value) {
  return typeof value === 'number' ? money.format(value) : '--';
}

function firstItemName(summary) {
  return Array.isArray(summary.items) && summary.items[0] ? summary.items[0].name : '';
}

function formatDate(value) {
  return value ? dateTime.format(new Date(value)) : '--';
}

function duration(start, end) {
  if (!start || !end) {
    return '--';
  }
  const seconds = Math.max(0, Math.round((new Date(end) - new Date(start)) / 1000));
  if (seconds < 60) {
    return `${seconds}s`;
  }
  return `${Math.floor(seconds / 60)}m ${seconds % 60}s`;
}

function setBusy(isBusy) {
  elements.runs.setAttribute('aria-busy', String(isBusy));
  elements.refresh.disabled = isBusy;
}

function sampleRuns() {
  return [
    {
      id: 1,
      number: 14,
      name: 'Resident Ordering Tests',
      status: 'completed',
      conclusion: 'success',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      htmlUrl: 'https://github.com/almel00/playwright-ecomm/actions',
      artifactsUrl: 'https://github.com/almel00/playwright-ecomm/actions',
      artifactName: 'resident-ordering-sample',
      summary: {
        siteName: 'ABC Senior Living',
        siteSlug: 'abc-senior-living',
        revenueCenterName: 'Las Olivas',
        menuName: 'Lunch',
        itemName: 'Salmon Havarti',
        itemPrice: 12,
        subtotal: 12,
        tax: 0,
        discount: 0,
        total: 12,
        transactionCheckNumber: '99571794',
        paymentType: 'Direct Billing',
        checkoutPaymentType: 'Meal Credit',
        checkoutTotalMatchesTransaction: true,
        transactionKitchenMessageVisible: false,
        submissionPayloadMatched: false,
      },
    },
    {
      id: 2,
      number: 13,
      name: 'Resident Ordering Tests',
      status: 'completed',
      conclusion: 'failure',
      createdAt: new Date(Date.now() - 86400000).toISOString(),
      updatedAt: new Date(Date.now() - 86220000).toISOString(),
      htmlUrl: 'https://github.com/almel00/playwright-ecomm/actions',
      artifactsUrl: 'https://github.com/almel00/playwright-ecomm/actions',
      summaryError: 'No resident ordering artifact found for this run.',
      summary: {
        siteName: 'ABC Senior Living',
        itemName: 'Cake',
        subtotal: 12.5,
        tax: 1.88,
        discount: 0,
        total: 14.38,
        paymentType: 'Direct Billing',
      },
    },
  ];
}
