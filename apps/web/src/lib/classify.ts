import type { ViewNode, AnalyzedService } from "@/types/graph";

export type FunctionKind =
  | "controller"
  | "kafka-consumer"
  | "service"
  | "repository"
  | "scheduler"
  | "config"
  | "app"
  | "method";

export interface FunctionMeta {
  kind: FunctionKind;
  httpMethod?: string;
  path?: string;
  topics?: string[];
}

export function classifyByClassName(className: string): FunctionKind {
  if (/Controller$/i.test(className)) return "controller";
  if (/Consumer$|Listener$/i.test(className)) return "kafka-consumer";
  if (/Scheduler$|Job$|Task$/i.test(className)) return "scheduler";
  if (/Service$/i.test(className)) return "service";
  if (/Repository$|Dao$/i.test(className)) return "repository";
  if (/Config$|Configuration$/i.test(className)) return "config";
  if (/Application$/i.test(className)) return "app";
  return "method";
}

export function buildKindMap(
  nodes: ViewNode[],
  allServices: AnalyzedService[]
): Map<string, FunctionMeta> {
  const result = new Map<string, FunctionMeta>();

  // Build lookup maps from service metadata
  // endpoint map: `fn:{svcId}:{handlerClass}.{handlerMethod}` → meta
  const endpointMap = new Map<string, FunctionMeta>();
  const kafkaMap = new Map<string, FunctionMeta>();

  for (const svc of allServices) {
    for (const ep of svc.endpoints ?? []) {
      const epWithHandler = ep as typeof ep & { handlerClass?: string; handlerMethod?: string };
      if (epWithHandler.handlerClass && epWithHandler.handlerMethod &&
          epWithHandler.handlerClass !== "unknown" && epWithHandler.handlerMethod !== "unknown") {
        const key = `fn:${svc.id}:${epWithHandler.handlerClass}.${epWithHandler.handlerMethod}`;
        endpointMap.set(key, {
          kind: "controller",
          httpMethod: ep.method,
          path: ep.path,
        });
      }
    }
    for (const kc of svc.kafkaConsumers ?? []) {
      if (kc.handlerClass && kc.handlerMethod &&
          kc.handlerClass !== "unknown" && kc.handlerMethod !== "unknown") {
        const key = `fn:${svc.id}:${kc.handlerClass}.${kc.handlerMethod}`;
        kafkaMap.set(key, {
          kind: "kafka-consumer",
          topics: kc.topics,
        });
      }
    }
  }

  for (const node of nodes) {
    // Try endpoint cross-reference first
    if (endpointMap.has(node.id)) {
      result.set(node.id, endpointMap.get(node.id)!);
      continue;
    }
    // Then kafka cross-reference
    if (kafkaMap.has(node.id)) {
      result.set(node.id, kafkaMap.get(node.id)!);
      continue;
    }
    // Fall back to class name suffix
    const className = (node.data as any).className as string | undefined;
    const kind = className ? classifyByClassName(className) : "method";
    result.set(node.id, { kind });
  }

  return result;
}
