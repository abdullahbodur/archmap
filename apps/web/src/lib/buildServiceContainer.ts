import type { AnalyzedService, GraphView } from "@/types/graph";

const INFRA_TYPE_TO_NODE: Record<string, string> = {
  database: "databaseNode",
  queue: "queueNode",
  cache: "cacheNode",
  external: "externalNode",
};

const PADDING = 80;
const SERVICE_HEIGHT = 260;
const INFRA_SPACING = 220;

export function buildServiceContainerView(
  svc: AnalyzedService,
  allServices: AnalyzedService[]
): GraphView {
  const nodes: GraphView["nodes"] = [];
  const edges: GraphView["edges"] = [];

  const internalInfra = (svc.infrastructure ?? []).filter((i) => i.internal);
  const externalInfra = (svc.infrastructure ?? []).filter((i) => !i.internal);

  // ── Container group for the subject service ──────────────────────────────
  const containerH =
    PADDING * 2 + SERVICE_HEIGHT + internalInfra.length * INFRA_SPACING;
  const containerW = 380;
  const groupId = `container:${svc.id}`;

  nodes.push({
    id: groupId,
    type: "group",
    position: { x: 0, y: 0 },
    data: { label: svc.name },
    style: {
      width: containerW,
      height: containerH,
      backgroundColor: "rgba(55,65,81,0.3)",
      borderColor: "#4b5563",
      borderRadius: 8,
    },
  });

  // Subject service node — inside the group
  nodes.push({
    id: svc.id,
    type: "serviceNode",
    parentId: groupId,
    extent: "parent",
    position: { x: PADDING, y: PADDING },
    data: {
      name: svc.name,
      repoName: svc.repoName,
      repoUrl: svc.repoUrl,
      language: svc.language,
      summary: svc.summary,
      endpoints: svc.endpoints,
      serviceType: svc.type,
      domain: svc.domain,
      tags: svc.tags,
      nodeConfig: svc.nodeConfig,
    },
  });

  // Internal infra — inside the group, stacked below the service node
  internalInfra.forEach((infra, i) => {
    nodes.push({
      id: infra.id,
      type: INFRA_TYPE_TO_NODE[infra.type] ?? "externalNode",
      parentId: groupId,
      extent: "parent",
      position: {
        x: PADDING,
        y: PADDING + SERVICE_HEIGHT + i * INFRA_SPACING,
      },
      data: {
        name: infra.name,
        technology: infra.technology,
        description: infra.description,
        ref: infra.ref,
      },
    });
    edges.push({
      id: `c:${svc.id}→${infra.id}`,
      source: svc.id,
      target: infra.id,
      label: infraLabel(infra.type, svc),
      markerEnd: "arrow",
      type: "smoothstep",
    });
  });

  // ── External infra ────────────────────────────────────────────────────────
  externalInfra.forEach((infra, i) => {
    nodes.push({
      id: infra.id,
      type: INFRA_TYPE_TO_NODE[infra.type] ?? "externalNode",
      position: { x: containerW + 120, y: i * INFRA_SPACING },
      data: {
        name: infra.name,
        technology: infra.technology,
        description: infra.description,
        ref: infra.ref,
      },
    });
    edges.push({
      id: `c:${svc.id}→${infra.id}`,
      source: svc.id,
      target: infra.id,
      label: infraLabel(infra.type, svc),
      markerEnd: "arrow",
      type: "smoothstep",
    });
  });

  // ── External service dependencies ─────────────────────────────────────────
  const startY =
    externalInfra.length * INFRA_SPACING + (externalInfra.length > 0 ? 120 : 0);
  svc.dependsOn.forEach((depId, i) => {
    const depSvc = allServices.find((s) => s.id === depId);
    nodes.push({
      id: depId,
      type: "serviceNode",
      position: { x: containerW + 120, y: startY + i * INFRA_SPACING },
      data: depSvc
        ? {
            name: depSvc.name,
            repoName: depSvc.repoName,
            repoUrl: depSvc.repoUrl,
            language: depSvc.language,
            summary: depSvc.summary,
            endpoints: [],
            serviceType: depSvc.type,
            tags: depSvc.tags,
          }
        : {
            name: depId,
            repoName: depId,
            repoUrl: "",
            language: "",
            summary: "",
            endpoints: [],
          },
    });
    edges.push({
      id: `c:${svc.id}→dep:${depId}`,
      source: svc.id,
      target: depId,
      label: "depends on",
      markerEnd: "arrow",
      type: "smoothstep",
    });
  });

  return { nodes, edges };
}

function infraLabel(type: string, svc: AnalyzedService): string {
  if (type === "database") return "persists to";
  if (type === "cache") return "caches via";
  if (type === "external") return "calls";
  // queue
  const isProducer = (svc.kafkaProducers?.length ?? 0) > 0;
  const isConsumer = (svc.kafkaConsumers?.length ?? 0) > 0;
  if (isProducer && !isConsumer) return "publishes to";
  if (isConsumer && !isProducer) return "subscribes to";
  return "uses";
}
