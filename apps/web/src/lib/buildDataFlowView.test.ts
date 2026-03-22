import { describe, it, expect } from "vitest";
import { buildDataFlowView } from "./buildDataFlowView";
import type { AnalyzedService } from "@/types/graph";

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

describe("buildDataFlowView", () => {
  // ── Nodes ────────────────────────────────────────────────────────────────

  it("returns empty nodes and edges for services with no data types", () => {
    const { nodes, edges } = buildDataFlowView([makeService({ id: "a", name: "A" })]);
    expect(nodes).toHaveLength(0);
    expect(edges).toHaveLength(0);
  });

  it("creates a node with dt: prefix for each unique data type", () => {
    const services = [
      makeService({
        id: "a", name: "A",
        dataTypes: [{ name: "OrderDto", fields: [], producedBy: ["a"], consumedBy: [] }],
      }),
    ];
    const { nodes } = buildDataFlowView(services);
    expect(nodes).toHaveLength(1);
    expect(nodes[0].id).toBe("dt:OrderDto");
    expect(nodes[0].type).toBe("dataTypeNode");
  });

  it("deduplicates data types with the same name across services", () => {
    const services = [
      makeService({
        id: "a", name: "A",
        dataTypes: [{ name: "SharedEvent", fields: [], producedBy: ["a"], consumedBy: [] }],
      }),
      makeService({
        id: "b", name: "B",
        dataTypes: [{ name: "SharedEvent", fields: [], producedBy: [], consumedBy: ["b"] }],
      }),
    ];
    const { nodes } = buildDataFlowView(services);
    expect(nodes).toHaveLength(1);
  });

  it("marks enum nodes with isEnum: true", () => {
    const services = [
      makeService({
        id: "a", name: "A",
        dataTypes: [
          {
            name: "OrderStatus",
            fields: [
              { name: "PENDING", type: "enum constant" },
              { name: "SHIPPED", type: "enum constant" },
            ],
            producedBy: ["a"], consumedBy: [],
          },
        ],
      }),
    ];
    const { nodes } = buildDataFlowView(services);
    expect(nodes[0].data.isEnum).toBe(true);
  });

  it("marks non-enum DTOs with isEnum: false", () => {
    const services = [
      makeService({
        id: "a", name: "A",
        dataTypes: [
          {
            name: "OrderDto",
            fields: [{ name: "id", type: "UUID" }],
            producedBy: ["a"], consumedBy: [],
          },
        ],
      }),
    ];
    const { nodes } = buildDataFlowView(services);
    expect(nodes[0].data.isEnum).toBe(false);
  });

  it("assigns serviceId from producer first, then consumer", () => {
    const services = [
      makeService({
        id: "producer-svc", name: "Producer",
        dataTypes: [{ name: "EventDto", fields: [], producedBy: ["producer-svc"], consumedBy: ["consumer-svc"] }],
      }),
    ];
    const { nodes } = buildDataFlowView(services);
    expect(nodes[0].data.serviceId).toBe("producer-svc");
  });

  it("assigns serviceId from consumer when no producer", () => {
    const services = [
      makeService({
        id: "consumer-svc", name: "Consumer",
        dataTypes: [{ name: "InboundDto", fields: [], producedBy: [], consumedBy: ["consumer-svc"] }],
      }),
    ];
    const { nodes } = buildDataFlowView(services);
    expect(nodes[0].data.serviceId).toBe("consumer-svc");
  });

  it("positions nodes with non-negative x and y", () => {
    const services = [
      makeService({
        id: "a", name: "A",
        dataTypes: [
          { name: "A1", fields: [], producedBy: ["a"], consumedBy: [] },
          { name: "A2", fields: [], producedBy: ["a"], consumedBy: [] },
          { name: "A3", fields: [], producedBy: ["a"], consumedBy: [] },
          { name: "A4", fields: [], producedBy: ["a"], consumedBy: [] },
          { name: "A5", fields: [], producedBy: ["a"], consumedBy: [] },
        ],
      }),
    ];
    const { nodes } = buildDataFlowView(services);
    for (const n of nodes) {
      expect(n.position.x).toBeGreaterThanOrEqual(0);
      expect(n.position.y).toBeGreaterThanOrEqual(0);
    }
  });

  it("wraps nodes into 4 columns (5th node starts a new row)", () => {
    const dts = Array.from({ length: 5 }, (_, i) => ({
      name: `Dto${i}`,
      fields: [],
      producedBy: ["a"],
      consumedBy: [],
    }));
    const services = [makeService({ id: "a", name: "A", dataTypes: dts })];
    const { nodes } = buildDataFlowView(services);
    // First 4 nodes share the same y (row 0); 5th node is in row 1 (higher y)
    const row0Y = nodes[0].position.y;
    expect(nodes[1].position.y).toBe(row0Y);
    expect(nodes[3].position.y).toBe(row0Y);
    expect(nodes[4].position.y).toBeGreaterThan(row0Y);
  });

  // ── Edges ────────────────────────────────────────────────────────────────

  it("creates no edges when field types are all primitives", () => {
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
    const { edges } = buildDataFlowView(services);
    expect(edges).toHaveLength(0);
  });

  it("creates a type-reference edge when a field type matches another known DTO", () => {
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
    const { edges } = buildDataFlowView(services);
    expect(edges).toHaveLength(1);
    expect(edges[0]).toMatchObject({
      source: "dt:ReservationResult",
      target: "dt:ReservationStatus",
      label:  "status",
    });
  });

  it("strips generics: List<OrderItem> creates edge to dt:OrderItem", () => {
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
    const { edges } = buildDataFlowView(services);
    expect(edges).toHaveLength(1);
    expect(edges[0].target).toBe("dt:OrderItem");
  });

  it("deduplicates edges when multiple fields reference the same type", () => {
    const services = [
      makeService({
        id: "a", name: "A",
        dataTypes: [
          {
            name: "OrderDto",
            fields: [
              { name: "currentStatus", type: "OrderStatus" },
              { name: "prevStatus",    type: "OrderStatus" },
            ],
            producedBy: ["a"], consumedBy: [],
          },
          { name: "OrderStatus", fields: [], producedBy: ["a"], consumedBy: [] },
        ],
      }),
    ];
    const { edges } = buildDataFlowView(services);
    expect(edges).toHaveLength(1);
  });

  it("does not create self-referencing edges", () => {
    const services = [
      makeService({
        id: "a", name: "A",
        dataTypes: [
          {
            name: "TreeNode",
            fields: [{ name: "child", type: "TreeNode" }],
            producedBy: ["a"], consumedBy: [],
          },
        ],
      }),
    ];
    const { edges } = buildDataFlowView(services);
    expect(edges).toHaveLength(0);
  });

  it("sets markerEnd: arrow on type-reference edges", () => {
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
    const { edges } = buildDataFlowView(services);
    expect(edges[0].markerEnd).toBe("arrow");
  });
});
