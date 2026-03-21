"use client";

import { useState } from "react";
import GraphView from "./GraphView";
import GraphTabs, { type ViewTab } from "./GraphTabs";
import type { GraphData } from "@/types/graph";

interface Props {
  graph: GraphData;
}

export default function ArchMapShell({ graph }: Props) {
  const [activeTab, setActiveTab] = useState<ViewTab>("serviceFlow");
  const [selectedServiceId, setSelectedServiceId] = useState<string | null>(null);

  const view = graph.views[activeTab];
  const serviceCount = graph.services?.length ?? 0;
  const services = (graph.services ?? []).map((s) => ({ id: s.id, name: s.name }));
  const allServices = graph.services ?? [];

  function handleDrillIn(serviceId: string) {
    setSelectedServiceId(serviceId);
    setActiveTab("functionFlow");
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
