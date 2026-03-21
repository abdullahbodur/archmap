# Docker

The ArchMap scanner is available as a Docker image. It scans a GitHub org (or a local directory) and writes `graph.json` to a mounted volume.

## GitHub org scan

```bash
docker run --rm \
  -e ORG_TOKEN=ghp_... \
  -e GITHUB_ORG=your-org \
  -e DEPLOYER=files \
  -v $(pwd)/data:/data \
  ghcr.io/abdullahbodur/archmap:latest
```

Output is written to `./data/graph.json`.

## Local directory scan

Mount a directory of service source trees and set `SCANNER_SOURCE=local`:

```bash
docker run --rm \
  -e SCANNER_SOURCE=local \
  -e SERVICES_DIR=/services \
  -e DEPLOYER=files \
  -v $(pwd)/services:/services:ro \
  -v $(pwd)/data:/data \
  ghcr.io/abdullahbodur/archmap:latest
```

Each subdirectory of `/services` is treated as a separate service.

## Environment variables

| Variable | Default | Description |
|----------|---------|-------------|
| `ORG_TOKEN` | — | Required for GitHub org scan |
| `GITHUB_ORG` | — | Organization to scan |
| `SCANNER_SOURCE` | `github` | `github` or `local` |
| `SERVICES_DIR` | `/services` | Root dir for local scan |
| `DEPLOYER` | `files` | Always use `files` with Docker |
| `OUTPUT_DIR` | `/data` | Write path inside the container |

## Building the image locally

```bash
docker build -t archmap .
```
