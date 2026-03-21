"use client";

import { useEffect, useCallback, useMemo } from "react";
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

// ─── Edge routing helpers ─────────────────────────────────────────────────────

/**
 * Returns the absolute canvas center of a node. For child nodes (parentId set)
 * the parent top-left is added so all positions share the same coordinate space.
 */
function getAbsoluteCenter(
  nodeId: string,
  nodeMap: Map<string, any>
): { x: number; y: number } {
  const n = nodeMap.get(nodeId);
  if (!n) return { x: 0, y: 0 };
  const w = n.measured?.width ?? 260;
  const h = n.measured?.height ?? 160;
  let x = (n.position?.x ?? 0) + w / 2;
  let y = (n.position?.y ?? 0) + h / 2;
  if (n.parentId) {
    const parent = nodeMap.get(n.parentId);
    if (parent) {
      x += parent.position?.x ?? 0;
      y += parent.position?.y ?? 0;
    }
  }
  return { x, y };
}

/**
 * Assigns sourceHandle / targetHandle and enforces smoothstep routing so edges
 * travel through the channels between nodes rather than crossing node boxes.
 *
 * A per-node per-handle occupancy counter distributes multiple edges that leave
 * the same node on the same side to different dock points instead of stacking.
 *
 * Priority order for each direction:
 *   going right  → right, bottom, top, left
 *   going left   → left,  bottom, top, right
 *   going down   → bottom, right, left, top
 *   going up     → top,   right, left, bottom
 */
function routeEdges(edges: any[], nodeMap: Map<string, any>): any[] {
  const usage = new Map<string, number>(); // `${nodeId}:${handleId}` → count

  function inc(nodeId: string, handleId: string) {
    const key = `${nodeId}:${handleId}`;
    usage.set(key, (usage.get(key) ?? 0) + 1);
  }

  function pickHandle(nodeId: string, prefs: string[]): string {
    let best = prefs[0];
    let bestCount = usage.get(`${nodeId}:${best}`) ?? 0;
    for (let i = 1; i < prefs.length; i++) {
      const c = usage.get(`${nodeId}:${prefs[i]}`) ?? 0;
      if (c < bestCount) { bestCount = c; best = prefs[i]; }
    }
    return best;
  }

  return edges.map((e) => {
    const src = getAbsoluteCenter(e.source, nodeMap);
    const tgt = getAbsoluteCenter(e.target, nodeMap);
    const dx = tgt.x - src.x;
    const dy = tgt.y - src.y;

    let srcPrefs: string[];
    let tgtPrefs: string[];

    if (Math.abs(dx) >= Math.abs(dy)) {
      if (dx >= 0) {
        srcPrefs = ["source-right", "source-bottom", "source-top", "source-left"];
        tgtPrefs = ["target-left",  "target-bottom", "target-top", "target-right"];
      } else {
        srcPrefs = ["source-left",  "source-bottom", "source-top", "source-right"];
        tgtPrefs = ["target-right", "target-bottom", "target-top", "target-left"];
      }
    } else {
      if (dy >= 0) {
        srcPrefs = ["source-bottom", "source-right", "source-left", "source-top"];
        tgtPrefs = ["target-top",    "target-right", "target-left", "target-bottom"];
      } else {
        srcPrefs = ["source-top",    "source-right", "source-left", "source-bottom"];
        tgtPrefs = ["target-bottom", "target-right", "target-left", "target-top"];
      }
    }

    const sourceHandle = pickHandle(e.source, srcPrefs);
    const targetHandle = pickHandle(e.target, tgtPrefs);
    inc(e.source, sourceHandle);
    inc(e.target, targetHandle);

    // markerEnd: accept both string "arrow" (from graph-builder) and already-
    // converted { type: "arrow" } objects (when re-routing after auto-layout).
    const markerEnd = e.markerEnd
      ? typeof e.markerEnd === "string" ? { type: e.markerEnd } : e.markerEnd
      : undefined;

    return {
      ...e,
      // smoothstep produces orthogonal (right-angle) paths that travel through
      // the channels between nodes instead of cutting diagonally across them.
      type: e.type ?? "smoothstep",
      sourceHandle,
      targetHandle,
...(markerEnd ? { markerEnd } : {}),
    };
  });
}

// ─── Canvas component ─────────────────────────────────────────────────────────

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
  // ── 1. Filter nodes and edges ─────────────────────────────────────────────
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

  const filteredNodes = viewType === "functionFlow"
    ? (() => {
        const connectedIds = new Set(filteredEdges.flatMap((e) => [e.source, e.target]));
        return serviceFilteredNodes.filter((n) => connectedIds.has(n.id));
      })()
    : serviceFilteredNodes;

  // ── 2. Enrich and assign z-index ──────────────────────────────────────────
  const enrichedNodes = viewType === "functionFlow"
    ? (() => {
        const kindMap = buildKindMap(filteredNodes, allServices);
        return filteredNodes.map((n) => {
          const meta = kindMap.get(n.id);
          return meta ? { ...n, data: { ...n.data, ...meta } } : n;
        });
      })()
    : filteredNodes;

  // ── 3. Dagre layout (memoised — re-runs only when view data changes) ───────
  // Applying layout before routing means handle selection is based on the
  // final node positions, so edge dock assignments are accurate.
  // On first render node.measured is undefined; dagre uses the hardcoded
  // defaults (260×160). The Auto Layout button re-runs with real dimensions.
  const laidNodes = useMemo(
    () => applyDagreLayout(enrichedNodes as any, filteredEdges as any),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [view, viewType, selectedServiceId]
  );

  // ── 4. Route edges using laid-out positions ───────────────────────────────
  const rfEdges = useMemo(() => {
    const map = new Map((laidNodes as any[]).map((n: any) => [n.id, n]));
    return routeEdges(filteredEdges, map);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [laidNodes]);

  // ── 5. React Flow state ───────────────────────────────────────────────────
  const [nodes, setNodes, onNodesChange] = useNodesState(laidNodes as any);
  const [edges, setEdges, onEdgesChange] = useEdgesState(rfEdges as any);
  const { fitView } = useReactFlow();

  // Sync state whenever the laid-out data changes (view switch, filter change)
  useEffect(() => {
    setNodes(laidNodes as any);
    setEdges(rfEdges as any);
    setTimeout(() => fitView({ duration: 300 }), 50);
  }, [laidNodes, rfEdges, setNodes, setEdges, fitView]);

  // Manual re-layout: uses measured dimensions from current state and re-routes
  // edges from the original (unprocessed) filteredEdges to avoid double-
  // converting markerEnd.
  const handleAutoLayout = useCallback(() => {
    const laid = applyDagreLayout(nodes as any, filteredEdges as any);
    const nm = new Map((laid as any[]).map((n: any) => [n.id, n]));
    const rerouted = routeEdges(filteredEdges, nm);
    setNodes(laid as any);
    setEdges(rerouted as any);
    setTimeout(() => fitView({ duration: 400 }), 50);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [nodes, filteredEdges, setNodes, setEdges, fitView]);

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

// ─── Public component ─────────────────────────────────────────────────────────

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
