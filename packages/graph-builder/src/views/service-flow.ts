import type { AnalyzedService, GraphView } from "../types";
import { gridLayout, groupedLayout } from "../layout";

export function buildServiceFlow(services: AnalyzedService[]): GraphView {
  const hasDomains = services.some((s) => s.domain);

  const nodesWithoutPos = services.map((svc) => ({
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
    },
  }));

  const nodes = hasDomains
    ? groupedLayout(nodesWithoutPos, (n) => (n.data.domain as string) ?? "__ungrouped__")
    : gridLayout(nodesWithoutPos);

  const edgeSet = new Set<string>();
  const edges: GraphView["edges"] = [];

  for (const svc of services) {
    for (const dep of svc.dependsOn) {
      const edgeId = `svc:${svc.id}→${dep}`;
      if (!edgeSet.has(edgeId)) {
        edgeSet.add(edgeId);
        edges.push({
          id: edgeId,
          source: svc.id,
          target: dep,
          label: "calls",
          animated: true,
        });
      }
    }
  }

  return { nodes, edges };
}
