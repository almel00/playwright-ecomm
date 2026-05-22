const state = {
  runs: [],
  filter: 'all',
  query: '',
  page: 'dashboard',
  isLoading: true,
};

const elements = {
  dashboardView: document.querySelector('#dashboardView'),
  detailView: document.querySelector('#detailView'),
  recentRunsBody: document.querySelector('#recentRunsBody'),
  allRunsBody: document.querySelector('#allRunsBody'),
  statusMessage: document.querySelector('#statusMessage'),
  pageTitle: document.querySelector('#pageTitle'),
  pageSubtitle: document.querySelector('#pageSubtitle'),
  latestStatus: document.querySelector('#latestStatus'),
  latestMeta: document.querySelector('#latestMeta'),
  passRate: document.querySelector('#passRate'),
  passRateMeta: document.querySelector('#passRateMeta'),
  failedCount: document.querySelector('#failedCount'),
  failedMeta: document.querySelector('#failedMeta'),
  latestTotal: document.querySelector('#latestTotal'),
  latestOrderMeta: document.querySelector('#latestOrderMeta'),
  recentCount: document.querySelector('#recentCount'),
  allCount: document.querySelector('#allCount'),
  failedBadge: document.querySelector('#failedBadge'),
  siteChipName: document.querySelector('#siteChipName'),
  siteChipSub: document.querySelector('#siteChipSub'),
  refresh: document.querySelector('#refreshButton'),
  actionsLink: document.querySelector('#actionsLink'),
  backButton: document.querySelector('#backButton'),
  detailStatus: document.querySelector('#detailStatus'),
  detailTitle: document.querySelector('#detailTitle'),
  detailSubtitle: document.querySelector('#detailSubtitle'),
  resultBars: document.querySelector('#resultBars'),
  durationTrend: document.querySelector('#durationTrend'),
  weeklyPassRate: document.querySelector('#weeklyPassRate'),
  statusDonut: document.querySelector('#statusDonut'),
  donutValue: document.querySelector('#donutValue'),
  donutLegend: document.querySelector('#donutLegend'),
  averageDuration: document.querySelector('#averageDuration'),
  paymentSplit: document.querySelector('#paymentSplit'),
  timelineList: document.querySelector('#timelineList'),
  quickTotal: document.querySelector('#quickTotal'),
  quickAverage: document.querySelector('#quickAverage'),
  quickFastest: document.querySelector('#quickFastest'),
  quickSlowest: document.querySelector('#quickSlowest'),
  quickSites: document.querySelector('#quickSites'),
};

const titles = {
  dashboard: ['Dashboard', 'Latest resident-ordering workflow activity'],
  runs: ['All Runs', 'Complete GitHub Actions history'],
  analytics: ['Analytics', 'Trends across completed workflow runs'],
  timeline: ['Timeline', 'Chronological run event log'],
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
elements.backButton.addEventListener('click', () => {
  window.location.hash = state.page === 'dashboard' ? '' : state.page;
});

document.querySelectorAll('.search-input').forEach((input) => {
  input.addEventListener('input', (event) => {
    state.query = event.target.value.toLowerCase().trim();
    syncSearchInputs(event.target.value);
    renderRunTables();
  });
});

document.querySelectorAll('[data-filter-group]').forEach((group) => {
  group.addEventListener('click', (event) => {
    const button = event.target.closest('[data-filter]');
    if (!button) {
      return;
    }
    state.filter = button.dataset.filter;
    syncFilterTabs();
    renderRunTables();
  });
});

window.addEventListener('hashchange', renderRoute);
window.addEventListener('resize', debounce(renderCharts, 120));

loadRuns();

async function loadRuns() {
  state.isLoading = true;
  setBusy(true);
  setStatusMessage('');
  renderLoadingState();
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
    state.isLoading = false;
    renderAll();
  } catch (error) {
    state.runs = sampleRuns();
    state.isLoading = false;
    renderAll();
    setStatusMessage(`${error instanceof Error ? error.message : 'Unable to load GitHub Actions data.'}. Showing sample layout data.`);
  } finally {
    setBusy(false);
  }
}

function renderAll() {
  clearLoadingState();
  renderSummary();
  renderRunTables();
  renderCharts();
  renderTimeline();
  renderRoute();
}

