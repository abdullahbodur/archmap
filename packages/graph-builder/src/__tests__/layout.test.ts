import { describe, it, expect } from "vitest";
import { gridLayout, groupedLayout } from "../layout";

const makeNodes = (ids: string[]) =>
  ids.map((id) => ({ id, type: "serviceNode", data: {} }));

describe("gridLayout", () => {
  it("assigns a position to every node", () => {
    const nodes = makeNodes(["a", "b", "c", "d"]);
    const result = gridLayout(nodes);
    expect(result).toHaveLength(4);
    result.forEach((n) => {
      expect(typeof n.position.x).toBe("number");
      expect(typeof n.position.y).toBe("number");
    });
  });

  it("preserves node ids and data", () => {
    const nodes = makeNodes(["x", "y"]);
    const result = gridLayout(nodes);
    expect(result.map((n) => n.id)).toEqual(["x", "y"]);
  });

  it("returns empty array for empty input", () => {
    expect(gridLayout([])).toEqual([]);
  });

  it("produces unique positions", () => {
    const nodes = makeNodes(["a", "b", "c", "d", "e", "f"]);
    const result = gridLayout(nodes);
    const positions = result.map((n) => `${n.position.x},${n.position.y}`);
    expect(new Set(positions).size).toBe(positions.length);
  });
});

describe("groupedLayout", () => {
  it("assigns positions to all nodes", () => {
    const nodes = [
      { id: "a", type: "serviceNode", data: { domain: "payments" } },
      { id: "b", type: "serviceNode", data: { domain: "payments" } },
      { id: "c", type: "serviceNode", data: { domain: "orders" } },
    ];
    const result = groupedLayout(nodes, (n) => n.data.domain as string);
    expect(result).toHaveLength(3);
    result.forEach((n) => {
      expect(typeof n.position.x).toBe("number");
      expect(typeof n.position.y).toBe("number");
    });
  });

  it("places nodes in the same group closer together than nodes in different groups", () => {
    const nodes = [
      { id: "a", type: "serviceNode", data: { domain: "payments" } },
      { id: "b", type: "serviceNode", data: { domain: "payments" } },
      { id: "c", type: "serviceNode", data: { domain: "orders" } },
    ];
    const result = groupedLayout(nodes, (n) => n.data.domain as string);
    const a = result.find((n) => n.id === "a")!;
    const b = result.find((n) => n.id === "b")!;
    const c = result.find((n) => n.id === "c")!;

    const distAB = Math.abs(a.position.x - b.position.x);
    const distAC = Math.abs(a.position.x - c.position.x);
    expect(distAB).toBeLessThan(distAC);
  });
});
