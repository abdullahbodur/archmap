# Configuration Reference

For a working end-to-end example see [github.com/docktail/archmap](https://github.com/docktail/archmap) — the `services/` directory contains Order Service and Inventory Service with annotated `archmap.yml` files and infrastructure ref files.

## archmap.yml

Place an `archmap.yml` file in the root of any repository to control how ArchMap treats it during a scan.

```yaml
# archmap.yml
name: Payment Service          # display name (defaults to repo name)
description: Handles checkout  # short description shown in the graph
type: service                  # service | library | tool | infra
domain: payments               # groups services visually by domain
depends_on:
  - inventory-service          # explicit dependency edges
  - notification-service
tags:
  - critical
  - pci
skip: false                    # set to true to exclude this repo entirely
infrastructure:
  - id: payments-db
    ref: ./infra/postgres-archmap.yml   # same-repo ref
  - id: stripe
    name: Stripe API
    type: external
    description: Payment processing API
```

### Fields

| Field | Type | Description |
|-------|------|-------------|
| `name` | string | Display name in the graph. Defaults to the repository name. |
| `description` | string | Short description shown on the service node. |
| `type` | string | One of `service`, `library`, `tool`, `infra`. Used for node styling. |
| `domain` | string | Groups services into a visual cluster. Services with the same domain are placed together. |
| `depends_on` | string[] | Explicit dependency edges to other services, by repo name. Supplements auto-detected dependencies. |
| `tags` | string[] | Arbitrary labels. Currently stored on the service record; available for future filtering. |
| `skip` | boolean | If `true`, the repo is excluded from the scan entirely. |
| `infrastructure` | InfraNode[] | Infrastructure dependencies (databases, queues, caches, external APIs) shown in the Container Diagram. |

### infrastructure — InfraNode fields

Each entry under `infrastructure` declares one infrastructure dependency. Fields can be set inline or loaded from a ref file.

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `id` | string | Yes | Unique identifier. Nodes with the same `id` across services are deduplicated into one node in the Container Diagram. |
| `name` | string | Yes* | Display name on the node. Can be omitted if provided by the ref file. |
| `type` | string | Yes* | One of `database`, `queue`, `cache`, `external`. Controls node shape and edge label. Can be omitted if provided by the ref file. |
| `technology` | string | No | Technology name shown on the node (e.g. `PostgreSQL 14`, `Apache Kafka`). |
| `description` | string | No | Short description shown on the node. |
| `ref` | string | No | Path to an archmap-format YAML file that provides the full node definition. Inline fields take priority over the ref file. |

### ref file format

A ref file is a standalone YAML file that carries the full infrastructure node definition. This lets multiple services reference one shared definition without repeating it.

```yaml
# infra/postgres-archmap.yml
id: orders-db
name: Orders DB
type: database
technology: PostgreSQL 14
description: Primary relational store for order records
```

**Ref path formats:**

| Format | Resolved during | Example |
|--------|----------------|---------|
| `./path.yml` | Local scan and GitHub scan (same repo) | `./infra/postgres-archmap.yml` |
| `repo/path.yml` | GitHub scan only | `shared-infra/redis-archmap.yml` |
| `repo/path.yml?ref=tag` | GitHub scan only | `shared-infra/kafka-archmap.yml?ref=v2` |

Local scan skips cross-repo refs and logs a warning. If a ref cannot be resolved, the scanner falls back to whatever fields were declared inline.

## Graph views

ArchMap produces four graph views from a single scan:

### Service Flow

Nodes are services. Edges represent:
- `depends_on` declarations from `archmap.yml`
- Feign client and RestTemplate/WebClient calls detected in source code
- Kafka producer/consumer relationships (service A produces to topic X, service B consumes from topic X)

All edges have directed arrowheads so dependency direction is unambiguous.

### Data Flow

Nodes are data types (entities, DTOs, request/response classes, events). Edges connect data types to the services that produce or consume them. Useful for tracing where a shared data contract is defined and who uses it.

### Function Flow

Nodes are public service-layer methods. Edges represent cross-service calls detected in source code — when one service method calls another service bean's method. Useful for drilling into call chains within a service.

### Container Diagram

A C4-style container view showing services and their infrastructure dependencies together. Services are grouped into domain boundary boxes. Infrastructure nodes use distinct shapes:

| Node type | Shape | Edge label |
|-----------|-------|------------|
| `database` | Cyan cylinder | `persists to` |
| `queue` | Purple parallel lines | `publishes to` / `subscribes to` / `uses` |
| `cache` | Amber box | `caches via` |
| `external` | Gray dashed box | `calls` |

Infrastructure nodes with the same `id` across multiple services are deduplicated — a shared Kafka cluster appears as a single node with edges from every service that uses it.

## What the analyzer detects

The static analyzer extracts the following from `.java` and `.kt` files:

| Construct | How detected |
|-----------|-------------|
| REST endpoints | `@RestController`, `@GetMapping`, `@PostMapping`, `@PutMapping`, `@DeleteMapping`, `@PatchMapping`, class-level `@RequestMapping` |
| Kafka producers | `KafkaTemplate.send()`, `@SendTo` |
| Kafka consumers | `@KafkaListener` |
| Feign clients | `@FeignClient` interface declarations |
| HTTP clients | `RestTemplate`, `WebClient`, `HttpClient` call sites |
| Data types | `@Entity`, `@Data`, classes with `@JsonProperty`, classes suffixed with `Request`, `Response`, `Event`, `Dto` |
| Service functions | Public methods on `@Service` or `@Component` beans that call injected beans |

## Monorepo services

If a single repository contains multiple services, give each service a unique ID using the slash convention in `archmap.yml`:

```yaml
# In repo "platform-services", subdirectory "auth-service"
name: platform-services/auth-service
```

The scanner will create separate nodes for `platform-services/auth-service` and `platform-services/billing-service` even though they share a repository.
