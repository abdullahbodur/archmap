import type { AnalyzedService, GraphView } from "../types";
import { groupedLayout } from "../layout";

export function buildFunctionFlow(services: AnalyzedService[]): GraphView {
  // Track service + class per node
  const nodeServiceId = new Map<string, string>();
  const nodeClassName = new Map<string, string>();

  const nodesWithoutPos = services.flatMap((svc) =>
    svc.functions.map((fn) => {
      const cls = fn.className ?? "Unknown";
      const id = `fn:${svc.id}:${cls}.${fn.name}`;
      nodeServiceId.set(id, svc.id);
      nodeClassName.set(id, cls);
      return {
        id,
        type: "functionNode",
        data: {
          label: fn.name,
          name: fn.name,
          className: cls,
          serviceName: svc.name,
          serviceId: svc.id,
          signature: fn.signature,
          callsOut: fn.callsOut,
        },
      };
    })
  );

  // Group by "<serviceId>::<className>" so functions in the same class cluster together
  const nodes = groupedLayout(
    nodesWithoutPos,
    (n) => `${nodeServiceId.get(n.id)}::${nodeClassName.get(n.id)}`
  );

  const edges: GraphView["edges"] = [];
  const edgeSet = new Set<string>();

  function addEdge(source: string, target: string, label: string, animated = false) {
    const edgeId = `${source}→${target}`;
    if (!edgeSet.has(edgeId) && source !== target) {
      edgeSet.add(edgeId);
      edges.push({ id: edgeId, source, target, label, animated });
    }
  }

  // ── Build lookup maps ────────────────────────────────────────────────────────

  // serviceId → className → methodName → nodeId
  const byServiceClass = new Map<string, Map<string, Map<string, string>>>();
  // serviceId → methodName → nodeId (first found, for cross-class lookups)
  const byServiceFn = new Map<string, Map<string, string>>();

  for (const node of nodes) {
    const svcId = nodeServiceId.get(node.id)!;
    const cls = nodeClassName.get(node.id)!;
    const fnName = (node.data as Record<string, unknown>).name as string;

    if (!byServiceClass.has(svcId)) byServiceClass.set(svcId, new Map());
    const byClass = byServiceClass.get(svcId)!;
    if (!byClass.has(cls)) byClass.set(cls, new Map());
    byClass.get(cls)!.set(fnName, node.id);

    if (!byServiceFn.has(svcId)) byServiceFn.set(svcId, new Map());
    const byFn = byServiceFn.get(svcId)!;
    if (!byFn.has(fnName)) byFn.set(fnName, node.id); // first match wins
  }

  // ── Emit edges ───────────────────────────────────────────────────────────────

  for (const svc of services) {
    for (const fn of svc.functions) {
      const cls = fn.className ?? "Unknown";
      const sourceId = `fn:${svc.id}:${cls}.${fn.name}`;

      // 1. Same-class direct calls (callsMethods)
      for (const calledMethod of fn.callsMethods ?? []) {
        const targetId = byServiceClass.get(svc.id)?.get(cls)?.get(calledMethod);
        if (targetId) addEdge(sourceId, targetId, "calls");
      }

      // 2. Cross-class bean calls within same service (callsBeanMethods)
      for (const beanCall of fn.callsBeanMethods ?? []) {
        const targetId = byServiceFn.get(svc.id)?.get(beanCall.methodName);
        // Only emit as intra-service edge if the target exists and is a different function
        if (targetId && targetId !== sourceId) {
          addEdge(sourceId, targetId, beanCall.beanVariable);
        }
      }

      // 3. Cross-service edges (callsOut)
      for (const call of fn.callsOut) {
        const targetSvcId = call.targetServiceId ?? call.targetService;
        // Skip if target service doesn't exist in the graph (unresolved)
        if (!byServiceFn.has(targetSvcId)) continue;

        const targetFnName = call.targetEndpoint;
        let targetId: string | undefined;
        if (targetFnName) {
          targetId = byServiceFn.get(targetSvcId)?.get(targetFnName);
        } else {
          // Point to the first available function in that service
          const first = byServiceFn.get(targetSvcId);
          targetId = first ? first.values().next().value : undefined;
        }
        if (targetId) addEdge(sourceId, targetId, call.via ?? "calls", true);
      }
    }
  }

  return { nodes, edges };
}
