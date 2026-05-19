# Resident Ordering Dashboard

Lightweight Netlify dashboard for the resident ordering GitHub Actions workflow.

## Netlify Setup

Create a Netlify site from this repo and set the base directory to:

```text
dashboard
```

Netlify will use `dashboard/netlify.toml`.

## Environment Variables

Set these in Netlify site settings:

```text
GITHUB_TOKEN
GITHUB_OWNER=almel00
GITHUB_REPO=playwright-ecomm
GITHUB_WORKFLOW_ID=playwright.yml
GITHUB_BRANCH=main
GITHUB_ARTIFACT_PREFIX=resident-ordering-
```

`GITHUB_TOKEN` should have read-only access to Actions metadata and artifacts for the repo.

## Local Check

```powershell
cd dashboard
npm run check
```

For local Netlify development, install the Netlify CLI and run:

```powershell
netlify dev
```
