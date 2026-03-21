import type { AnalyzedService, InfraNode, GraphView } from "../types";
import { gridLayout } from "../layout";

const INFRA_TYPE_TO_NODE: Record<string, string> = {
  database: "databaseNode",
  queue: "queueNode",
  cache: "cacheNode",
  external: "externalNode",
};

const GROUP_WIDTH = 360;
const GROUP_PADDING = 60;
const NODE_SPACING = 220;
const GROUP_GAP = 80;
const INFRA_ROW_Y = 560;

export function buildContainerDiagram(services: AnalyzedService[]): GraphView {
  // Collect unique infra nodes across all services (first declaration wins)
  const infraMap = new Map<string, InfraNode>();
  for (const svc of services) {
    for (const infra of svc.infrastructure ?? []) {
      if (!infraMap.has(infra.id)) infraMap.set(infra.id, infra);
    }
  }

  if (services.length === 0 && infraMap.size === 0) {
    return { nodes: [], edges: [] };
  }

  const hasDomains = services.some((s) => s.domain);
  const nodes: GraphView["nodes"] = [];

  if (hasDomains) {
    // Group services by domain, emit React Flow group (parent) nodes + child service nodes
    const domainGroups = new Map<string, AnalyzedService[]>();
    for (const svc of services) {
      const domain = svc.domain ?? "__ungrouped__";
      if (!domainGroups.has(domain)) domainGroups.set(domain, []);
      domainGroups.get(domain)!.push(svc);
    }

    let groupX = 0;
    for (const [domain, members] of domainGroups) {
      const groupHeight = members.length * NODE_SPACING + GROUP_PADDING * 2;
      nodes.push({
        id: `group:${domain}`,
        type: "group",
        position: { x: groupX, y: 0 },
        data: { label: domain },
        style: {
          width: GROUP_WIDTH,
          height: groupHeight,
          backgroundColor: "rgba(55,65,81,0.3)",
          borderColor: "#374151",
          borderRadius: 8,
        },
      });

      members.forEach((svc, i) => {
        nodes.push({
          id: svc.id,
          type: "serviceNode",
          position: { x: GROUP_PADDING, y: GROUP_PADDING + i * NODE_SPACING },
          parentId: `group:${domain}`,
          extent: "parent",
          data: {
            label: svc.name,
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
      });

      groupX += GROUP_WIDTH + GROUP_GAP;
    }
  } else {
    const nodesNoPos = services.map((svc) => ({
      id: svc.id,
      type: "serviceNode",
      data: {
        label: svc.name,
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
    }));
    nodes.push(...gridLayout(nodesNoPos, undefined, 320, 200));
  }

  // Infra nodes — placed in a row below the service groups
  const infraNodes = Array.from(infraMap.values());
  if (infraNodes.length > 0) {
    const infraNodesNoPos = infraNodes.map((infra) => ({
      id: infra.id,
      type: INFRA_TYPE_TO_NODE[infra.type] ?? "externalNode",
      data: {
        label: infra.name,
        name: infra.name,
        technology: infra.technology,
        description: infra.description,
        ref: infra.ref,
      },
    }));

    const totalGroupsWidth = hasDomains
      ? (new Map(services.map((s) => [s.domain ?? "__ungrouped__", true])).size) * (GROUP_WIDTH + GROUP_GAP)
      : Math.ceil(Math.sqrt(services.length)) * 320;
    const infraCols = Math.max(1, Math.ceil(Math.sqrt(infraNodesNoPos.length)));
    const infraSpacingX = 260;
    const infraSpacingY = 200;
    const infraStartX = Math.max(0, (totalGroupsWidth - infraCols * infraSpacingX) / 2);

    infraNodesNoPos.forEach((node, i) => {
      nodes.push({
        ...node,
        position: {
          x: infraStartX + (i % infraCols) * infraSpacingX,
          y: INFRA_ROW_Y + Math.floor(i / infraCols) * infraSpacingY,
        },
      });
    });
  }

  // Edges: service → infra
  const edges: GraphView["edges"] = [];
  const edgeSet = new Set<string>();

  for (const svc of services) {
    for (const infra of svc.infrastructure ?? []) {
      let label: string;
      if (infra.type === "database") {
        label = "persists to";
      } else if (infra.type === "queue") {
        const isProducer = (svc.kafkaProducers?.length ?? 0) > 0;
        const isConsumer = (svc.kafkaConsumers?.length ?? 0) > 0;
        if (isProducer && !isConsumer) label = "publishes to";
        else if (isConsumer && !isProducer) label = "subscribes to";
        else label = "uses";
      } else if (infra.type === "cache") {
        label = "caches via";
      } else {
        label = "calls";
      }

      const edgeId = `container:${svc.id}→${infra.id}`;
      if (!edgeSet.has(edgeId)) {
        edgeSet.add(edgeId);
        edges.push({
          id: edgeId,
          source: svc.id,
          target: infra.id,
          label,
          markerEnd: "arrow",
          type: "smoothstep",
          animated: false,
        });
      }
    }
  }

  return { nodes, edges };
}
