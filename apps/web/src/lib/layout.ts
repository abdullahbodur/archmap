/**
 * Architecture-aware Dagre layout for microservice diagrams.
 *
 * Layering rules (LR direction):
 *   Rank 0 – Group / domain boundary nodes
 *   Rank 1 – Service nodes  (main anchors)
 *   Rank 2 – Database / Cache nodes  (forced right via edge minlen)
 *   Rank 3 – External nodes
 *   Manual – Queue / Message-bus nodes pulled out of Dagre and placed
 *             below-centre of all other nodes after layout completes.
 */

import dagre from "@dagrejs/dagre";
import type { Node, Edge } from "@xyflow/react";

// ─── Node-type categories ─────────────────────────────────────────────────────

/** Service anchors — placed in the leftmost ranks by Dagre. */
const SERVICE_TYPES  = new Set(["serviceNode", "group"]);

/**
 * Database / cache nodes — always placed to the RIGHT of their owning service
 * by assigning higher edge weight + minlen on service→db edges.
 */
const DATABASE_TYPES = new Set(["databaseNode", "cacheNode"]);

/**
 * Message-bus nodes — excluded from Dagre and manually placed as a horizontal
 * strip below-centre of all other nodes after layout finishes.
 */
const BUS_TYPES      = new Set(["queueNode"]);

// ─── Constants ────────────────────────────────────────────────────────────────

export const DEFAULT_LAYOUT_SPACING = 64;

/**
 * Dimensions given to the Dagre algorithm for spacing calculations.
 * These are intentionally conservative; the actual rendered node size
 * (node.measured) is used for positioning when available.
 */
const ALGO_NODE_WIDTH  = 200;
const ALGO_NODE_HEIGHT = 150;

// ─── Private helpers ──────────────────────────────────────────────────────────

function nodeW(n: Node, fallback = ALGO_NODE_WIDTH): number {
  return (n as any).measured?.width ?? fallback;
}

function nodeH(n: Node, fallback = ALGO_NODE_HEIGHT): number {
  return (n as any).measured?.height ?? fallback;
}

/**
 * Iteratively push apart any top-level nodes whose bounding boxes overlap.
 * Child nodes (parentId set) are skipped — they are positioned relative to
 * their parent group and do not participate in global overlap resolution.
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

        const overlapX = Math.min(ax2 - bx1, bx2 - ax1);
        const overlapY = Math.min(ay2 - by1, by2 - ay1);

        if (overlapX <= overlapY) {
          const push = overlapX / 2 + 1;
          if (a.position.x < b.position.x) { a.position.x -= push; b.position.x += push; }
          else                              { a.position.x += push; b.position.x -= push; }
        } else {
          const push = overlapY / 2 + 1;
          if (a.position.y < b.position.y) { a.position.y -= push; b.position.y += push; }
          else                              { a.position.y += push; b.position.y -= push; }
        }
        changed = true;
      }
    }
    if (!changed) break;
  }

  return result;
}

// ─── Public API ───────────────────────────────────────────────────────────────

export interface LayoutConfig {
  /** Graph direction. Default: "LR" (Left → Right). */
  direction?: "LR" | "TB";
  /** Node-width hint passed to Dagre for spacing maths (px). Default: 200. */
  nodeWidth?: number;
  /** Node-height hint passed to Dagre for spacing maths (px). Default: 150. */
  nodeHeight?: number;
  /** Gap between sibling nodes and between rank levels (px). Default: 64. */
  spacing?: number;
}

/**
 * Architecture-aware layout helper.
 *
 * Algorithm:
 *  1. Split nodes into three buckets:
 *       – dagreNodes  : everything except bus nodes and React-Flow child nodes
 *       – busNodes    : queueNode / message-bus (manually positioned)
 *       – childNodes  : nodes with parentId (positioned by their parent group)
 *
 *  2. Build the Dagre graph:
 *       – Service/group nodes get default edge weights (anchor left).
 *       – Edges that target a database/cache node get weight=3, minlen=2 so
 *         Dagre pushes those nodes two ranks further right than their service.
 *       – Edges involving bus or child nodes are resolved to their top-level
 *         representative before being added (child → parent group).
 *
 *  3. Run dagre.layout() and read back (x, y) positions.
 *
 *  4. Post-process bus/queue nodes:
 *       – Compute the bounding box of all Dagre-positioned nodes.
 *       – Place the bus strip below-centre with `spacing * 2` vertical gap.
 *
 *  5. Resolve any remaining bounding-box overlaps among top-level nodes.
 *
 *  6. Reattach child nodes (untouched) and return.
 */
