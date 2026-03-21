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

  const view = graph.views[activeTab];
  const serviceCount = graph.services?.length ?? 0;

  return (
    <div className="flex-1 flex flex-col overflow-hidden">
      <GraphTabs active={activeTab} onChange={setActiveTab} />
      <div className="flex-1">
        <GraphView
          view={view}
          viewType={activeTab}
          serviceCount={serviceCount}
        />
      </div>
    </div>
  );
}
