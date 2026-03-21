import type { AnalyzedService, GraphView } from "../types";
import { groupedLayout } from "../layout";

export function buildFunctionFlow(services: AnalyzedService[]): GraphView {
  // Track which service each function belongs to (by node id)
  const serviceIdByNodeId = new Map<string, string>();

  const nodesWithoutPos = services.flatMap((svc) =>
    svc.functions.map((fn) => {
      const id = `fn:${svc.id}:${fn.name}`;
      serviceIdByNodeId.set(id, svc.id);
      return {
        id,
        type: "functionNode",
        data: {
          label: fn.name,
          name: fn.name,
          serviceName: svc.name,
          serviceId: svc.id,
          signature: fn.signature,
          callsOut: fn.callsOut,
        },
      };
    })
  );

  const nodes = groupedLayout(
    nodesWithoutPos,
    (n) => serviceIdByNodeId.get(n.id) ?? ""
  );

  const edges: GraphView["edges"] = [];
  const edgeSet = new Set<string>();

  for (const svc of services) {
    for (const fn of svc.functions) {
      const sourceId = `fn:${svc.id}:${fn.name}`;
      for (const call of fn.callsOut) {
        const targetSvcId = call.targetServiceId ?? call.targetService;
        const targetFnName = call.targetEndpoint;

        // Find exact match first, then fall back to first node in target service
        const targetNode = nodes.find(
          (n) =>
            targetFnName
              ? n.id === `fn:${targetSvcId}:${targetFnName}`
              : n.id.startsWith(`fn:${targetSvcId}:`)
        );
        const targetId =
          targetNode?.id ?? `fn:${targetSvcId}:${targetFnName ?? "unknown"}`;

        const edgeId = `call:${sourceId}→${targetId}`;
        if (!edgeSet.has(edgeId)) {
          edgeSet.add(edgeId);
          edges.push({
            id: edgeId,
            source: sourceId,
            target: targetId,
            label: call.via ?? "calls",
            animated: true,
          });
        }
      }
    }
  }

  return { nodes, edges };
}
