"use client";

import { useState, useMemo } from "react";
import GraphView from "./GraphView";
import GraphTabs, { type ViewTab } from "./GraphTabs";
import type { GraphData } from "@/types/graph";
import { buildDataFlowView } from "@/lib/buildDataFlowView";
import { buildFunctionFlowView } from "@/lib/buildFunctionFlowView";

interface Props {
  graph: GraphData;
}

export default function ArchMapShell({ graph }: Props) {
  const [activeTab, setActiveTab] = useState<ViewTab>("serviceFlow");
  const [selectedServiceId, setSelectedServiceId] = useState<string | null>(null);

  const dataFlowView = useMemo(() => buildDataFlowView(graph.services ?? []), [graph.services]);
  const functionFlowView = useMemo(() => buildFunctionFlowView(graph.services ?? []), [graph.services]);

  const view =
    activeTab === "dataFlow" ? dataFlowView :
    activeTab === "functionFlow" ? functionFlowView :
    graph.views[activeTab];
  const serviceCount = graph.services?.length ?? 0;
  const services = (graph.services ?? []).map((s) => ({ id: s.id, name: s.name }));
  const allServices = graph.services ?? [];

  function handleDrillIn(serviceId: string) {
    setSelectedServiceId(serviceId);
    if (activeTab !== "dataFlow" && activeTab !== "containerDiagram") {
      setActiveTab("functionFlow");
    }
  }

  return (
    <div className="flex-1 flex flex-col overflow-hidden">
      <GraphTabs active={activeTab} onChange={setActiveTab} />
      <div className="flex-1">
        <GraphView
          view={view}
          viewType={activeTab}
          serviceCount={serviceCount}
          services={services}
          allServices={allServices}
          selectedServiceId={selectedServiceId}
          onSelectedServiceChange={setSelectedServiceId}
          onDrillIn={handleDrillIn}
        />
      </div>
    </div>
  );
}
