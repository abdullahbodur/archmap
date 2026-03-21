import dagre from "@dagrejs/dagre";
import type { Node, Edge } from "@xyflow/react";

const DEFAULT_NODE_WIDTH = 260;
const DEFAULT_NODE_HEIGHT = 160;

export function applyDagreLayout(
  nodes: Node[],
  edges: Edge[],
  direction: "TB" | "LR" = "LR"
): Node[] {
  const g = new dagre.graphlib.Graph();
  g.setDefaultEdgeLabel(() => ({}));
  g.setGraph({ rankdir: direction, nodesep: 80, ranksep: 200 });

  for (const node of nodes) {
    const w = (node as any).measured?.width ?? DEFAULT_NODE_WIDTH;
    const h = (node as any).measured?.height ?? DEFAULT_NODE_HEIGHT;
    g.setNode(node.id, { width: w, height: h });
  }
  for (const edge of edges) {
    g.setEdge(edge.source, edge.target);
  }

  dagre.layout(g);

  return nodes.map((node) => {
    const w = (node as any).measured?.width ?? DEFAULT_NODE_WIDTH;
    const h = (node as any).measured?.height ?? DEFAULT_NODE_HEIGHT;
    const { x, y } = g.node(node.id);
    return {
      ...node,
      position: {
        x: x - w / 2,
        y: y - h / 2,
      },
    };
  });
}
