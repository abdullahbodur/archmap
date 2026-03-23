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

  const nodes = gridLayout(nodesWithoutPos, undefined, 320, 300);

  // ── DTO→DTO edges: field type references another known DTO ───────────────
  const dtList = Array.from(typeMap.values());
  const dtNames = new Set(dtList.map((d) => d.name));
  const edgeSet = new Set<string>();
  const edges: GraphView["edges"] = [];

  for (const a of dtList) {
    for (const field of a.fields) {
      const genericMatch = field.type.match(/^(?:\w+)<(.+)>$/);
      const rawType = (genericMatch ? genericMatch[1] : field.type).trim();
      if (!dtNames.has(rawType) || rawType === a.name) continue;
      const key = `${a.name}→${rawType}`;
      if (edgeSet.has(key)) continue;
      edgeSet.add(key);
      edges.push({
        id: `ref:${key}`,
        source: `dt:${a.name}`,
        target: `dt:${rawType}`,
        label: field.name,
        animated: false,
        markerEnd: "arrow",
      });
    }
  }

  return { nodes, edges };
}
