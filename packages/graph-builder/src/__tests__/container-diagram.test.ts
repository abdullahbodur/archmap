import { describe, it, expect } from "vitest";
import { buildContainerDiagram } from "../views/container-diagram";
import type { AnalyzedService, InfraNode } from "../types";

function makeService(overrides: Partial<AnalyzedService> & { id: string; name: string }): AnalyzedService {
  return {
    repoName: overrides.id,
    repoUrl: `https://github.com/org/${overrides.id}`,
    language: "java",
    summary: "",
    endpoints: [],
    dataTypes: [],
    functions: [],
    dependsOn: [],
    kafkaProducers: [],
    kafkaConsumers: [],
    tags: [],
    ...overrides,
  };
}

function makeInfra(overrides: Partial<InfraNode> & { id: string; name: string; type: InfraNode["type"] }): InfraNode {
  return { ...overrides };
}

describe("buildContainerDiagram", () => {
  it("returns empty graph for no services", () => {
    const { nodes, edges } = buildContainerDiagram([]);
    expect(nodes).toHaveLength(0);
    expect(edges).toHaveLength(0);
  });

  it("creates a service node per service", () => {
    const services = [
      makeService({ id: "order-service", name: "Order Service" }),
      makeService({ id: "inventory-service", name: "Inventory Service" }),
    ];
    const { nodes } = buildContainerDiagram(services);
    const serviceNodes = nodes.filter((n) => n.type === "serviceNode");
    expect(serviceNodes).toHaveLength(2);
  });

  it("creates a group node per domain and sets parentId on service nodes", () => {
    const services = [
      makeService({ id: "a", name: "A", domain: "commerce" }),
      makeService({ id: "b", name: "B", domain: "commerce" }),
    ];
    const { nodes } = buildContainerDiagram(services);
    const groupNode = nodes.find((n) => n.type === "group");
    expect(groupNode).toBeDefined();
    expect(groupNode!.id).toBe("group:commerce");

    const serviceNodes = nodes.filter((n) => n.type === "serviceNode");
    expect(serviceNodes.every((n) => n.parentId === "group:commerce")).toBe(true);
    expect(serviceNodes.every((n) => n.extent === "parent")).toBe(true);
  });

  it("creates separate group nodes for different domains", () => {
    const services = [
      makeService({ id: "a", name: "A", domain: "commerce" }),
      makeService({ id: "b", name: "B", domain: "logistics" }),
    ];
    const { nodes } = buildContainerDiagram(services);
    const groupNodes = nodes.filter((n) => n.type === "group");
    expect(groupNodes).toHaveLength(2);
  });

  it("maps database infra to databaseNode type", () => {
    const infra = makeInfra({ id: "orders-db", name: "Orders DB", type: "database" });
    const services = [makeService({ id: "a", name: "A", infrastructure: [infra] })];
    const { nodes } = buildContainerDiagram(services);
    const dbNode = nodes.find((n) => n.id === "orders-db");
    expect(dbNode?.type).toBe("databaseNode");
  });

  it("maps queue infra to queueNode type", () => {
    const infra = makeInfra({ id: "kafka", name: "Kafka", type: "queue" });
    const services = [makeService({ id: "a", name: "A", infrastructure: [infra] })];
    const { nodes } = buildContainerDiagram(services);
    expect(nodes.find((n) => n.id === "kafka")?.type).toBe("queueNode");
  });

  it("maps cache infra to cacheNode type", () => {
    const infra = makeInfra({ id: "redis", name: "Redis", type: "cache" });
    const services = [makeService({ id: "a", name: "A", infrastructure: [infra] })];
    const { nodes } = buildContainerDiagram(services);
    expect(nodes.find((n) => n.id === "redis")?.type).toBe("cacheNode");
  });

  it("maps external infra to externalNode type", () => {
    const infra = makeInfra({ id: "stripe", name: "Stripe", type: "external" });
    const services = [makeService({ id: "a", name: "A", infrastructure: [infra] })];
    const { nodes } = buildContainerDiagram(services);
    expect(nodes.find((n) => n.id === "stripe")?.type).toBe("externalNode");
  });

  it("deduplicates infra nodes with the same id across services", () => {
    const kafka = makeInfra({ id: "kafka", name: "Kafka", type: "queue" });
    const services = [
      makeService({ id: "a", name: "A", infrastructure: [kafka] }),
      makeService({ id: "b", name: "B", infrastructure: [kafka] }),
    ];
    const { nodes } = buildContainerDiagram(services);
    const kafkaNodes = nodes.filter((n) => n.id === "kafka");
    expect(kafkaNodes).toHaveLength(1);
  });

  it("creates an edge from each service to its infra nodes", () => {
    const db = makeInfra({ id: "orders-db", name: "Orders DB", type: "database" });
    const services = [makeService({ id: "order-service", name: "Order Service", infrastructure: [db] })];
    const { edges } = buildContainerDiagram(services);
    expect(edges).toHaveLength(1);
    expect(edges[0]).toMatchObject({ source: "order-service", target: "orders-db" });
  });

  it("does not duplicate edges when two services share the same infra", () => {
    const kafka = makeInfra({ id: "kafka", name: "Kafka", type: "queue" });
    const services = [
      makeService({ id: "a", name: "A", infrastructure: [kafka] }),
      makeService({ id: "b", name: "B", infrastructure: [kafka] }),
    ];
    const { edges } = buildContainerDiagram(services);
    // Two services, two edges (one per service→kafka) — no duplicate for same pair
    const ids = edges.map((e) => e.id);
    expect(new Set(ids).size).toBe(ids.length);
    expect(edges).toHaveLength(2);
  });

  it("sets markerEnd: arrow on all edges", () => {
    const db = makeInfra({ id: "db", name: "DB", type: "database" });
    const services = [makeService({ id: "a", name: "A", infrastructure: [db] })];
    const { edges } = buildContainerDiagram(services);
    expect(edges.every((e) => e.markerEnd === "arrow")).toBe(true);
  });

  it("sets type: smoothstep on all edges", () => {
    const db = makeInfra({ id: "db", name: "DB", type: "database" });
    const services = [makeService({ id: "a", name: "A", infrastructure: [db] })];
    const { edges } = buildContainerDiagram(services);
    expect(edges.every((e) => e.type === "smoothstep")).toBe(true);
  });

  it("labels database edges 'persists to'", () => {
    const db = makeInfra({ id: "db", name: "DB", type: "database" });
    const services = [makeService({ id: "a", name: "A", infrastructure: [db] })];
    const { edges } = buildContainerDiagram(services);
    expect(edges[0].label).toBe("persists to");
  });

  it("labels queue edges 'publishes to' for pure producers", () => {
    const kafka = makeInfra({ id: "kafka", name: "Kafka", type: "queue" });
    const services = [
      makeService({
        id: "a",
        name: "A",
        infrastructure: [kafka],
        kafkaProducers: [{ topic: "events" }],
        kafkaConsumers: [],
      }),
    ];
    const { edges } = buildContainerDiagram(services);
    expect(edges[0].label).toBe("publishes to");
  });

  it("labels queue edges 'subscribes to' for pure consumers", () => {
    const kafka = makeInfra({ id: "kafka", name: "Kafka", type: "queue" });
    const services = [
      makeService({
        id: "a",
        name: "A",
        infrastructure: [kafka],
        kafkaProducers: [],
        kafkaConsumers: [{ topics: ["events"], handlerMethod: "handle" }],
      }),
    ];
    const { edges } = buildContainerDiagram(services);
    expect(edges[0].label).toBe("subscribes to");
  });

  it("labels queue edges 'uses' for both producer and consumer", () => {
    const kafka = makeInfra({ id: "kafka", name: "Kafka", type: "queue" });
    const services = [
      makeService({
        id: "a",
        name: "A",
        infrastructure: [kafka],
        kafkaProducers: [{ topic: "events" }],
        kafkaConsumers: [{ topics: ["other"], handlerMethod: "handle" }],
      }),
    ];
    const { edges } = buildContainerDiagram(services);
    expect(edges[0].label).toBe("uses");
  });

  it("labels cache edges 'caches via'", () => {
    const redis = makeInfra({ id: "redis", name: "Redis", type: "cache" });
    const services = [makeService({ id: "a", name: "A", infrastructure: [redis] })];
    const { edges } = buildContainerDiagram(services);
    expect(edges[0].label).toBe("caches via");
  });

  it("labels external edges 'calls'", () => {
    const stripe = makeInfra({ id: "stripe", name: "Stripe", type: "external" });
    const services = [makeService({ id: "a", name: "A", infrastructure: [stripe] })];
    const { edges } = buildContainerDiagram(services);
    expect(edges[0].label).toBe("calls");
  });
});
