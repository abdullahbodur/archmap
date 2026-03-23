import type { AnalyzedService, GraphView, DataType } from "@/types/graph";

const COL_WIDTH = 280;
const ROW_HEIGHT = 40; // base + per-field height
const FIELD_HEIGHT = 18;
const COLS = 4;
const H_GAP = 60;
const V_GAP = 80;

function estimateNodeHeight(dt: DataType): number {
  return 48 + dt.fields.length * FIELD_HEIGHT;
}

export function buildDataFlowView(services: AnalyzedService[]): GraphView {
  // ── 1. Deduplicate DataTypes by name across all services ──────────────────
  const typeMap = new Map<string, DataType>();
  for (const svc of services) {
    for (const dt of svc.dataTypes) {
      if (typeMap.has(dt.name)) {
        const ex = typeMap.get(dt.name)!;
        for (const p of dt.producedBy) if (!ex.producedBy.includes(p)) ex.producedBy.push(p);
        for (const c of dt.consumedBy) if (!ex.consumedBy.includes(c)) ex.consumedBy.push(c);
      } else {
        typeMap.set(dt.name, { ...dt, fields: [...dt.fields], producedBy: [...dt.producedBy], consumedBy: [...dt.consumedBy] });
      }
    }
  }

  const dtList = Array.from(typeMap.values());
  const dtNames = new Set(dtList.map((d) => d.name));

  // ── 2. Position nodes in a grid, row height adapts to tallest in row ──────
  const nodes: GraphView["nodes"] = [];
  let col = 0;
  let row = 0;
  let x = 0;
  let y = 0;
  const rowHeights: number[] = [];
  const positions: { x: number; y: number }[] = [];

  // First pass — compute row max heights
  dtList.forEach((dt, idx) => {
    const c = idx % COLS;
    const r = Math.floor(idx / COLS);
    const h = estimateNodeHeight(dt);
    if (rowHeights[r] === undefined) rowHeights[r] = 0;
    rowHeights[r] = Math.max(rowHeights[r], h);
  });

  // Second pass — assign positions
  dtList.forEach((dt, idx) => {
    col = idx % COLS;
    row = Math.floor(idx / COLS);
    x = col * (COL_WIDTH + H_GAP);
    y = rowHeights.slice(0, row).reduce((s, h) => s + h + V_GAP, 0);
    positions.push({ x, y });

    const isEnum = dt.fields.length > 0 && dt.fields.every((f) => f.type === "enum constant");
    // Primary service owner: producer first, otherwise consumer
    const serviceId = dt.producedBy[0] ?? dt.consumedBy[0] ?? null;
    nodes.push({
      id: `dt:${dt.name}`,
      type: "dataTypeNode",
      position: { x, y },
      data: {
        label: dt.name,
        name: dt.name,
        fields: dt.fields,
        producedBy: dt.producedBy,
        consumedBy: dt.consumedBy,
        isEnum,
        serviceId,
      },
    });
  });

  // ── 3. Edges: field-type references to other known DTOs ──────────────────
  const edges: GraphView["edges"] = [];
  const edgeSet = new Set<string>();

  for (const a of dtList) {
    for (const field of a.fields) {
      // Strip generics: List<OrderItem> → OrderItem
      const genericMatch = field.type.match(/^(?:\w+)<(.+)>$/);
      const rawType = (genericMatch ? genericMatch[1] : field.type).trim();
      if (!dtNames.has(rawType) || rawType === a.name) continue;
      const key = `${a.name}→${rawType}`;
      if (!edgeSet.has(key)) {
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
  }

  return { nodes, edges };
}
