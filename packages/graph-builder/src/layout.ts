import type { ViewNode } from "./types";

/**
 * Simple grid layout for a flat list of nodes.
 */
export function gridLayout(
  nodes: Omit<ViewNode, "position">[],
  cols?: number,
  spacingX = 320,
  spacingY = 200
): ViewNode[] {
  const count = nodes.length;
  const columns = cols ?? Math.max(1, Math.ceil(Math.sqrt(count)));

  return nodes.map((node, i) => ({
    ...node,
    position: {
      x: (i % columns) * spacingX,
      y: Math.floor(i / columns) * spacingY,
    },
  }));
}

/**
 * Groups nodes by a groupKey function. Within each group nodes are placed
 * in a column; groups are laid out side-by-side with extra horizontal gap.
 */
export function groupedLayout(
  nodes: Omit<ViewNode, "position">[],
  groupKey: (node: Omit<ViewNode, "position">) => string,
  spacingX = 260,
  spacingY = 160,
  groupGap = 80
): ViewNode[] {
  const groups = new Map<string, Omit<ViewNode, "position">[]>();
  for (const node of nodes) {
    const key = groupKey(node);
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key)!.push(node);
  }

  const result: ViewNode[] = [];
  let groupX = 0;

  for (const [, members] of groups) {
    members.forEach((node, rowIndex) => {
      result.push({
        ...node,
        position: { x: groupX, y: rowIndex * spacingY },
      });
    });
    groupX += spacingX + groupGap;
  }

  return result;
}