function renderRoute() {
  const hash = window.location.hash.replace(/^#/, '');
  const runMatch = hash.match(/^run-(.+)$/);

  if (runMatch) {
    const runId = decodeURIComponent(runMatch[1]);
    const run = state.runs.find((candidate) => String(candidate.id || candidate.number) === runId);
    if (run) {
      elements.dashboardView.hidden = true;
      elements.detailView.hidden = false;
      renderRunDetail(run);
      return;
    }
  }

  const nextPage = titles[hash] ? hash : 'dashboard';
  state.page = nextPage;
  elements.dashboardView.hidden = false;
  elements.detailView.hidden = true;
  document.querySelectorAll('[data-page]').forEach((page) => {
    page.classList.toggle('is-active', page.dataset.page === nextPage);
  });
  document.querySelectorAll('[data-nav]').forEach((link) => {
    link.classList.toggle('is-active', link.dataset.nav === nextPage);
  });
  elements.pageTitle.textContent = titles[nextPage][0];
  elements.pageSubtitle.textContent = titles[nextPage][1];
  window.scrollTo({ top: 0, behavior: 'smooth' });
}

function renderSummary() {
  const latest = state.runs[0];
  const completed = state.runs.filter((run) => run.status === 'completed');
  const passed = completed.filter((run) => run.conclusion === 'success');
  const failed = completed.filter((run) => run.conclusion === 'failure');
  const passRate = completed.length ? Math.round((passed.length / completed.length) * 100) : 0;

  elements.failedBadge.hidden = failed.length === 0;
  elements.failedBadge.textContent = failed.length;
  elements.failedCount.textContent = String(failed.length);
  elements.failedMeta.textContent = failed.length ? `Latest failed run #${failed[0].number}` : 'No completed failures';
  elements.passRate.textContent = completed.length ? `${passRate}%` : '--';
  elements.passRateMeta.textContent = `${passed.length}/${completed.length} completed runs passed`;
  elements.recentCount.textContent = `${state.runs.length} runs loaded`;
  elements.allCount.textContent = `${state.runs.length} runs loaded`;
  elements.quickTotal.textContent = String(state.runs.length);

  if (!latest) {
    elements.latestStatus.textContent = 'No runs';
    elements.latestMeta.textContent = 'No workflow data found';
    elements.latestTotal.textContent = '--';
    elements.latestOrderMeta.textContent = '--';
    elements.siteChipName.textContent = 'GitHub Actions';
    elements.siteChipSub.textContent = 'No data loaded';
    return;
  }

  const summary = latest.summary || {};
  elements.latestStatus.textContent = labelForRun(latest);
  elements.latestMeta.textContent = `${formatDate(latest.createdAt)} - run #${latest.number}`;
  elements.latestTotal.textContent = formatMoney(summary.total);
  elements.latestOrderMeta.textContent = [summary.itemName || firstItemName(summary), summary.paymentType || summary.checkoutPaymentType]
    .filter(Boolean)
    .join(' - ') || '--';
  elements.siteChipName.textContent = summary.siteSlug || summary.siteName || 'GitHub Actions';
  elements.siteChipSub.textContent = summary.baseUrl ? shortHost(summary.baseUrl) : 'Live workflow data';
}

function renderRunTables() {
  if (state.isLoading) {
    renderSkeletonTable(elements.recentRunsBody, 6);
    renderSkeletonTable(elements.allRunsBody, 8);
    return;
  }

  const visibleRuns = state.runs.filter(matchesFilter).filter(matchesQuery);
  renderTable(elements.recentRunsBody, visibleRuns.slice(0, 6));
  renderTable(elements.allRunsBody, visibleRuns);
}

function renderTable(body, runs) {
  body.innerHTML = '';

  if (!runs.length) {
    const row = document.createElement('tr');
    row.className = 'empty-row';
    const cell = document.createElement('td');
    cell.colSpan = 8;
    cell.textContent = 'No runs match the current view.';
    row.append(cell);
    body.append(row);
    return;
  }

  runs.forEach((run) => {
    const summary = run.summary || {};
    const status = stateForRun(run);
    const row = document.createElement('tr');
    row.dataset.runId = String(run.id || run.number);
    row.tabIndex = 0;

    row.append(
      tableCell(runTitle(run)),
      tableCell(summary.siteName || summary.siteSlug || summary.baseUrl || '--'),
      tableCell(summary.itemName || firstItemName(summary) || '--'),
      tableCell(formatMoney(summary.total), 'mono'),
      tableCell(summary.transactionCheckNumber || summary.orderId || '--', 'mono'),
      tableCell(summary.paymentType || summary.checkoutPaymentType || '--'),
      tableCell(duration(run.createdAt, run.updatedAt), 'mono'),
      tableCell(statusBadge(status, labelForRun(run))),
    );

    row.addEventListener('click', () => openRun(row.dataset.runId));
    row.addEventListener('keydown', (event) => {
      if (event.key === 'Enter' || event.key === ' ') {
        event.preventDefault();
        openRun(row.dataset.runId);
      }
    });
    body.append(row);
  });
}

function runTitle(run) {
  const wrapper = document.createElement('span');
  wrapper.className = 'run-title';

  const number = document.createElement('strong');
  number.textContent = `#${run.number}`;

  const meta = document.createElement('span');
  meta.className = 'run-meta';
  meta.textContent = formatDate(run.createdAt);

  wrapper.append(number, meta);
  return wrapper;
}

function statusBadge(status, label) {
  const badge = document.createElement('span');
  badge.className = 'badge';
  badge.dataset.state = status;
  badge.textContent = label;
  return badge;
}

function tableCell(content, className = '') {
  const cell = document.createElement('td');
  if (className) {
    cell.className = className;
  }
  if (content instanceof Node) {
    cell.append(content);
  } else {
    cell.textContent = content;
  }
  return cell;
}

function openRun(runId) {
  window.location.hash = `run-${encodeURIComponent(runId)}`;
}

function renderCharts() {
  if (state.isLoading) {
    return;
  }

  renderResultBars();
  renderDurationBars();
  renderWeeklyPassRate();
  renderStatusDonut();
  renderAverageDuration();
  renderPaymentSplit();
  renderQuickStats();
}

function renderResultBars() {
  const runs = state.runs.slice(0, 16).reverse();
  drawBarChart(elements.resultBars, runs.map((run) => ({
    label: `#${run.number}`,
    value: durationSeconds(run) || 1,
    color: colorForRun(run),
    softColor: softColorForRun(run),
  })), {
    formatYAxis: formatDurationAxis,
    maxTicks: 4,
  });
}

function renderDurationBars() {
  const runs = state.runs.slice(0, 16).reverse();
  drawLineChart(elements.durationTrend, runs.map((run) => ({
    label: `#${run.number}`,
    value: durationSeconds(run) || 0,
  })), {
    color: '#2563eb',
    fill: 'rgba(37, 99, 235, .10)',
    formatYAxis: formatDurationAxis,
  });
}

function renderWeeklyPassRate() {
  const buckets = new Map();
  state.runs.forEach((run) => {
    if (run.status !== 'completed') {
      return;
    }
    const key = weekKey(run.createdAt);
    const bucket = buckets.get(key) || { total: 0, passed: 0 };
    bucket.total += 1;
    if (run.conclusion === 'success') {
      bucket.passed += 1;
    }
    buckets.set(key, bucket);
  });

  const entries = Array.from(buckets.entries()).slice(-8);
  drawLineChart(elements.weeklyPassRate, entries.map(([key, bucket]) => {
    const rate = bucket.total ? Math.round((bucket.passed / bucket.total) * 100) : 0;
    return { label: key, value: rate };
  }), {
    color: '#2563eb',
    fill: 'rgba(37, 99, 235, .08)',
    min: 0,
    max: 100,
    formatYAxis: (value) => `${Math.round(value)}%`,
  });
}

function renderStatusDonut() {
  const completed = state.runs.filter((run) => run.status === 'completed');
  const passed = completed.filter((run) => run.conclusion === 'success').length;
  const failed = completed.filter((run) => run.conclusion === 'failure').length;
  const passRate = completed.length ? Math.round((passed / completed.length) * 100) : 0;
  const angle = Math.round((passed / Math.max(completed.length, 1)) * 360);

  elements.statusDonut.style.setProperty('--pass-angle', `${angle}deg`);
  elements.donutValue.textContent = completed.length ? `${passRate}%` : '--';
  elements.donutLegend.innerHTML = '';
  elements.donutLegend.append(
    legendItem('Passed', passed, 'legend-dot--pass'),
    legendItem('Failed', failed, 'legend-dot--fail'),
  );
}

function renderAverageDuration() {
  const buckets = new Map();
  state.runs.forEach((run) => {
    const seconds = durationSeconds(run);
    if (seconds === null) {
      return;
    }
    const key = dayKey(run.createdAt);
    const bucket = buckets.get(key) || { total: 0, count: 0 };
    bucket.total += seconds;
    bucket.count += 1;
    buckets.set(key, bucket);
  });

  const entries = Array.from(buckets.entries()).slice(-7);
  drawBarChart(elements.averageDuration, entries.map(([key, bucket]) => {
    const average = Math.round(bucket.total / bucket.count);
    return {
      label: key,
      value: average,
      color: '#2563eb',
      softColor: 'rgba(37, 99, 235, .13)',
    };
  }), {
    formatYAxis: formatDurationAxis,
    maxTicks: 4,
  });
}

function renderPaymentSplit() {
  const counts = new Map();
  state.runs.forEach((run) => {
    const summary = run.summary || {};
    const payment = summary.paymentType || summary.checkoutPaymentType || 'Unknown';
    counts.set(payment, (counts.get(payment) || 0) + 1);
  });

  const total = Math.max(state.runs.length, 1);
  elements.paymentSplit.innerHTML = '';
  Array.from(counts.entries()).forEach(([label, count]) => {
    const row = document.createElement('div');
    row.className = 'split-row';
    row.innerHTML = `
      <div class="split-row__top"><span>${escapeHtml(label)}</span><strong>${count}</strong></div>
      <div class="split-track"><div class="split-fill" style="width:${Math.round((count / total) * 100)}%"></div></div>
    `;
    elements.paymentSplit.append(row);
  });
}

function legendItem(label, count, dotClass) {
  const item = document.createElement('span');
  item.innerHTML = `<i class="legend-dot ${dotClass}"></i>${label} - ${count}`;
  return item;
}

function renderTimeline() {
  elements.timelineList.innerHTML = '';
  state.runs.slice(0, 20).forEach((run) => {
    const summary = run.summary || {};
    const item = document.createElement('li');
    item.className = 'timeline-item';
    const status = stateForRun(run);
    item.innerHTML = `
      <span class="timeline-dot" data-state="${status}"></span>
      <span class="timeline-body">
        <strong>Run #${run.number} - ${escapeHtml(summary.itemName || firstItemName(summary) || run.name || 'Resident Ordering Tests')}</strong>
        <span>${formatDate(run.createdAt)} - ${duration(run.createdAt, run.updatedAt)} - ${escapeHtml(labelForRun(run))}</span>
      </span>
      <span class="badge" data-state="${status}">${escapeHtml(labelForRun(run))}</span>
    `;
    item.addEventListener('click', () => openRun(String(run.id || run.number)));
    elements.timelineList.append(item);
  });
}

function renderQuickStats() {
  const durations = state.runs.map(durationSeconds).filter((value) => value !== null);
  const sites = new Set(state.runs.map((run) => {
    const summary = run.summary || {};
    return summary.siteSlug || summary.siteName || summary.baseUrl;
  }).filter(Boolean));

  if (!durations.length) {
    elements.quickAverage.textContent = '--';
    elements.quickFastest.textContent = '--';
    elements.quickSlowest.textContent = '--';
  } else {
    const average = Math.round(durations.reduce((sum, value) => sum + value, 0) / durations.length);
    elements.quickAverage.textContent = formatDurationSeconds(average);
    elements.quickFastest.textContent = formatDurationSeconds(Math.min(...durations));
    elements.quickSlowest.textContent = formatDurationSeconds(Math.max(...durations));
  }
  elements.quickSites.textContent = String(sites.size);
}

function drawBarChart(canvas, data, options = {}) {
  const chart = setupCanvas(canvas);
  if (!chart) {
    return;
  }
  const { context, width, height } = chart;
  const padding = { top: 8, right: 10, bottom: 28, left: 42 };
  const plotWidth = width - padding.left - padding.right;
  const plotHeight = height - padding.top - padding.bottom;
  const values = data.map((point) => point.value);
  const maxValue = options.max || Math.max(...values, 1);
  const tickCount = options.maxTicks || 4;

  drawGrid(context, padding, width, height, maxValue, tickCount, options.formatYAxis);

  if (!data.length) {
    drawNoData(context, width, height);
    return;
  }

  const gap = 12;
  const barWidth = Math.max(12, Math.min(42, (plotWidth - gap * (data.length - 1)) / data.length));
  const totalWidth = barWidth * data.length + gap * Math.max(0, data.length - 1);
  const startX = padding.left + Math.max(0, (plotWidth - totalWidth) / 2);
  data.forEach((point, index) => {
    const x = startX + index * (barWidth + gap);
    const barHeight = Math.max(4, (point.value / maxValue) * plotHeight);
    const y = padding.top + plotHeight - barHeight;

    roundedRect(context, x, y, barWidth, barHeight, 5, point.softColor || point.color);
    context.strokeStyle = point.color;
    context.lineWidth = 1.5;
    context.stroke();

    context.fillStyle = '#9099b5';
    context.font = '10px "DM Mono", monospace';
    context.textAlign = 'center';
    context.fillText(point.label, x + barWidth / 2, height - 7);
  });
}

function drawLineChart(canvas, data, options = {}) {
  const chart = setupCanvas(canvas);
  if (!chart) {
    return;
  }
  const { context, width, height } = chart;
  const padding = { top: 12, right: 12, bottom: 28, left: 42 };
  const plotWidth = width - padding.left - padding.right;
  const plotHeight = height - padding.top - padding.bottom;
  const values = data.map((point) => point.value);
  const maxValue = options.max ?? Math.max(...values, 1);
  const minValue = options.min ?? Math.min(0, ...values);
  const range = Math.max(1, maxValue - minValue);

  drawGrid(context, padding, width, height, maxValue, 4, options.formatYAxis, minValue);

  if (!data.length) {
    drawNoData(context, width, height);
    return;
  }

  const points = data.map((point, index) => {
    const x = padding.left + (data.length === 1 ? plotWidth / 2 : (plotWidth / (data.length - 1)) * index);
    const y = padding.top + plotHeight - ((point.value - minValue) / range) * plotHeight;
    return { ...point, x, y };
  });

  context.beginPath();
  points.forEach((point, index) => {
    if (index === 0) {
      context.moveTo(point.x, point.y);
    } else {
      const previous = points[index - 1];
      const controlX = (previous.x + point.x) / 2;
      context.bezierCurveTo(controlX, previous.y, controlX, point.y, point.x, point.y);
    }
  });
  context.lineTo(points.at(-1).x, padding.top + plotHeight);
  context.lineTo(points[0].x, padding.top + plotHeight);
  context.closePath();
  context.fillStyle = options.fill || 'rgba(37, 99, 235, .10)';
  context.fill();

  context.beginPath();
  points.forEach((point, index) => {
    if (index === 0) {
      context.moveTo(point.x, point.y);
    } else {
      const previous = points[index - 1];
      const controlX = (previous.x + point.x) / 2;
      context.bezierCurveTo(controlX, previous.y, controlX, point.y, point.x, point.y);
    }
  });
  context.strokeStyle = options.color || '#2563eb';
  context.lineWidth = 2.2;
  context.stroke();

  points.forEach((point) => {
    context.beginPath();
    context.arc(point.x, point.y, 3.4, 0, Math.PI * 2);
    context.fillStyle = '#ffffff';
    context.fill();
    context.strokeStyle = options.color || '#2563eb';
    context.lineWidth = 2;
    context.stroke();

    context.fillStyle = '#9099b5';
    context.font = '10px "DM Mono", monospace';
    context.textAlign = 'center';
    context.fillText(point.label, point.x, height - 7);
  });
}

function setupCanvas(canvas) {
  if (!canvas) {
    return null;
  }
  const rect = canvas.getBoundingClientRect();
  const width = Math.max(1, Math.floor(rect.width));
  const height = Math.max(1, Math.floor(rect.height));
  const scale = window.devicePixelRatio || 1;
  canvas.width = Math.floor(width * scale);
  canvas.height = Math.floor(height * scale);
  const context = canvas.getContext('2d');
  context.setTransform(scale, 0, 0, scale, 0, 0);
  context.clearRect(0, 0, width, height);
  return { context, width, height };
}

function drawGrid(context, padding, width, height, maxValue, tickCount, formatter = (value) => String(Math.round(value)), minValue = 0) {
  const plotHeight = height - padding.top - padding.bottom;
  const range = Math.max(1, maxValue - minValue);
  context.strokeStyle = 'rgba(208, 213, 232, .68)';
  context.fillStyle = '#9099b5';
  context.lineWidth = 1;
  context.font = '10px "DM Sans", sans-serif';
  context.textAlign = 'right';

  for (let index = 0; index <= tickCount; index += 1) {
    const value = minValue + (range / tickCount) * index;
    const y = padding.top + plotHeight - ((value - minValue) / range) * plotHeight;
    context.beginPath();
    context.moveTo(padding.left, y);
    context.lineTo(width - padding.right, y);
    context.stroke();
    context.fillText(formatter(value), padding.left - 8, y + 3);
  }
}

function drawNoData(context, width, height) {
  context.fillStyle = '#9099b5';
  context.font = '12px "DM Sans", sans-serif';
  context.textAlign = 'center';
  context.fillText('No chart data', width / 2, height / 2);
}

function roundedRect(context, x, y, width, height, radius, fillStyle) {
  const safeRadius = Math.min(radius, width / 2, height / 2);
  context.beginPath();
  context.moveTo(x + safeRadius, y);
  context.lineTo(x + width - safeRadius, y);
  context.quadraticCurveTo(x + width, y, x + width, y + safeRadius);
  context.lineTo(x + width, y + height);
  context.lineTo(x, y + height);
  context.lineTo(x, y + safeRadius);
  context.quadraticCurveTo(x, y, x + safeRadius, y);
  context.closePath();
  context.fillStyle = fillStyle;
  context.fill();
}

function colorForRun(run) {
  const status = stateForRun(run);
  if (status === 'failure') {
    return '#dc2626';
  }
  if (status === 'running') {
    return '#d97706';
  }
  return '#16a34a';
}

function softColorForRun(run) {
  const status = stateForRun(run);
  if (status === 'failure') {
    return 'rgba(220, 38, 38, .14)';
  }
  if (status === 'running') {
    return 'rgba(217, 119, 6, .14)';
  }
  return 'rgba(22, 163, 74, .14)';
}

function renderRunDetail(run) {
  const summary = run.summary || {};
  const status = stateForRun(run);

  elements.detailStatus.dataset.state = status;
  elements.detailStatus.textContent = labelForRun(run);
  elements.detailTitle.textContent = `${summary.siteName || run.name || 'Resident Ordering Tests'} - #${run.number}`;
  elements.detailSubtitle.textContent = `${formatDate(run.createdAt)} - ${run.branch || 'main'} - ${run.event || 'workflow'}`;

  setDetail('heroTotal', formatMoney(summary.total));
  setDetail('heroCheck', summary.transactionCheckNumber || summary.orderId);
  setDetail('heroPayment', summary.paymentType || summary.checkoutPaymentType);
  setDetail('heroDuration', duration(run.createdAt, run.updatedAt));
  setDetail('revenueCenter', summary.revenueCenterName);
  setDetail('menu', summary.menuName);
  setDetail('detailItem', summary.itemName || firstItemName(summary));
  setDetail('itemPrice', formatMoney(summary.itemPrice));
  setDetail('subtotal', formatMoney(summary.subtotal));
  setDetail('tax', formatMoney(summary.tax));
  setDetail('discount', formatMoney(summary.discount));
  setDetail('detailTotal', formatMoney(summary.total));
  setDetail('checkoutPayment', summary.checkoutPaymentType);
  setDetail('transactionCheck', summary.transactionCheckNumber);
  setDetail('orderId', summary.orderId);
  setDetail('transactionDate', summary.transactionDate);
  setDetail('transactionPayment', summary.paymentType);
  setDetail('totalMatched', yesNo(summary.checkoutTotalMatchesTransaction));
  setDetail('kitchenMessage', kitchenMessageStatus(summary));
  setDetail('payloadMatched', yesNo(summary.submissionPayloadMatched));
  setDetail('artifactName', run.artifactName);
  setDetail('note', resultNote(run));
  renderFlowChecks(buildFlowChecks(run));

  elements.detailView.querySelector('[data-link="run"]').href = run.htmlUrl;
  elements.detailView.querySelector('[data-link="artifacts"]').href = run.artifactsUrl || run.htmlUrl;
  window.scrollTo({ top: 0, behavior: 'smooth' });
}

function setDetail(name, value) {
  elements.detailView.querySelector(`[data-detail="${name}"]`).textContent = value || '--';
}

function renderFlowChecks(checks) {
  const list = elements.detailView.querySelector('[data-detail="flowChecks"]');
  list.innerHTML = '';

  checks.forEach((check) => {
    const item = document.createElement('li');
    item.className = `flow-item flow-item--${check.state}`;

    const label = document.createElement('span');
    label.className = 'flow-item__label';
    label.textContent = check.label;

    const detail = document.createElement('span');
    detail.className = 'flow-item__detail';
    detail.textContent = check.detail;

    const status = document.createElement('span');
    status.className = 'flow-item__status';
    status.textContent = check.state === 'pass' ? 'Pass' : check.state === 'fail' ? 'Fail' : 'Unknown';

    item.append(label, detail, status);
    list.append(item);
  });
}

function buildFlowChecks(run) {
  const summary = run.summary || {};
  const hasSummary = Boolean(run.summary);
  const runFailed = run.status === 'completed' && run.conclusion === 'failure';
  const runPassed = run.status === 'completed' && run.conclusion === 'success';
  const reachedCheckout = hasSummary && typeof summary.total === 'number';
  const reachedMenu = hasSummary && Boolean(summary.revenueCenterName || summary.menuName || summary.itemName);
  const orderSubmitted = hasSummary && (summary.checkoutTotalMatchesTransaction !== undefined || summary.transactionKitchenMessageVisible !== undefined);
  const transactionMatched = summary.checkoutTotalMatchesTransaction === true;
  const payloadCaptured = summary.submissionPayloadMatched === true;

  const checks = [
    {
      label: 'Open site',
      state: hasSummary || runPassed ? 'pass' : runFailed ? 'unknown' : 'unknown',
      detail: summary.baseUrl || summary.siteName || 'Started workflow',
    },
    {
      label: 'Resident name and room',
      state: hasSummary || runPassed ? 'pass' : 'unknown',
      detail: hasSummary || runPassed ? 'Credentials accepted far enough to continue' : 'No run summary was produced',
    },
    {
      label: 'PIN login',
      state: reachedMenu || reachedCheckout || runPassed ? 'pass' : runFailed ? 'unknown' : 'unknown',
      detail: reachedMenu || reachedCheckout || runPassed ? 'Resident reached ordering area' : 'Open the Playwright report to confirm login failure point',
    },
    {
      label: 'Menu discovery',
      state: reachedMenu ? 'pass' : runFailed ? 'unknown' : 'unknown',
      detail: reachedMenu ? `${summary.revenueCenterName || 'Revenue center'} / ${summary.menuName || 'Menu'}` : 'No menu selection was recorded',
    },
    {
      label: 'Item added',
      state: summary.itemName ? 'pass' : runFailed ? 'unknown' : 'unknown',
      detail: summary.itemName || 'No item was recorded',
    },
    {
      label: 'Checkout math',
      state: reachedCheckout ? 'pass' : runFailed ? 'unknown' : 'unknown',
      detail: reachedCheckout ? `Total ${formatMoney(summary.total)}` : 'No checkout total was recorded',
    },
    {
      label: 'Submit payload',
      state: payloadCaptured ? 'pass' : orderSubmitted || runPassed ? 'unknown' : runFailed ? 'unknown' : 'unknown',
      detail: payloadCaptured ? 'Payload captured and matched expected totals' : 'Payload was not captured; transaction validation is used instead',
    },
    {
      label: 'Transaction match',
      state: transactionMatched ? 'pass' : runFailed || summary.checkoutTotalMatchesTransaction === false ? 'fail' : 'unknown',
      detail: transactionMatched ? 'Checkout matched transaction details' : failureDetail(run),
    },
  ];

  if (runFailed && !hasSummary) {
    checks.unshift({
      label: 'Failure source',
      state: 'fail',
      detail: run.summaryError || 'Workflow failed before order summary was available',
    });
  }

  return checks;
}

function failureDetail(run) {
  if (run.summaryError) {
    return run.summaryError;
  }
  const summary = run.summary || {};
  if (summary.checkoutTotalMatchesTransaction === false) {
    return 'Checkout and transaction totals did not match';
  }
  if (run.conclusion === 'failure') {
    return 'Open report or trace for the failing assertion';
  }
  return 'Not confirmed in summary';
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
  const seconds = start && end ? Math.max(0, Math.round((new Date(end) - new Date(start)) / 1000)) : null;
  return seconds === null ? '--' : formatDurationSeconds(seconds);
}

function durationSeconds(run) {
  if (!run.createdAt || !run.updatedAt) {
    return null;
  }
  return Math.max(0, Math.round((new Date(run.updatedAt) - new Date(run.createdAt)) / 1000));
}

function formatDurationSeconds(seconds) {
  if (seconds < 60) {
    return `${seconds}s`;
  }
  return `${Math.floor(seconds / 60)}m ${seconds % 60}s`;
}

function formatDurationAxis(value) {
  return value >= 60 ? `${Math.round(value / 60)}m` : `${Math.round(value)}s`;
}

function dayKey(value) {
  const date = new Date(value);
  return `${date.getMonth() + 1}/${date.getDate()}`;
}

function weekKey(value) {
  const date = new Date(value);
  const start = new Date(date.getFullYear(), 0, 1);
  const week = Math.ceil((((date - start) / 86400000) + start.getDay() + 1) / 7);
  return `W${week}`;
}

function shortHost(value) {
  try {
    return new URL(value).hostname;
  } catch {
    return value;
  }
}

function syncSearchInputs(value) {
  document.querySelectorAll('.search-input').forEach((input) => {
    if (input.value !== value) {
      input.value = value;
    }
  });
}

function syncFilterTabs() {
  document.querySelectorAll('[data-filter]').forEach((button) => {
    button.classList.toggle('is-active', button.dataset.filter === state.filter);
  });
}

function setBusy(isBusy) {
  elements.recentRunsBody.setAttribute('aria-busy', String(isBusy));
  elements.allRunsBody.setAttribute('aria-busy', String(isBusy));
  elements.refresh.disabled = isBusy;
  elements.refresh.textContent = isBusy ? 'Refreshing' : 'Refresh';
}

function renderLoadingState() {
  setSkeletonText(elements.latestStatus, 'Latest run loading');
  setSkeletonText(elements.latestMeta, 'Fetching workflow status');
  setSkeletonText(elements.passRate, 'Pass rate loading');
  setSkeletonText(elements.passRateMeta, 'Fetching completed runs');
  setSkeletonText(elements.failedCount, 'Failed runs loading');
  setSkeletonText(elements.failedMeta, 'Fetching failures');
  setSkeletonText(elements.latestTotal, 'Order total loading');
  setSkeletonText(elements.latestOrderMeta, 'Fetching order summary');
  setSkeletonText(elements.recentCount, 'Loading recent runs');
  setSkeletonText(elements.allCount, 'Loading run history');
  setSkeletonText(elements.quickTotal, 'Loading total runs');
  setSkeletonText(elements.quickAverage, 'Loading average duration');
  setSkeletonText(elements.quickFastest, 'Loading fastest run');
  setSkeletonText(elements.quickSlowest, 'Loading slowest run');
  setSkeletonText(elements.quickSites, 'Loading tested sites');

  document.querySelectorAll('.chart-frame, .donut-card, .split-list, .timeline-list').forEach((element) => {
    element.classList.add('is-loading');
    element.setAttribute('aria-busy', 'true');
  });

  elements.donutValue.textContent = '';
  elements.donutLegend.innerHTML = '';
  elements.paymentSplit.innerHTML = '';
  elements.timelineList.innerHTML = '';
  renderSkeletonTable(elements.recentRunsBody, 6);
  renderSkeletonTable(elements.allRunsBody, 8);
}

function clearLoadingState() {
  document.querySelectorAll('.skeleton-text').forEach((element) => {
    element.classList.remove('skeleton-text', 'skeleton-text--short', 'skeleton-text--wide');
    element.removeAttribute('aria-label');
  });
  document.querySelectorAll('.is-loading').forEach((element) => {
    element.classList.remove('is-loading');
    element.removeAttribute('aria-busy');
  });
}

function setSkeletonText(element, label) {
  element.textContent = '';
  element.setAttribute('aria-label', label);
  element.classList.add('skeleton-text');
}

function renderSkeletonTable(body, rowCount) {
  body.innerHTML = '';
  for (let rowIndex = 0; rowIndex < rowCount; rowIndex += 1) {
    const row = document.createElement('tr');
    row.className = 'skeleton-row';
    for (let cellIndex = 0; cellIndex < 8; cellIndex += 1) {
      const cell = document.createElement('td');
      const line = document.createElement('span');
      line.className = `skeleton-line skeleton-line--${cellIndex % 3}`;
      cell.append(line);
      row.append(cell);
    }
    body.append(row);
  }
}

function setStatusMessage(message) {
  elements.statusMessage.hidden = !message;
  elements.statusMessage.textContent = message;
}

function debounce(callback, delay) {
  let timeoutId;
  return (...args) => {
    window.clearTimeout(timeoutId);
    timeoutId = window.setTimeout(() => callback(...args), delay);
  };
}

function escapeHtml(value) {
  return String(value).replace(/[&<>"']/g, (character) => ({
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#39;',
  }[character]));
}

