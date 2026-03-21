# GitHub Action

ArchMap is available as a reusable GitHub Action. It scans a GitHub org, builds a static visualization site, and writes everything to a directory you can deploy to GitHub Pages or any static host.

## Inputs

| Input | Required | Default | Description |
|-------|----------|---------|-------------|
| `github_token` | Yes | — | PAT with `repo` and `read:org` scopes |
| `github_org` | Yes | — | GitHub organization to scan |
| `output_path` | No | `archmap-out` | Directory (relative to workspace) to write the static site and `graph.json` |

## Output

After the action runs, `output_path/` contains:

```
output_path/
  graph.json       <- raw graph data
  index.html       <- static React Flow visualization
  _next/           <- Next.js assets
```

## Basic usage

```yaml
steps:
  - uses: actions/checkout@v4

  - uses: abdullahbodur/archmap@main
    with:
      github_token: ${{ secrets.ORG_TOKEN }}
      github_org: your-org
      output_path: _site
```

## Full workflow: daily scan + GitHub Pages

This is the recommended pattern. Create a separate deployment repository (e.g. `your-org/archmap`) with this workflow:

```yaml
name: Scan & Deploy

on:
  schedule:
    - cron: "0 3 * * *"
  workflow_dispatch:

permissions:
  contents: write
  pages: write
  id-token: write

concurrency:
  group: scan-deploy
  cancel-in-progress: true

jobs:
  scan-and-deploy:
    runs-on: ubuntu-latest
    environment:
      name: github-pages
      url: ${{ steps.deploy.outputs.page_url }}

    steps:
      - uses: actions/checkout@v4
        with:
          token: ${{ secrets.GITHUB_TOKEN }}

      - uses: abdullahbodur/archmap@main
        with:
          github_token: ${{ secrets.ORG_TOKEN }}
          github_org: your-org
          output_path: _site

      - name: Commit updated graph.json
        run: |
          mkdir -p data
          cp _site/graph.json data/graph.json
          git config user.name "archmap-bot"
          git config user.email "archmap-bot@users.noreply.github.com"
          git add data/graph.json
          git diff --cached --quiet || (git commit -m "chore: update graph [$(date -u +%F)]" && git push)

      - uses: actions/configure-pages@v5

      - uses: actions/upload-pages-artifact@v3
        with:
          path: _site

      - id: deploy
        uses: actions/deploy-pages@v4
```

Enable GitHub Pages in the deployment repo under Settings → Pages → Source: GitHub Actions.

## Token requirements

Create a fine-grained personal access token with:

- Resource owner: the organization being scanned
- Repository access: all repositories
- Permissions: `Contents` read/write, `Metadata` read-only, `Pages` read/write

Store it as a repository secret named `ORG_TOKEN`.
