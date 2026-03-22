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
  // ── Node creation ────────────────────────────────────────────────────────

  it("returns empty graph when no services have data types", () => {
    const { nodes, edges } = buildDataFlow([makeService({ id: "a", name: "A" })]);
    expect(nodes).toHaveLength(0);
    expect(edges).toHaveLength(0);
  });

  it("creates one node per unique data type with dt: prefix", () => {
    const services = [
      makeService({
        id: "a", name: "A",
        dataTypes: [{ name: "OrderDto", fields: [], producedBy: ["a"], consumedBy: [] }],
      }),
      makeService({
        id: "b", name: "B",
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
        id: "a", name: "A",
        dataTypes: [{ name: "OrderDto", fields: [], producedBy: ["a"], consumedBy: [] }],
      }),
      makeService({
        id: "b", name: "B",
        dataTypes: [{ name: "OrderDto", fields: [], producedBy: [], consumedBy: ["b"] }],
      }),
    ];
    const { nodes } = buildDataFlow(services);
    expect(nodes).toHaveLength(1);
  });

  it("merges producedBy and consumedBy for same-name types", () => {
    const services = [
      makeService({
        id: "a", name: "A",
        dataTypes: [{ name: "OrderDto", fields: [], producedBy: ["a"], consumedBy: [] }],
      }),
      makeService({
        id: "b", name: "B",
        dataTypes: [{ name: "OrderDto", fields: [], producedBy: [], consumedBy: ["b"] }],
      }),
    ];
    const { nodes } = buildDataFlow(services);
    expect(nodes[0].data.producedBy).toContain("a");
    expect(nodes[0].data.consumedBy).toContain("b");
  });

  // ── Type-reference edges ─────────────────────────────────────────────────

  it("creates no edges when no field types reference another known DTO", () => {
    const services = [
      makeService({
        id: "a", name: "A",
        dataTypes: [
          {
            name: "OrderDto",
            fields: [{ name: "id", type: "UUID" }, { name: "total", type: "BigDecimal" }],
            producedBy: ["a"], consumedBy: [],
          },
        ],
      }),
    ];
    const { edges } = buildDataFlow(services);
    expect(edges).toHaveLength(0);
  });

  it("creates an edge when a field type matches another known DTO", () => {
    const services = [
      makeService({
        id: "a", name: "A",
        dataTypes: [
          {
            name: "OrderDto",
            fields: [{ name: "status", type: "OrderStatus" }],
            producedBy: ["a"], consumedBy: [],
          },
          {
            name: "OrderStatus",
            fields: [{ name: "PENDING", type: "enum constant" }],
            producedBy: ["a"], consumedBy: [],
          },
        ],
      }),
    ];
    const { edges } = buildDataFlow(services);
    expect(edges).toHaveLength(1);
    expect(edges[0]).toMatchObject({ source: "dt:OrderDto", target: "dt:OrderStatus" });
  });

  it("uses the field name as the edge label", () => {
    const services = [
      makeService({
        id: "a", name: "A",
        dataTypes: [
          {
            name: "ReservationResult",
            fields: [{ name: "status", type: "ReservationStatus" }],
            producedBy: ["a"], consumedBy: [],
          },
          {
            name: "ReservationStatus",
            fields: [{ name: "RESERVED", type: "enum constant" }],
            producedBy: ["a"], consumedBy: [],
          },
        ],
      }),
    ];
    const { edges } = buildDataFlow(services);
    expect(edges[0].label).toBe("status");
  });

  it("sets markerEnd: arrow on edges", () => {
    const services = [
      makeService({
        id: "a", name: "A",
        dataTypes: [
          {
            name: "OrderDto",
            fields: [{ name: "item", type: "OrderItem" }],
            producedBy: ["a"], consumedBy: [],
          },
          { name: "OrderItem", fields: [], producedBy: ["a"], consumedBy: [] },
        ],
      }),
    ];
    const { edges } = buildDataFlow(services);
    expect(edges[0].markerEnd).toBe("arrow");
  });

  it("strips generics: List<OrderItem> resolves to OrderItem", () => {
    const services = [
      makeService({
        id: "a", name: "A",
        dataTypes: [
          {
            name: "OrderDto",
            fields: [{ name: "items", type: "List<OrderItem>" }],
            producedBy: ["a"], consumedBy: [],
          },
          { name: "OrderItem", fields: [], producedBy: ["a"], consumedBy: [] },
        ],
      }),
    ];
    const { edges } = buildDataFlow(services);
    expect(edges).toHaveLength(1);
    expect(edges[0]).toMatchObject({ source: "dt:OrderDto", target: "dt:OrderItem" });
  });

  it("does not create self-loop edges", () => {
    const services = [
      makeService({
        id: "a", name: "A",
        dataTypes: [
          {
            name: "Node",
            fields: [{ name: "parent", type: "Node" }],
            producedBy: ["a"], consumedBy: [],
          },
        ],
      }),
    ];
    const { edges } = buildDataFlow(services);
    expect(edges).toHaveLength(0);
  });

  it("deduplicates edges when multiple fields point to the same type", () => {
    const services = [
      makeService({
        id: "a", name: "A",
        dataTypes: [
          {
            name: "OrderDto",
            fields: [
              { name: "currentStatus", type: "OrderStatus" },
              { name: "previousStatus", type: "OrderStatus" },
            ],
            producedBy: ["a"], consumedBy: [],
          },
          { name: "OrderStatus", fields: [], producedBy: ["a"], consumedBy: [] },
        ],
      }),
    ];
    const { edges } = buildDataFlow(services);
    expect(edges).toHaveLength(1);
  });

  it("does not create edges for primitive field types", () => {
    const services = [
      makeService({
        id: "a", name: "A",
        dataTypes: [
          {
            name: "OrderDto",
            fields: [
              { name: "id", type: "String" },
              { name: "qty", type: "Integer" },
              { name: "active", type: "Boolean" },
            ],
            producedBy: ["a"], consumedBy: [],
          },
        ],
      }),
    ];
    const { edges } = buildDataFlow(services);
    expect(edges).toHaveLength(0);
  });
});
