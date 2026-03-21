"use client";

import {
  ReactFlow,
  Background,
  Controls,
  MiniMap,
  useNodesState,
  useEdgesState,
  BackgroundVariant,
} from "@xyflow/react";
import "@xyflow/react/dist/style.css";
import type { GraphView as GraphViewData } from "@/types/graph";
import type { ViewTab } from "./GraphTabs";
import ServiceNode from "./nodes/ServiceNode";
import DataTypeNode from "./nodes/DataTypeNode";
import FunctionNode from "./nodes/FunctionNode";

const nodeTypes = {
  serviceNode: ServiceNode,
  dataTypeNode: DataTypeNode,
  functionNode: FunctionNode,
};

interface Props {
  view: GraphViewData;
  viewType: ViewTab;
  serviceCount: number;
}

export default function GraphView({ view, viewType, serviceCount }: Props) {
  const [nodes, , onNodesChange] = useNodesState(view.nodes as any);
  const [edges, , onEdgesChange] = useEdgesState(view.edges as any);

  if (serviceCount === 0) {
    return (
      <div className="w-full h-full flex items-center justify-center text-gray-500">
        <div className="text-center">
          <div className="text-4xl mb-4">📡</div>
          <p className="text-lg font-medium text-gray-400">No graph data yet</p>
          <p className="text-sm mt-1">Run the scanner to generate your architecture map</p>
        </div>
      </div>
    );
  }

  if (nodes.length === 0) {
    return (
      <div className="w-full h-full flex items-center justify-center text-gray-500">
        <div className="text-center">
          <p className="text-gray-400">No data for this view</p>
          <p className="text-sm mt-1 text-gray-600">
            {viewType === "dataFlow"
              ? "No DTOs/data types detected"
              : viewType === "functionFlow"
              ? "No cross-service function calls detected"
              : "No services detected"}
          </p>
        </div>
      </div>
    );
  }

  return (
    <ReactFlow
      key={viewType}
      nodes={nodes}
      edges={edges}
      onNodesChange={onNodesChange}
      onEdgesChange={onEdgesChange}
      nodeTypes={nodeTypes}
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
    </ReactFlow>
  );
}
