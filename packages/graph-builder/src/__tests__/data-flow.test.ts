import { describe, it, expect } from "vitest";
import { buildDataFlow } from "../views/data-flow";
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

describe("buildDataFlow", () => {
  it("returns empty graph when no services have data types", () => {
    const { nodes, edges } = buildDataFlow([makeService({ id: "a", name: "A" })]);
    expect(nodes).toHaveLength(0);
    expect(edges).toHaveLength(0);
  });

  it("creates one node per unique data type", () => {
    const services = [
      makeService({
        id: "a",
        name: "A",
        dataTypes: [{ name: "OrderDto", fields: [], producedBy: ["a"], consumedBy: [] }],
      }),
      makeService({
        id: "b",
        name: "B",
        dataTypes: [{ name: "UserDto", fields: [], producedBy: ["b"], consumedBy: [] }],
      }),
    ];
    const { nodes } = buildDataFlow(services);
    expect(nodes).toHaveLength(2);
    expect(nodes.map((n) => n.id)).toEqual(expect.arrayContaining(["dt:OrderDto", "dt:UserDto"]));
  });

  it("deduplicates data types with the same name across services", () => {
    const services = [
      makeService({
        id: "a",
        name: "A",
        dataTypes: [{ name: "OrderDto", fields: [], producedBy: ["a"], consumedBy: [] }],
      }),
      makeService({
        id: "b",
        name: "B",
        dataTypes: [{ name: "OrderDto", fields: [], producedBy: [], consumedBy: ["b"] }],
      }),
    ];
    const { nodes } = buildDataFlow(services);
    expect(nodes).toHaveLength(1);
  });

  it("merges producedBy and consumedBy for same-name types", () => {
    const services = [
      makeService({
        id: "a",
        name: "A",
        dataTypes: [{ name: "OrderDto", fields: [], producedBy: ["a"], consumedBy: [] }],
      }),
      makeService({
        id: "b",
        name: "B",
        dataTypes: [{ name: "OrderDto", fields: [], producedBy: [], consumedBy: ["b"] }],
      }),
    ];
    const { nodes } = buildDataFlow(services);
    const node = nodes[0];
    expect(node.data.producedBy).toContain("a");
    expect(node.data.consumedBy).toContain("b");
  });

  it("creates an edge between producer and consumer service", () => {
    const services = [
      makeService({
        id: "a",
        name: "A",
        dataTypes: [{ name: "OrderDto", fields: [], producedBy: ["a"], consumedBy: [] }],
      }),
      makeService({
        id: "b",
        name: "B",
        dataTypes: [{ name: "OrderDto", fields: [], producedBy: [], consumedBy: ["b"] }],
      }),
    ];
    const { edges } = buildDataFlow(services);
    expect(edges).toHaveLength(1);
    expect(edges[0]).toMatchObject({ source: "a", target: "b" });
  });

  it("sets markerEnd: arrow on edges", () => {
    const services = [
      makeService({
        id: "a",
        name: "A",
        dataTypes: [{ name: "OrderDto", fields: [], producedBy: ["a"], consumedBy: [] }],
      }),
      makeService({
        id: "b",
        name: "B",
        dataTypes: [{ name: "OrderDto", fields: [], producedBy: [], consumedBy: ["b"] }],
      }),
    ];
    const { edges } = buildDataFlow(services);
    expect(edges[0].markerEnd).toBe("arrow");
  });

  it("does not create self-loop edges", () => {
    const services = [
      makeService({
        id: "a",
        name: "A",
        dataTypes: [{ name: "OrderDto", fields: [], producedBy: ["a"], consumedBy: ["a"] }],
      }),
    ];
    const { edges } = buildDataFlow(services);
    expect(edges).toHaveLength(0);
  });

  it("consolidates multiple shared types into one edge with a label", () => {
    const services = [
      makeService({
        id: "a",
        name: "A",
        dataTypes: [
          { name: "TypeOne", fields: [], producedBy: ["a"], consumedBy: [] },
          { name: "TypeTwo", fields: [], producedBy: ["a"], consumedBy: [] },
        ],
      }),
      makeService({
        id: "b",
        name: "B",
        dataTypes: [
          { name: "TypeOne", fields: [], producedBy: [], consumedBy: ["b"] },
          { name: "TypeTwo", fields: [], producedBy: [], consumedBy: ["b"] },
        ],
      }),
    ];
    const { edges } = buildDataFlow(services);
    expect(edges).toHaveLength(1);
    expect(edges[0].label).toContain("TypeOne");
    expect(edges[0].label).toContain("TypeTwo");
  });
});
