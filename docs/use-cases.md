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
