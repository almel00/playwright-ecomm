const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');

const reportsRoot = path.resolve(process.cwd(), 'test-results', 'reports');
const latestReport = findLatestHtmlReport(reportsRoot);

if (!latestReport) {
  console.error(`No HTML report found under ${reportsRoot}`);
  process.exit(1);
}

console.log(`Opening latest Playwright report: ${latestReport}`);
const result = spawnSync('playwright', ['show-report', latestReport], {
  stdio: 'inherit',
  shell: true,
});

process.exit(result.status ?? 1);

function findLatestHtmlReport(root) {
  if (!fs.existsSync(root)) {
    return null;
  }

  const candidates = [];
  walk(root, candidates);
  candidates.sort((a, b) => b.mtimeMs - a.mtimeMs);
  return candidates[0]?.dir ?? null;
}

function walk(dir, candidates) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      walk(fullPath, candidates);
      continue;
    }

    if (entry.name === 'index.html' && path.basename(dir) === 'html') {
      candidates.push({ dir, mtimeMs: fs.statSync(fullPath).mtimeMs });
    }
  }
}
