# Configuration Reference

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

## Graph views

ArchMap produces three graph views from a single scan:

### Service Flow

Nodes are services. Edges represent:
- `depends_on` declarations from `archmap.yml`
- Feign client and RestTemplate/WebClient calls detected in source code
- Kafka producer/consumer relationships (service A produces to topic X, service B consumes from topic X)

### Data Flow

Nodes are data types (entities, DTOs, request/response classes, events). Edges connect data types to the services that produce or consume them. Useful for tracing where a shared data contract is defined and who uses it.

### Function Flow

Nodes are public service-layer methods. Edges represent cross-service calls detected in source code — when one service method calls another service bean's method. Useful for drilling into call chains within a service.

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
