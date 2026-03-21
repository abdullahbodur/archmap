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
      nodeConfig: svc.nodeConfig,
    },
  }));

  const nodes = hasDomains
    ? groupedLayout(nodesWithoutPos, (n) => (n.data.domain as string) ?? "__ungrouped__")
    : gridLayout(nodesWithoutPos);

  const edgeSet = new Set<string>();
  const edges: GraphView["edges"] = [];

  // ── Regular call edges (from dependsOn) ──────────────────────────────────
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
          markerEnd: "arrow",
        });
      }
    }
  }

  // ── Kafka edges (correlate producers → consumers via shared topic) ────────
  // Build topic → [serviceId] consumer map
  const topicConsumers = new Map<string, string[]>();
  for (const svc of services) {
    for (const consumer of svc.kafkaConsumers ?? []) {
      for (const topic of consumer.topics) {
        if (!topicConsumers.has(topic)) topicConsumers.set(topic, []);
        topicConsumers.get(topic)!.push(svc.id);
      }
    }
  }

  for (const svc of services) {
    for (const producer of svc.kafkaProducers ?? []) {
      const consumers = topicConsumers.get(producer.topic) ?? [];
      for (const consumerId of consumers) {
        if (consumerId === svc.id) continue; // skip self-loops
        const edgeId = `kafka:${svc.id}→${consumerId}:${producer.topic}`;
        if (!edgeSet.has(edgeId)) {
          edgeSet.add(edgeId);
          edges.push({
            id: edgeId,
            source: svc.id,
            target: consumerId,
            label: producer.topic,
            animated: true,
            markerEnd: "arrow",
          });
        }
      }
    }
  }

  return { nodes, edges };
}