export function getLayoutedElements(
  nodes: Node[],
  edges: Edge[],
  config: LayoutConfig = {}
): { nodes: Node[]; edges: Edge[] } {
  const {
    direction  = "LR",
    nodeWidth  = ALGO_NODE_WIDTH,
    nodeHeight = ALGO_NODE_HEIGHT,
    spacing    = DEFAULT_LAYOUT_SPACING,
  } = config;

  // ── 1. Bucket nodes ───────────────────────────────────────────────────────
  const busNodes   = nodes.filter((n) =>  BUS_TYPES.has(n.type ?? ""));
  const childNodes = nodes.filter((n) => !BUS_TYPES.has(n.type ?? "") &&  (n as any).parentId);
  const dagreNodes = nodes.filter((n) => !BUS_TYPES.has(n.type ?? "") && !(n as any).parentId);

  // ── 2. Build Dagre graph ──────────────────────────────────────────────────
  const g = new dagre.graphlib.Graph();
  g.setDefaultEdgeLabel(() => ({}));
  g.setGraph({
    rankdir: direction,
    nodesep: spacing,
    ranksep: spacing * 2,
    marginx: spacing,
    marginy: spacing,
  });

  // Register nodes with measured (or fallback) dimensions.
  for (const node of dagreNodes) {
    g.setNode(node.id, {
      width:  nodeW(node, nodeWidth),
      height: nodeH(node, nodeHeight),
    });
  }

  // Build a quick lookup and a helper that resolves child IDs → top-level IDs.
  const nodeById = new Map(nodes.map((n) => [n.id, n]));
  const topLevelId = (id: string): string => {
    const n = nodeById.get(id);
    return (n as any)?.parentId ?? id;
  };

  // Add edges, resolving child nodes to their parents and skipping bus nodes.
  const seenEdges = new Set<string>();
  for (const edge of edges) {
    const srcId = topLevelId(edge.source);
    const tgtId = topLevelId(edge.target);

    if (srcId === tgtId) continue;                         // intra-group
    if (!g.hasNode(srcId) || !g.hasNode(tgtId)) continue; // involves bus node
    const key = `${srcId}→${tgtId}`;
    if (seenEdges.has(key)) continue;                      // deduplicate
    seenEdges.add(key);

    const tgtNode = nodeById.get(edge.target);
    const isDbEdge = DATABASE_TYPES.has(tgtNode?.type ?? "");

    g.setEdge(srcId, tgtId, {
      // Database/cache edges: push two ranks right so databases always appear
      // clearly to the right of their owning service node.
      weight: isDbEdge ? 3 : 1,
      minlen: isDbEdge ? 2 : 1,
    });
  }

  // ── 3. Run Dagre ──────────────────────────────────────────────────────────
  dagre.layout(g);

  const positioned = dagreNodes.map((node) => {
    const pos = g.node(node.id);
    if (!pos) return node;
    const w = nodeW(node, nodeWidth);
    const h = nodeH(node, nodeHeight);
    return { ...node, position: { x: pos.x - w / 2, y: pos.y - h / 2 } };
  });

  // ── 4. Place bus/queue nodes below-centre ─────────────────────────────────
  let finalNodes: Node[];

  if (busNodes.length > 0 && positioned.length > 0) {
    // Compute the bounding box of all Dagre-laid nodes.
    let minX =  Infinity, maxX = -Infinity, maxY = -Infinity;
    for (const n of positioned) {
      minX = Math.min(minX, n.position.x);
      maxX = Math.max(maxX, n.position.x + nodeW(n, nodeWidth));
      maxY = Math.max(maxY, n.position.y + nodeH(n, nodeHeight));
    }

    const canvasCenterX = (minX + maxX) / 2;
    const busY = maxY + spacing * 2;

    // Total bus-strip width including inter-node gaps.
    const totalBusW =
      busNodes.reduce((sum, n) => sum + nodeW(n, nodeWidth), 0) +
      (busNodes.length - 1) * spacing;

    let busX = canvasCenterX - totalBusW / 2;
    const placedBus = busNodes.map((n) => {
      const node = { ...n, position: { x: busX, y: busY } };
      busX += nodeW(n, nodeWidth) + spacing;
      return node;
    });

    finalNodes = [...positioned, ...placedBus];
  } else {
    finalNodes = [...positioned, ...busNodes];
  }

  // ── 5. Resolve residual overlaps ──────────────────────────────────────────
  const resolved = resolveOverlaps(finalNodes);

  // ── 6. Reattach child nodes (positions are relative to parent) ────────────
  return { nodes: [...resolved, ...childNodes], edges };
}

/**
 * Convenience wrapper — runs getLayoutedElements and returns only the nodes.
 * Kept for backward compatibility with existing call sites.
 */
export function applyDagreLayout(
  nodes: Node[],
  edges: Edge[],
  direction: "TB" | "LR" = "LR",
  spacing: number = DEFAULT_LAYOUT_SPACING
): Node[] {
  return getLayoutedElements(nodes, edges, { direction, spacing }).nodes;
}