function sampleRuns() {
  const now = Date.now();
  return [
    {
      id: 1,
      number: 16,
      name: 'Resident Ordering Tests',
      status: 'completed',
      conclusion: 'success',
      branch: 'main',
      event: 'schedule',
      createdAt: new Date(now).toISOString(),
      updatedAt: new Date(now + 91000).toISOString(),
      htmlUrl: 'https://github.com/almel00/playwright-ecomm/actions',
      artifactsUrl: 'https://github.com/almel00/playwright-ecomm/actions',
      artifactName: 'resident-ordering-sample',
      summary: {
        siteName: 'ABC Senior Living',
        siteSlug: 'abc-senior-living',
        baseUrl: 'https://abcseniorliving.servingintel.app',
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
      number: 15,
      name: 'Resident Ordering Tests',
      status: 'completed',
      conclusion: 'success',
      branch: 'main',
      event: 'workflow_dispatch',
      createdAt: new Date(now - 86400000).toISOString(),
      updatedAt: new Date(now - 86400000 + 106000).toISOString(),
      htmlUrl: 'https://github.com/almel00/playwright-ecomm/actions',
      artifactsUrl: 'https://github.com/almel00/playwright-ecomm/actions',
      summary: {
        siteName: 'ABC Senior Living',
        itemName: 'Anniversary Package',
        itemPrice: 43.13,
        subtotal: 43.13,
        tax: 0,
        discount: 0,
        total: 43.13,
        transactionCheckNumber: '99571790',
        paymentType: 'Direct Billing',
        checkoutTotalMatchesTransaction: true,
      },
    },
    {
      id: 3,
      number: 14,
      name: 'Resident Ordering Tests',
      status: 'completed',
      conclusion: 'failure',
      branch: 'main',
      event: 'workflow_dispatch',
      createdAt: new Date(now - 172800000).toISOString(),
      updatedAt: new Date(now - 172800000 + 194000).toISOString(),
      htmlUrl: 'https://github.com/almel00/playwright-ecomm/actions',
      artifactsUrl: 'https://github.com/almel00/playwright-ecomm/actions',
      summaryError: 'Could not find a transaction matching checkout total and item details.',
      summary: {
        siteName: 'ABC Senior Living',
        itemName: 'Cake',
        subtotal: 12.5,
        tax: 1.88,
        discount: 0,
        total: 14.38,
        paymentType: 'Direct Billing',
        checkoutTotalMatchesTransaction: false,
      },
    },
  ];
}
