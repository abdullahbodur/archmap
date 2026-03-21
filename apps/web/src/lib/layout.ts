import dagre from "@dagrejs/dagre";
import type { Node, Edge } from "@xyflow/react";

const DEFAULT_NODE_WIDTH = 260;
const DEFAULT_NODE_HEIGHT = 160;
export const DEFAULT_LAYOUT_SPACING = 64;

function nodeW(n: Node): number {
  return (n as any).measured?.width ?? DEFAULT_NODE_WIDTH;
}

function nodeH(n: Node): number {
  return (n as any).measured?.height ?? DEFAULT_NODE_HEIGHT;
}

/**
 * Iteratively push apart any top-level nodes whose bounding boxes overlap.
 * Child nodes (parentId set) are skipped — they are positioned relative to
 * their parent and should be handled by the parent's own sizing.
 */
function resolveOverlaps(nodes: Node[], padding = 16): Node[] {
  const result = nodes.map((n) => ({ ...n, position: { ...n.position } }));
  const topLevel = result.filter((n) => !(n as any).parentId);

  for (let iter = 0; iter < 100; iter++) {
    let changed = false;
    for (let i = 0; i < topLevel.length; i++) {
      for (let j = i + 1; j < topLevel.length; j++) {
        const a = topLevel[i];
        const b = topLevel[j];

        const ax1 = a.position.x - padding;
        const ay1 = a.position.y - padding;
        const ax2 = a.position.x + nodeW(a) + padding;
        const ay2 = a.position.y + nodeH(a) + padding;

        const bx1 = b.position.x - padding;
        const by1 = b.position.y - padding;
        const bx2 = b.position.x + nodeW(b) + padding;
        const by2 = b.position.y + nodeH(b) + padding;

        if (ax1 >= bx2 || ax2 <= bx1 || ay1 >= by2 || ay2 <= by1) continue;

        // Overlap on each axis
        const overlapX = Math.min(ax2 - bx1, bx2 - ax1);
        const overlapY = Math.min(ay2 - by1, by2 - ay1);

        // Push apart on the axis with the smaller overlap (less displacement)
        if (overlapX <= overlapY) {
          const push = overlapX / 2 + 1;
          if (a.position.x < b.position.x) {
            a.position.x -= push;
            b.position.x += push;
          } else {
            a.position.x += push;
            b.position.x -= push;
          }
        } else {
          const push = overlapY / 2 + 1;
          if (a.position.y < b.position.y) {
            a.position.y -= push;
            b.position.y += push;
          } else {
            a.position.y += push;
            b.position.y -= push;
          }
        }
        changed = true;
      }
    }
    if (!changed) break;
  }

  return result;
}

export function applyDagreLayout(
  nodes: Node[],
  edges: Edge[],
  direction: "TB" | "LR" = "LR",
  spacing: number = DEFAULT_LAYOUT_SPACING
): Node[] {
  const g = new dagre.graphlib.Graph();
  g.setDefaultEdgeLabel(() => ({}));
  // nodesep = gap between sibling nodes; ranksep = gap between rank levels
  g.setGraph({ rankdir: direction, nodesep: spacing, ranksep: spacing * 2 });

  for (const node of nodes) {
    g.setNode(node.id, { width: nodeW(node), height: nodeH(node) });
  }
  for (const edge of edges) {
    g.setEdge(edge.source, edge.target);
  }

  dagre.layout(g);

  const laid = nodes.map((node) => {
    const pos = g.node(node.id);
    if (!pos) return node;
    const w = nodeW(node);
    const h = nodeH(node);
    return { ...node, position: { x: pos.x - w / 2, y: pos.y - h / 2 } };
  });

  return resolveOverlaps(laid);
}
