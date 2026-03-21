# Use Cases

## Onboarding new engineers

A new team member joins and needs to understand how 30 microservices fit together. Instead of reading through README files or asking senior engineers to draw diagrams on a whiteboard, they open the ArchMap graph.

The Service Flow view shows which services call which. The Data Flow view shows where shared contracts like `OrderCreatedEvent` are defined and which services depend on them. The Function Flow view drills into a specific service to trace what happens inside a request.

Because ArchMap reads source code directly and runs daily, the graph reflects the current state of the codebase rather than a diagram someone drew six months ago.

## Impact analysis before a change

A team wants to change the schema of `OrderCreatedEvent`. Before touching any code, they open the Data Flow view and find every service node connected to that event. They now have a concrete list of services to check, test, and coordinate with before the change ships.

The same applies to API changes. The Service Flow view shows all inbound callers of a service, making it straightforward to identify who breaks when an endpoint changes.

## Finding undocumented dependencies

Static analysis often surfaces dependencies that were never documented. A service might be calling another service's endpoint through a hardcoded RestTemplate URL, bypassing any service registry or declared dependency. ArchMap picks these up and adds them as edges in the graph.

Teams have used this to discover circular dependencies, unexpected coupling between domains, and services consuming Kafka topics they were not supposed to be aware of.

## Architecture review

During architecture review or design sessions, teams use the Service Flow view to verify that proposed domain boundaries are reflected in the actual code. If the payments domain has edges crossing into the user management domain that should not exist, those edges are visible immediately.

The `domain` field in `archmap.yml` groups services into visual clusters, making domain boundary violations obvious at a glance.

## Keeping documentation current

Traditional architecture diagrams go stale. The diagram is accurate the day it is drawn and progressively wrong thereafter.

ArchMap generates the graph from source code on a schedule. The graph is always derived from the actual code, not from someone's memory of the code. Teams use it as their primary architecture documentation, with the daily deploy ensuring it reflects whatever was merged since the last run.

## Incident investigation

During an incident, the first question is often "what calls this service?" or "what does this service call?". The Service Flow graph answers both immediately. Engineers can trace the blast radius of a failing service or identify which upstream caller is sending unexpected traffic.

---

## Example organization: Commerce domain

The `services/` directory in this repo contains a working two-service example that demonstrates the core features of ArchMap.

### Services

**Order Service** (`services/order-service`)

Accepts order creation requests via REST, persists records to PostgreSQL, and publishes `order.created` events to Kafka.

```yaml
# services/order-service/archmap.yml
name: Order Service
type: service
domain: commerce
tags: [rest, kafka-producer, postgres, critical]
infrastructure:
  - id: orders-db
    ref: ./infra/postgres-archmap.yml
  - id: kafka
    ref: ./infra/kafka-archmap.yml
```

**Inventory Service** (`services/inventory-service`)

Consumes `order.created` events from Kafka and reserves stock in PostgreSQL.

```yaml
# services/inventory-service/archmap.yml
name: Inventory Service
type: service
domain: commerce
tags: [kafka-consumer, postgres]
depends_on:
  - order-service
infrastructure:
  - id: inventory-db
    ref: ./infra/postgres-archmap.yml
  - id: kafka
    ref: ./infra/kafka-archmap.yml
```

### Infrastructure ref files

Each service declares its infrastructure via ref files under `infra/`:

```
services/
  order-service/
    infra/
      postgres-archmap.yml   # id: orders-db, type: database
      kafka-archmap.yml      # id: kafka, type: queue
  inventory-service/
    infra/
      postgres-archmap.yml   # id: inventory-db, type: database
      kafka-archmap.yml      # id: kafka, type: queue  (same id — deduped in graph)
```

Both services reference `id: kafka` in their Kafka ref file. The Container Diagram deduplicates this into a single Kafka node with edges from both services.

### Running the example locally

```bash
# From the archmap/ directory
pnpm build --filter @archmap/analyzer --filter @archmap/graph-builder --filter @archmap/deployers

SCANNER_SOURCE=local \
SERVICES_DIR=../services \
DEPLOYER=files \
OUTPUT_DIR=./data \
pnpm --filter @archmap/scanner scan

ARCHMAP_DATA_PATH=./data/graph.json pnpm --filter @archmap/web dev
```

Open `http://localhost:3000` and switch to the **Container** tab to see:
- A `commerce` domain boundary box containing both services
- `Orders DB` and `Inventory DB` as database nodes (cyan cylinder)
- A single shared `Apache Kafka` queue node (purple)
- Directed edges labeled `persists to` and `subscribes to`
