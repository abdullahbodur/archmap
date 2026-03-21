# Architecture

## Overview

ArchMap is a pnpm monorepo. The scanner package orchestrates everything: it fetches source code, runs analysis, builds graph views, and hands off the result to a deployer.

```
packages/
  scanner/       entry point — fetch, analyze, build, deploy
  analyzer/      static analysis for Spring Boot (Java/Kotlin)
  graph-builder/ produces graph views from analyzed services
  deployers/     writes output to disk or commits via git
  ai/            Claude-powered fallback for non-Spring repos
apps/
  web/           Next.js static app, renders the graph with React Flow
```

## Data flow

```
GitHub API (Octokit)
    |
    | repo list + file contents
    v
Analyzer
    |
    | AnalyzedService[]
    v
Graph Builder
    |
    | GraphData { serviceFlow, dataFlow, functionFlow }
    v
Deployer
    |
    | graph.json written to disk or committed to git
    v
Web (Next.js, built separately)
    reads graph.json at build time via ARCHMAP_DATA_PATH
```

## Scanner

`packages/scanner/src/index.ts`

Entry point. Reads `SCANNER_SOURCE` to decide between GitHub mode and local mode.

**GitHub mode** — uses Octokit to list all repos in the org, reads each repo's files via the contents API, looks for `archmap.yml` at the root for config overrides. Passes file contents to the analyzer.

**Local mode** — walks `SERVICES_DIR`, reads `.java` and `.kt` files from each subdirectory, passes them to the analyzer as if they were a GitHub repo.

After analysis, calls `buildAllViews` from the graph-builder and hands `GraphData` to the configured deployer.

## Analyzer

`packages/analyzer/src/spring/`

Regex-based static analysis. Does not parse ASTs — it runs patterns against raw file content. This makes it fast and language-version-agnostic at the cost of some precision.

| File | Detects |
|------|---------|
| `endpoints.ts` | `@RestController`, mapping annotations, `@RequestBody` types, return types |
| `kafka.ts` | `@KafkaListener`, `KafkaTemplate.send()`, `@SendTo` |
| `clients.ts` | `@FeignClient` interfaces, `RestTemplate`/`WebClient`/`HttpClient` call sites |
| `data-types.ts` | `@Entity`, `@Data`, `@JsonProperty`, Request/Response/Event/Dto suffix classes |
| `functions.ts` | Public service methods that call injected beans |

If static analysis produces no results (e.g. the repo is not a Spring Boot project), the AI package sends a sample of the source to Claude and parses the JSON response as a fallback.

## Graph Builder

`packages/graph-builder/src/views/`

Takes `AnalyzedService[]` and produces three `GraphView` objects, each with `nodes` and `edges`.

**Service Flow** — one node per service. Edges come from `dependsOn`, Feign/RestTemplate calls (resolved to service IDs), and Kafka topic matching (producer service → topic → consumer service).

**Data Flow** — one node per unique data type across all services. Edges connect data type nodes to the services that produce or consume them.

**Function Flow** — one node per service function. Edges represent `callsOut` entries (cross-service calls) detected by the analyzer.

Node positions are calculated with a layout algorithm:
- `gridLayout` — evenly spaced grid, used when no `domain` grouping exists
- `groupedLayout` — clusters nodes by domain, used when at least one service has a `domain` set

## Deployers

`packages/deployers/src/deployers/`

**FilesDeployer** — writes `graph.json` to `OUTPUT_DIR`. Used in Docker and GitHub Action contexts where the caller controls what happens to the file next.

**GitDeployer** — writes `graph.json` and a timestamped snapshot, then runs `git add`, `git commit`, and `git push`. Used in local dev when the scanner is run inside the repository.

## Web

`apps/web/`

Next.js app with `output: "export"` (fully static). Reads `graph.json` at build time via `ARCHMAP_DATA_PATH`. No server-side rendering at runtime — the graph data is embedded at build time.

Renders three tabs using React Flow with custom node types:
- `ServiceNode` — service name, type badge, endpoint count, domain
- `DataTypeNode` — data type name, fields, producer/consumer counts
- `FunctionNode` — method signature, class, outbound call count

Layout is applied once at build time by the graph-builder. React Flow renders positions as-is with pan and zoom enabled.

## Service ID convention

Within a single-repo service: the service ID is the repository name.

Within a monorepo: the service ID is `repoName/serviceName`, declared in `archmap.yml`. Cross-service call resolution uses these IDs to match Feign client names, RestTemplate host patterns, and Kafka topic producers/consumers across repos.
