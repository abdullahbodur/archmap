"use client";

import { useEffect, useCallback } from "react";
import {
  ReactFlow,
  Background,
  Controls,
  MiniMap,
  Panel,
  useNodesState,
  useEdgesState,
  useReactFlow,
  BackgroundVariant,
  ReactFlowProvider,
} from "@xyflow/react";
import "@xyflow/react/dist/style.css";
import type { GraphView as GraphViewData, AnalyzedService } from "@/types/graph";
import type { ViewTab } from "./GraphTabs";
import { buildKindMap } from "@/lib/classify";
import ServiceNode from "./nodes/ServiceNode";
import DataTypeNode from "./nodes/DataTypeNode";
import FunctionNode from "./nodes/FunctionNode";
import DatabaseNode from "./nodes/DatabaseNode";
import QueueNode from "./nodes/QueueNode";
import CacheNode from "./nodes/CacheNode";
import ExternalNode from "./nodes/ExternalNode";
import ServiceSearch from "./ServiceSearch";
import { applyDagreLayout } from "@/lib/layout";

const nodeTypes = {
  serviceNode: ServiceNode,
  dataTypeNode: DataTypeNode,
  functionNode: FunctionNode,
  databaseNode: DatabaseNode,
  queueNode: QueueNode,
  cacheNode: CacheNode,
  externalNode: ExternalNode,
};

interface Props {
  view: GraphViewData;
  viewType: ViewTab;
  serviceCount: number;
  services: { id: string; name: string }[];
  allServices: AnalyzedService[];
  selectedServiceId: string | null;
  onSelectedServiceChange: (id: string | null) => void;
  onDrillIn: (serviceId: string) => void;
}

function GraphCanvas({
  view,
  viewType,
  services,
  allServices,
  selectedServiceId,
  onSelectedServiceChange,
  onDrillIn,
}: Omit<Props, "serviceCount">) {
  // Compute filtered nodes/edges for functionFlow
  const serviceFilteredNodes =
    viewType === "functionFlow" && selectedServiceId
      ? view.nodes.filter((n) => (n.data as any).serviceId === selectedServiceId)
      : view.nodes;

  const serviceFilteredNodeIds = new Set(serviceFilteredNodes.map((n) => n.id));

  const filteredEdges =
    viewType === "functionFlow" && selectedServiceId
      ? view.edges.filter(
          (e) => serviceFilteredNodeIds.has(e.source) && serviceFilteredNodeIds.has(e.target)
        )
      : view.edges;

  // Filter orphan nodes in functionFlow
  const filteredNodes = viewType === "functionFlow"
    ? (() => {
        const connectedIds = new Set(filteredEdges.flatMap((e) => [e.source, e.target]));
        return serviceFilteredNodes.filter((n) => connectedIds.has(n.id));
      })()
    : serviceFilteredNodes;

  // Enrich function nodes with kind metadata
  const enrichedNodes = viewType === "functionFlow"
    ? (() => {
        const kindMap = buildKindMap(filteredNodes, allServices);
        return filteredNodes.map((n) => {
          const meta = kindMap.get(n.id);
          return meta ? { ...n, data: { ...n.data, ...meta } } : n;
        });
      })()
    : filteredNodes;

  const [nodes, setNodes, onNodesChange] = useNodesState(enrichedNodes as any);
  const [edges, setEdges, onEdgesChange] = useEdgesState(filteredEdges as any);
  const { fitView } = useReactFlow();

  useEffect(() => {
    setNodes(enrichedNodes as any);
    setEdges(filteredEdges as any);
  }, [view, viewType, selectedServiceId, setNodes, setEdges]); // eslint-disable-line react-hooks/exhaustive-deps

  const handleAutoLayout = useCallback(() => {
    const laid = applyDagreLayout(nodes as any, edges as any);
    setNodes(laid as any);
    setTimeout(() => fitView({ duration: 400 }), 50);
  }, [nodes, edges, setNodes, fitView]);

  return (
    <ReactFlow
      key={`${viewType}-${selectedServiceId ?? "all"}`}
      nodes={nodes}
      edges={edges}
      onNodesChange={onNodesChange}
      onEdgesChange={onEdgesChange}
      nodeTypes={nodeTypes}
      onNodeClick={(_, node) => {
        if (viewType === "serviceFlow" && node.type === "serviceNode") {
          onDrillIn(node.id);
        }
      }}
      fitView
      colorMode="dark"
    >
      <Background variant={BackgroundVariant.Dots} gap={16} size={1} color="#374151" />
      <Controls />
      <MiniMap
        nodeColor="#3b82f6"
        maskColor="rgba(0,0,0,0.7)"
        style={{ background: "#111827" }}
      />
      <Panel position="top-right">
        <button
          onClick={handleAutoLayout}
          className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-md bg-gray-800 border border-gray-600 text-gray-200 hover:bg-gray-700 hover:border-gray-500 transition-colors shadow"
          title="Auto-arrange nodes with dagre layout"
        >
          <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
              d="M4 5h16M4 12h10M4 19h7" />
          </svg>
          Auto Layout
        </button>
      </Panel>
      {viewType === "functionFlow" && (
        <Panel position="top-left">
          <div className="flex items-center gap-3 bg-gray-900/80 border border-gray-700 rounded-md px-3 py-1.5 backdrop-blur">
            <span className="text-xs text-gray-400">Service:</span>
            <ServiceSearch
              services={services}
              selectedId={selectedServiceId}
              onChange={onSelectedServiceChange}
            />
          </div>
        </Panel>
      )}
    </ReactFlow>
  );
}

export default function GraphView({
  view,
  viewType,
  serviceCount,
  services,
  allServices,
  selectedServiceId,
  onSelectedServiceChange,
  onDrillIn,
}: Props) {
  if (serviceCount === 0) {
    return (
      <div className="w-full h-full flex items-center justify-center text-gray-500">
        <div className="text-center">
          <p className="text-lg font-medium text-gray-400">No graph data yet</p>
          <p className="text-sm mt-1">Run the scanner to generate your architecture map</p>
        </div>
      </div>
    );
  }

  // Function flow empty state when no service selected
  if (viewType === "functionFlow" && !selectedServiceId) {
    return (
      <div className="w-full h-full flex flex-col items-center justify-center text-gray-500 gap-4">
        <ServiceSearch
          services={services}
          selectedId={selectedServiceId}
          onChange={onSelectedServiceChange}
        />
        <p className="text-sm text-gray-500">or click a service node in Service Flow</p>
      </div>
    );
  }

  const filteredNodes =
    viewType === "functionFlow" && selectedServiceId
      ? view.nodes.filter((n) => (n.data as any).serviceId === selectedServiceId)
      : view.nodes;

  if (filteredNodes.length === 0) {
    return (
      <div className="w-full h-full flex items-center justify-center text-gray-500">
        <div className="text-center">
          <p className="text-gray-400">No data for this view</p>
          <p className="text-sm mt-1 text-gray-600">
            {viewType === "dataFlow"
              ? "No DTOs/data types detected"
              : viewType === "functionFlow"
              ? "No functions detected in scanned services"
              : viewType === "containerDiagram"
              ? "No infrastructure declared in archmap.yml files"
              : "No services detected"}
          </p>
        </div>
      </div>
    );
  }

  return (
    <ReactFlowProvider>
      <GraphCanvas
        view={view}
        viewType={viewType}
        services={services}
        allServices={allServices}
        selectedServiceId={selectedServiceId}
        onSelectedServiceChange={onSelectedServiceChange}
        onDrillIn={onDrillIn}
      />
    </ReactFlowProvider>
  );
}
