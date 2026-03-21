import { describe, it, expect } from "vitest";
import { buildServiceFlow } from "../views/service-flow";
import type { AnalyzedService } from "../types";

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

describe("buildServiceFlow", () => {
  it("produces one node per service", () => {
    const services = [
      makeService({ id: "order-service", name: "Order Service" }),
      makeService({ id: "inventory-service", name: "Inventory Service" }),
    ];
    const { nodes } = buildServiceFlow(services);
    expect(nodes).toHaveLength(2);
    expect(nodes.map((n) => n.id)).toEqual(expect.arrayContaining(["order-service", "inventory-service"]));
  });

  it("produces edges from dependsOn", () => {
    const services = [
      makeService({ id: "order-service", name: "Order Service", dependsOn: ["inventory-service"] }),
      makeService({ id: "inventory-service", name: "Inventory Service" }),
    ];
    const { edges } = buildServiceFlow(services);
    expect(edges).toHaveLength(1);
    expect(edges[0]).toMatchObject({
      source: "order-service",
      target: "inventory-service",
      label: "calls",
    });
  });

  it("produces kafka edges when producer and consumer share a topic", () => {
    const services = [
      makeService({
        id: "order-service",
        name: "Order Service",
        kafkaProducers: [{ topic: "order-events" }],
      }),
      makeService({
        id: "inventory-service",
        name: "Inventory Service",
        kafkaConsumers: [{ topics: ["order-events"], handlerMethod: "handle" }],
      }),
    ];
    const { edges } = buildServiceFlow(services);
    const kafkaEdge = edges.find((e) => e.label === "order-events");
    expect(kafkaEdge).toMatchObject({
      source: "order-service",
      target: "inventory-service",
    });
  });

  it("does not produce self-loop kafka edges", () => {
    const services = [
      makeService({
        id: "order-service",
        name: "Order Service",
        kafkaProducers: [{ topic: "order-events" }],
        kafkaConsumers: [{ topics: ["order-events"], handlerMethod: "handle" }],
      }),
    ];
    const { edges } = buildServiceFlow(services);
    expect(edges.every((e) => e.source !== e.target)).toBe(true);
  });

  it("does not produce duplicate edges", () => {
    const services = [
      makeService({ id: "a", name: "A", dependsOn: ["b"] }),
      makeService({ id: "b", name: "B" }),
    ];
    const { edges } = buildServiceFlow(services);
    const ids = edges.map((e) => e.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("uses groupedLayout when services have domains", () => {
    const services = [
      makeService({ id: "a", name: "A", domain: "payments" }),
      makeService({ id: "b", name: "B", domain: "orders" }),
    ];
    const { nodes } = buildServiceFlow(services);
    // Both nodes should have valid positions assigned
    expect(nodes.every((n) => typeof n.position.x === "number" && typeof n.position.y === "number")).toBe(true);
  });
});
