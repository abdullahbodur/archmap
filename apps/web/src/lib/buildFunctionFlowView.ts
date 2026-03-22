import type { AnalyzedService, GraphView } from "@/types/graph";
import { classifyByClassName, type FunctionKind } from "@/lib/classify";

const GROUP_W = 300;
const FN_H = 56;     // estimated function node height (no className/serviceName rows)
const FN_GAP = 16;
const HEADER_H = 60; // class name header in group
const PAD = 12;
const COLS = 4;
const H_GAP = 60;
const V_GAP = 80;

export const COLLAPSED_H = 52; // header + border when group is collapsed

const ALWAYS_HIDDEN = new Set<FunctionKind>(["config", "app"]);

function groupHeight(count: number): number {
  return HEADER_H + count * (FN_H + FN_GAP) + PAD;
}

type FnEntry = {
  svcId: string;
  svcName: string;
  fn: AnalyzedService["functions"][number];
  nodeId: string;
  kind: FunctionKind;
  meta: Record<string, unknown>;
};

export function buildFunctionFlowView(
  services: AnalyzedService[],
  hiddenKinds: Set<FunctionKind> = new Set()
): GraphView {
  const allHidden = new Set<FunctionKind>([...ALWAYS_HIDDEN, ...hiddenKinds]);

  // Build endpoint and kafka lookup maps for kind enrichment
  const endpointMap = new Map<string, { kind: FunctionKind; httpMethod: string; path: string }>();
  const kafkaMap = new Map<string, { kind: FunctionKind; topics: string[] }>();

  for (const svc of services) {
    for (const ep of svc.endpoints ?? []) {
      const epAny = ep as typeof ep & { handlerClass?: string; handlerMethod?: string };
      if (epAny.handlerClass && epAny.handlerMethod &&
          epAny.handlerClass !== "unknown" && epAny.handlerMethod !== "unknown") {
        const key = `fn:${svc.id}:${epAny.handlerClass}.${epAny.handlerMethod}`;
        endpointMap.set(key, { kind: "controller", httpMethod: ep.method, path: ep.path });
      }
    }
    for (const kc of svc.kafkaConsumers ?? []) {
      if (kc.handlerClass && kc.handlerMethod &&
          kc.handlerClass !== "unknown" && kc.handlerMethod !== "unknown") {
        const key = `fn:${svc.id}:${kc.handlerClass}.${kc.handlerMethod}`;
        kafkaMap.set(key, { kind: "kafka-consumer", topics: kc.topics });
      }
    }
  }

  // Classify and group functions by {svcId}::{className}
  const groups = new Map<string, FnEntry[]>();

  for (const svc of services) {
    for (const fn of svc.functions) {
      const cls = fn.className ?? "Unknown";
      const nodeId = `fn:${svc.id}:${cls}.${fn.name}`;

      let kind: FunctionKind;
      let meta: Record<string, unknown> = {};
      if (endpointMap.has(nodeId)) {
        const m = endpointMap.get(nodeId)!;
        kind = m.kind;
        meta = { httpMethod: m.httpMethod, path: m.path };
      } else if (kafkaMap.has(nodeId)) {
        const m = kafkaMap.get(nodeId)!;
        kind = m.kind;
        meta = { topics: m.topics };
      } else {
        kind = classifyByClassName(cls);
      }

      if (allHidden.has(kind)) continue;

      // Skip isolated method helpers (no outgoing calls at all)
      if (kind === "method") {
        const hasCalls =
          (fn.callsMethods?.length ?? 0) > 0 ||
          (fn.callsBeanMethods?.length ?? 0) > 0 ||
          (fn.callsOut?.length ?? 0) > 0;
        if (!hasCalls) continue;
      }

      const groupKey = `${svc.id}::${cls}`;
      if (!groups.has(groupKey)) groups.set(groupKey, []);
      groups.get(groupKey)!.push({ svcId: svc.id, svcName: svc.name, fn, nodeId, kind, meta });
    }
  }

  const nodes: GraphView["nodes"] = [];

  // Layout groups in a COLS-column grid with adaptive row heights
  const groupEntries = Array.from(groups.entries());
  const rowHeights: number[] = [];

  groupEntries.forEach(([, members], idx) => {
    const r = Math.floor(idx / COLS);
    const h = groupHeight(members.length);
    if (rowHeights[r] === undefined) rowHeights[r] = 0;
    rowHeights[r] = Math.max(rowHeights[r], h);
  });

  const groupNodeIds = new Map<string, string>(); // groupKey → groupNodeId

  groupEntries.forEach(([groupKey, members], idx) => {
    const col = idx % COLS;
    const row = Math.floor(idx / COLS);
    const gx = col * (GROUP_W + H_GAP);
    const gy = rowHeights.slice(0, row).reduce((s, h) => s + h + V_GAP, 0);

    const [svcId, className] = groupKey.split(/::/);
    const svcName = members[0].svcName;
    const groupId = `group:${groupKey}`;
    groupNodeIds.set(groupKey, groupId);

    // Dominant kind = most frequent non-method kind
    const kindCounts = new Map<FunctionKind, number>();
    for (const e of members) {
      kindCounts.set(e.kind, (kindCounts.get(e.kind) ?? 0) + 1);
    }
    let dominantKind: FunctionKind = members[0].kind;
    let maxCount = 0;
    for (const [k, c] of kindCounts) {
      if (c > maxCount) { maxCount = c; dominantKind = k; }
    }

    const gh = groupHeight(members.length);

    nodes.push({
      id: groupId,
      type: "classGroupNode",
      position: { x: gx, y: gy },
      data: {
        label: className,
        className,
        serviceName: svcName,
        serviceId: svcId,
        functionCount: members.length,
        dominantKind,
        isCollapsed: false,
      },
      style: {
        width: GROUP_W,
        height: gh,
        backgroundColor: "rgba(17,24,39,0.85)",
        borderRadius: 8,
      },
    });

    members.forEach((entry, i) => {
      nodes.push({
        id: entry.nodeId,
        type: "functionNode",
        parentId: groupId,
        extent: "parent",
        position: { x: PAD, y: HEADER_H + i * (FN_H + FN_GAP) },
        data: {
          label: entry.fn.name,
          name: entry.fn.name,
          className: entry.fn.className ?? "Unknown",
          serviceName: entry.svcName,
          serviceId: entry.svcId,
          signature: entry.fn.signature,
          kind: entry.kind,
          grouped: true,
          callsOut: entry.fn.callsOut,
          ...entry.meta,
        },
      });
    });
  });

  // ── Build edge lookup maps ─────────────────────────────────────────────────
  // svcId::className::methodName → nodeId
  const byServiceClass = new Map<string, string>();
  // svcId::methodName → nodeId (first win)
  const byServiceFn = new Map<string, string>();

  for (const [groupKey, members] of groups) {
    const [svcId, className] = groupKey.split(/::/);
    for (const entry of members) {
      byServiceClass.set(`${svcId}::${className}::${entry.fn.name}`, entry.nodeId);
      const sfKey = `${svcId}::${entry.fn.name}`;
      if (!byServiceFn.has(sfKey)) byServiceFn.set(sfKey, entry.nodeId);
    }
  }

  const edges: GraphView["edges"] = [];
  const edgeSet = new Set<string>();

  function addEdge(source: string, target: string, animated = false) {
    const key = `${source}→${target}`;
    if (!edgeSet.has(key) && source !== target) {
      edgeSet.add(key);
      edges.push({ id: key, source, target, animated, markerEnd: "arrow" });
    }
  }

  for (const [groupKey, members] of groups) {
    const [svcId, className] = groupKey.split(/::/);
    for (const entry of members) {
      // 1. Same-class direct calls
      for (const calledMethod of entry.fn.callsMethods ?? []) {
        const targetId = byServiceClass.get(`${svcId}::${className}::${calledMethod}`);
        if (targetId) addEdge(entry.nodeId, targetId);
      }

      // 2. Cross-class bean calls within same service
      for (const beanCall of entry.fn.callsBeanMethods ?? []) {
        const targetId = byServiceFn.get(`${svcId}::${beanCall.methodName}`);
        if (targetId && targetId !== entry.nodeId) addEdge(entry.nodeId, targetId);
      }

      // 3. Cross-service calls
      for (const call of entry.fn.callsOut ?? []) {
        const targetSvcId = call.targetServiceId ?? call.targetService;
        const targetFnName = call.targetEndpoint;
        let targetId: string | undefined;
        if (targetFnName) {
          targetId = byServiceFn.get(`${targetSvcId}::${targetFnName}`);
        } else {
          for (const [k, v] of byServiceFn) {
            if (k.startsWith(`${targetSvcId}::`)) { targetId = v; break; }
          }
        }
        if (targetId) addEdge(entry.nodeId, targetId, true);
      }
    }
  }

  return { nodes, edges };
}
