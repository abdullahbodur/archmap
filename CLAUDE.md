# ArchMap

AI-powered GitHub organization architecture scanner and visualizer. Scans all repos in an org, extracts service topology (endpoints, data types, functions, Kafka flows, cross-service calls), builds graph views, and serves them in a Next.js React Flow UI.

## Monorepo Structure

```
packages/
  scanner/        – entry point; orchestrates GitHub fetch → analyze → build → deploy
  analyzer/       – static analysis for Spring Boot (Java/Kotlin) repos
  ai/             – Claude-powered fallback analyzer for non-Spring repos
  graph-builder/  – builds service-flow, data-flow, function-flow graph views
  deployers/      – writes output: "files" (write to disk) or "git" (commit & push)
apps/
  web/            – Next.js static app; reads graph.json and renders React Flow graphs
data/
  snapshots/      – timestamped graph.json history
```

Package manager: **pnpm** with workspaces. Build orchestrator: **Turbo**.

## Data Flow

1. **Scanner** (`@archmap/scanner`) — fetches repo list from GitHub org via `@octokit/rest`, reads `archmap.yml` from each repo root for config overrides (`name`, `description`, `skip`, `type`, `domain`, `depends_on`, `tags`).
2. **Analyzer** (`@archmap/analyzer`) — static regex-based extraction from `.java`/`.kt` files: endpoints, Kafka producers/consumers, Feign clients, RestTemplate/WebClient calls, data types (entities/DTOs), functions.
3. **AI fallback** (`@archmap/ai`) — if static analysis yields nothing, sends a code sample to `claude-sonnet-4-6` and parses JSON response.
4. **Graph Builder** (`@archmap/graph-builder`) — produces three `GraphView` objects (nodes + edges):
   - `serviceFlow` — services as nodes; `dependsOn` and Kafka topic edges
   - `dataFlow` — data type nodes linked to producer/consumer services
   - `functionFlow` — function nodes with cross-service call edges
5. **Deployers** (`@archmap/deployers`) — writes `graph.json` + snapshot. Two deployer types: `files` (local write) and `git` (commit + push).
6. **Web** (`@archmap/web`) — Next.js app reads `graph.json` at build time via `ARCHMAP_DATA_PATH` env var; displays in React Flow with three tabs.

## Key Types

- `AnalyzedService` — the canonical service record (id, name, repoName, repoUrl, language, summary, endpoints, dataTypes, functions, dependsOn, kafkaProducers, kafkaConsumers, type, domain, tags)
- `GraphData` — top-level output: `{ generatedAt, meta, services[], views: { serviceFlow, dataFlow, functionFlow } }`
- `GraphView` — `{ nodes: ViewNode[], edges: ViewEdge[] }`
- `RepoConfig` — parsed from `archmap.yml` in each repo

## Service ID Convention

- Single-service repo: `"<repoName>"`
- Monorepo sub-service: `"<repoName>/<serviceName>"`

## Commands

```bash
# Install
pnpm install

# Build all packages (required before scan)
pnpm build --filter @archmap/analyzer --filter @archmap/graph-builder --filter @archmap/deployers

# Run the scanner (needs env vars)
GITHUB_TOKEN=... GITHUB_ORG=... pnpm --filter @archmap/scanner scan

# Run web dev server
pnpm --filter @archmap/web dev

# Build web for static export
ARCHMAP_DATA_PATH=./data/graph.json pnpm --filter @archmap/web build
```

## Environment Variables

| Variable | Required | Purpose |
|---|---|---|
| `GITHUB_TOKEN` | Yes | GitHub PAT with org read access |
| `GITHUB_ORG` | Yes | GitHub org name to scan |
| `ANTHROPIC_API_KEY` | Optional | Enables AI fallback analyzer |
| `DEPLOYER` | Optional | `"git"` or `"files"` (default: `"git"`) |
| `OUTPUT_DIR` | Optional | Output directory for `files` deployer |
| `ARCHMAP_DATA_PATH` | Build-time | Path to `graph.json` for Next.js build |

## Analyzer Details

The Spring Boot static analyzer (`packages/analyzer/src/spring/`) uses regex against raw file content:

- `endpoints.ts` — detects `@RestController`/`@Controller`, maps `@GetMapping`/`@PostMapping`/etc., resolves class-level `@RequestMapping` base path, extracts `@RequestBody` input types and return types
- `kafka.ts` — detects `@KafkaListener` consumers and `KafkaTemplate.send()`/`@SendTo` producers
- `clients.ts` — detects `@FeignClient` declarations and `RestTemplate`/`WebClient`/`HttpClient` call-sites
- `data-types.ts` — detects `@Entity`, `@Data`, `@JsonProperty`, request/response suffix classes
- `functions.ts` — detects public service/component methods that call other service beans

## Graph Layout

- `gridLayout` — evenly spaced grid, used when no `domain` grouping exists
- `groupedLayout` — groups nodes by `domain` field, clusters within each group

## GitHub Action

`action.yml` defines a composite action. Usage in consuming repos:

```yaml
- uses: your-org/archmap@main
  with:
    github_token: ${{ secrets.GITHUB_TOKEN }}
    github_org: my-org
    output_path: archmap-out
```

The daily scan workflow (`.github/workflows/daily-scan.yml`) runs at 2am UTC.

## Adding New Language Analyzers

1. Create `packages/analyzer/src/<language>/index.ts` exporting an `analyze<Language>(input: AnalyzerInput): AnalyzerResult` function
2. Add language detection in `packages/analyzer/src/spring/index.ts` (or create a router)
3. Wire into the scanner's per-repo analysis step
4. The `@archmap/ai` package serves as the fallback for any unrecognized language

## Web UI

- Three tabs: **Service Flow**, **Data Flow**, **Function Flow**
- Custom React Flow node types: `ServiceNode`, `DataTypeNode`, `FunctionNode`
- Graph data loaded server-side at build time (static export via `next export`)
- Empty-state handled when `graph.json` is missing or empty
