import type { AnalyzedService, GraphView, DataType } from "../types";
import { gridLayout } from "../layout";

export function buildDataFlow(services: AnalyzedService[]): GraphView {
  // Collect and deduplicate DataTypes by name across all services
  const typeMap = new Map<string, DataType>();

  for (const svc of services) {
    for (const dt of svc.dataTypes) {
      if (typeMap.has(dt.name)) {
        const existing = typeMap.get(dt.name)!;
        for (const p of dt.producedBy) {
          if (!existing.producedBy.includes(p)) existing.producedBy.push(p);
        }
        for (const c of dt.consumedBy) {
          if (!existing.consumedBy.includes(c)) existing.consumedBy.push(c);
        }
      } else {
        typeMap.set(dt.name, {
          name: dt.name,
          fields: dt.fields,
          producedBy: [...dt.producedBy],
          consumedBy: [...dt.consumedBy],
        });
      }
    }
  }

  const nodesWithoutPos = Array.from(typeMap.values()).map((dt) => ({
    id: `dt:${dt.name}`,
    type: "dataTypeNode",
    data: {
      label: dt.name,
      name: dt.name,
      fields: dt.fields,
      producedBy: dt.producedBy,
      consumedBy: dt.consumedBy,
    },
  }));

  const nodes = gridLayout(nodesWithoutPos, undefined, 280, 220);

  // One edge per producer→consumer service pair to avoid edge explosion.
  // Label shows the shared type names (up to 3).
  const pairMap = new Map<string, string[]>();

  for (const dt of typeMap.values()) {
    for (const producer of dt.producedBy) {
      for (const consumer of dt.consumedBy) {
        if (producer === consumer) continue;
        const key = `${producer}→${consumer}`;
        if (!pairMap.has(key)) pairMap.set(key, []);
        pairMap.get(key)!.push(dt.name);
      }
    }
  }

  const edges = Array.from(pairMap.entries()).map(([key, types]) => {
    const [source, target] = key.split("→");
    return {
      id: `dto:${key}`,
      source,
      target,
      label: types.slice(0, 3).join(", ") + (types.length > 3 ? "…" : ""),
      animated: false,
      markerEnd: "arrow",
    };
  });

  return { nodes, edges };
}
