const zlib = require('zlib');

const json = (statusCode, body) => ({
  statusCode,
  headers: {
    'content-type': 'application/json; charset=utf-8',
    'cache-control': 'no-store',
  },
  body: JSON.stringify(body),
});

exports.handler = async () => {
  const config = readConfig();
  if (!config.token) {
    return json(500, {
      error: 'Missing GITHUB_TOKEN in Netlify environment variables.',
      runs: [],
    });
  }

  try {
    const runs = await fetchWorkflowRuns(config);
    const hydratedRuns = await Promise.all(
      runs.slice(0, config.limit).map((run) => hydrateRun(config, run)),
    );

    return json(200, {
      generatedAt: new Date().toISOString(),
      repo: `${config.owner}/${config.repo}`,
      workflowId: config.workflowId,
      actionsUrl: `https://github.com/${config.owner}/${config.repo}/actions`,
      runs: hydratedRuns,
    });
  } catch (error) {
    return json(500, {
      error: error instanceof Error ? error.message : 'Unknown GitHub API error.',
      runs: [],
    });
  }
};

function readConfig() {
  return {
    token: process.env.GITHUB_TOKEN,
    owner: process.env.GITHUB_OWNER || 'almel00',
    repo: process.env.GITHUB_REPO || 'playwright-ecomm',
    workflowId: process.env.GITHUB_WORKFLOW_ID || 'playwright.yml',
    branch: process.env.GITHUB_BRANCH || 'main',
    artifactPrefix: process.env.GITHUB_ARTIFACT_PREFIX || 'resident-ordering-',
    limit: Number(process.env.DASHBOARD_RUN_LIMIT || 10),
  };
}

async function fetchWorkflowRuns(config) {
  const branch = config.branch ? `&branch=${encodeURIComponent(config.branch)}` : '';
  const data = await githubJson(
    config,
    `/repos/${config.owner}/${config.repo}/actions/workflows/${encodeURIComponent(config.workflowId)}/runs?per_page=20${branch}`,
  );

  return data.workflow_runs || [];
}

async function hydrateRun(config, run) {
  const base = {
    id: run.id,
    number: run.run_number,
    name: run.name,
    event: run.event,
    branch: run.head_branch,
    status: run.status,
    conclusion: run.conclusion,
    createdAt: run.created_at,
    updatedAt: run.updated_at,
    htmlUrl: run.html_url,
    artifactsUrl: `${run.html_url}#artifacts`,
    summary: null,
    summaryError: null,
  };

  if (run.status !== 'completed') {
    return base;
  }

  try {
    const artifact = await findSummaryArtifact(config, run.artifacts_url);
    if (!artifact) {
      return { ...base, summaryError: 'No resident ordering artifact found for this run.' };
    }

    const zipBuffer = await githubBuffer(config, artifact.archive_download_url);
    const summaryText = extractZipText(zipBuffer, /(^|\/)order-summary\.json$/);
    if (!summaryText) {
      return { ...base, summaryError: 'Artifact did not contain order-summary.json.' };
    }

    return {
      ...base,
      artifactName: artifact.name,
      summary: JSON.parse(summaryText),
    };
  } catch (error) {
    return {
      ...base,
      summaryError: error instanceof Error ? error.message : 'Unable to read order summary artifact.',
    };
  }
}

async function findSummaryArtifact(config, artifactsUrl) {
  const data = await githubJson(config, artifactsUrl);
  const artifacts = data.artifacts || [];
  return artifacts.find((artifact) => artifact.name.startsWith(config.artifactPrefix))
    || artifacts.find((artifact) => /resident|ordering|summary/i.test(artifact.name));
}

async function githubJson(config, pathOrUrl) {
  const response = await githubFetch(config, pathOrUrl);
  if (!response.ok) {
    throw new Error(`GitHub API request failed: ${response.status} ${response.statusText}`);
  }
  return response.json();
}

async function githubBuffer(config, pathOrUrl) {
  const response = await githubFetch(config, pathOrUrl);
  if (!response.ok) {
    throw new Error(`GitHub artifact download failed: ${response.status} ${response.statusText}`);
  }
  return Buffer.from(await response.arrayBuffer());
}

function githubFetch(config, pathOrUrl) {
  const url = pathOrUrl.startsWith('http') ? pathOrUrl : `https://api.github.com${pathOrUrl}`;
  return fetch(url, {
    headers: {
      authorization: `Bearer ${config.token}`,
      accept: 'application/vnd.github+json',
      'x-github-api-version': '2022-11-28',
      'user-agent': 'resident-ordering-dashboard',
    },
  });
}

function extractZipText(zipBuffer, namePattern) {
  const entry = findZipEntry(zipBuffer, namePattern);
  if (!entry) {
    return null;
  }

  if (entry.method === 0) {
    return entry.data.toString('utf8');
  }

  if (entry.method === 8) {
    return zlib.inflateRawSync(entry.data).toString('utf8');
  }

  throw new Error(`Unsupported ZIP compression method ${entry.method}.`);
}

function findZipEntry(buffer, namePattern) {
  const eocdOffset = findEndOfCentralDirectory(buffer);
  if (eocdOffset < 0) {
    throw new Error('Invalid ZIP artifact: central directory not found.');
  }

  const totalEntries = buffer.readUInt16LE(eocdOffset + 10);
  let centralOffset = buffer.readUInt32LE(eocdOffset + 16);

  for (let index = 0; index < totalEntries; index += 1) {
    if (buffer.readUInt32LE(centralOffset) !== 0x02014b50) {
      throw new Error('Invalid ZIP artifact: central directory entry is corrupt.');
    }

    const method = buffer.readUInt16LE(centralOffset + 10);
    const compressedSize = buffer.readUInt32LE(centralOffset + 20);
    const fileNameLength = buffer.readUInt16LE(centralOffset + 28);
    const extraLength = buffer.readUInt16LE(centralOffset + 30);
    const commentLength = buffer.readUInt16LE(centralOffset + 32);
    const localHeaderOffset = buffer.readUInt32LE(centralOffset + 42);
    const fileName = buffer
      .subarray(centralOffset + 46, centralOffset + 46 + fileNameLength)
      .toString('utf8');

    if (namePattern.test(fileName)) {
      if (buffer.readUInt32LE(localHeaderOffset) !== 0x04034b50) {
        throw new Error('Invalid ZIP artifact: local file header is corrupt.');
      }
      const localFileNameLength = buffer.readUInt16LE(localHeaderOffset + 26);
      const localExtraLength = buffer.readUInt16LE(localHeaderOffset + 28);
      const dataStart = localHeaderOffset + 30 + localFileNameLength + localExtraLength;
      return {
        fileName,
        method,
        data: buffer.subarray(dataStart, dataStart + compressedSize),
      };
    }

    centralOffset += 46 + fileNameLength + extraLength + commentLength;
  }

  return null;
}

function findEndOfCentralDirectory(buffer) {
  const minOffset = Math.max(0, buffer.length - 65557);
  for (let offset = buffer.length - 22; offset >= minOffset; offset -= 1) {
    if (buffer.readUInt32LE(offset) === 0x06054b50) {
      return offset;
    }
  }
  return -1;
}
