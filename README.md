# ArchMap

ArchMap scans a GitHub organization, extracts service topology from source code without running anything, and serves an interactive architecture graph in the browser.

It reads source files statically — no Docker, no databases, no running services required.

## Language support

| Language | Framework | Status |
|----------|-----------|--------|
| Java | Spring Boot | Supported |
| Kotlin | Spring Boot | Supported |
| Go | — | Planned |
| Python | FastAPI, Django | Planned |
| TypeScript / JavaScript | NestJS, Express | Planned |
| C# | ASP.NET Core | Planned |

## What it produces

- **Service Flow** — which services depend on which, with Kafka topic edges
- **Data Flow** — shared data types (entities, DTOs, events) mapped to the services that produce and consume them
- **Function Flow** — public service methods with cross-service call edges drilled in

## How to use it

| Method | When to use |
|--------|-------------|
| [GitHub Action](docs/github-action.md) | Automate scanning in CI, deploy graph to GitHub Pages |
| [Docker](docs/docker.md) | One-shot scan in any environment |

## Documentation

- [GitHub Action](docs/github-action.md)
- [Docker](docs/docker.md)
- [Configuration reference](docs/configuration.md)
- [Use cases](docs/use-cases.md)
- [Architecture](docs/architecture.md)

## Quick example

```yaml
- uses: abdullahbodur/archmap@main
  with:
    github_token: ${{ secrets.ARCHMAP_TOKEN }}
    github_org: your-org
    output_path: _site
```

The action scans your org, builds the graph, and writes a static site to `_site/` ready for GitHub Pages.
