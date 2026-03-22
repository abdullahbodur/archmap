"use client";

import { useEffect, useCallback, useMemo, useRef, useState } from "react";
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
import { buildKindMap, type FunctionKind } from "@/lib/classify";
import { buildServiceContainerView } from "@/lib/buildServiceContainer";
import { COLLAPSED_H } from "@/lib/buildFunctionFlowView";
import ServiceNode from "./nodes/ServiceNode";
import DataTypeNode from "./nodes/DataTypeNode";
import FunctionNode from "./nodes/FunctionNode";
import ClassGroupNode from "./nodes/ClassGroupNode";
import DatabaseNode from "./nodes/DatabaseNode";
import QueueNode from "./nodes/QueueNode";
import CacheNode from "./nodes/CacheNode";
import ExternalNode from "./nodes/ExternalNode";
import ServiceSearch from "./ServiceSearch";
import DtoJsonModal from "./DtoJsonModal";
import { getLayoutedElements } from "@/lib/layout";
import type { DataType } from "@/types/graph";

const nodeTypes = {
  serviceNode: ServiceNode,
  dataTypeNode: DataTypeNode,
  functionNode: FunctionNode,
  classGroupNode: ClassGroupNode,
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
// Curvature values assigned round-robin to parallel edges so they arc apart
const PARALLEL_CURVATURES = [0.3, 0.6, 0.15, 0.75, 0.45];

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

  // Count parallel edges (same source→target) to assign different curvatures
  const pairCount = new Map<string, number>();
  const pairIndex = new Map<string, number>();
  for (const e of edges) {
    const key = `${e.source}→${e.target}`;
    pairCount.set(key, (pairCount.get(key) ?? 0) + 1);
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

    // Assign different curvatures to parallel edges so they arc apart visually
    const pairKey = `${e.source}→${e.target}`;
    const total = pairCount.get(pairKey) ?? 1;
    const idx   = pairIndex.get(pairKey) ?? 0;
    pairIndex.set(pairKey, idx + 1);
    const curvature = total > 1
      ? PARALLEL_CURVATURES[idx % PARALLEL_CURVATURES.length]
      : 0.25;

    const markerEnd = e.markerEnd
      ? typeof e.markerEnd === "string"
        ? { type: "arrowclosed", width: 16, height: 16 }
        : e.markerEnd
      : undefined;

    return {
      ...e,
      type: "bezier",
      sourceHandle,
      targetHandle,
      pathOptions: { curvature },
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
  const [selectedDto, setSelectedDto] = useState<DataType | null>(null);
  const [hiddenKinds, setHiddenKinds] = useState<Set<FunctionKind>>(new Set());
  const [collapsedGroups, setCollapsedGroups] = useState<Set<string>>(new Set());
  const [selectedNodeId, setSelectedNodeId] = useState<string | null>(null);

  // ── 0. Per-service container view (built dynamically in the frontend) ─────
  // Must be memoised — buildServiceContainerView allocates new arrays every call,
  // so an unmemoised value would change reference on every render and trigger the
  // laidNodes memo → useEffect → setNodes infinite loop.
  const activeView: GraphViewData = useMemo(() => {
    if (viewType === "containerDiagram" && selectedServiceId) {
      const svc = allServices.find((s) => s.id === selectedServiceId);
      if (svc) return buildServiceContainerView(svc, allServices);
    }
    return view;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [viewType, selectedServiceId, view]);

  // ── 1. Filter nodes and edges ─────────────────────────────────────────────
  const isServiceFiltered = (viewType === "functionFlow" || viewType === "dataFlow") && selectedServiceId;

  const serviceFilteredNodes = isServiceFiltered
    ? activeView.nodes.filter((n) => (n.data as any).serviceId === selectedServiceId)
    : activeView.nodes;

  const serviceFilteredNodeIds = new Set(serviceFilteredNodes.map((n) => n.id));

  const filteredEdges = isServiceFiltered
    ? activeView.edges.filter(
        (e) => serviceFilteredNodeIds.has(e.source) && serviceFilteredNodeIds.has(e.target)
      )
    : activeView.edges;

  const filteredNodes = isServiceFiltered
    ? (() => {
        // dataFlow and functionFlow: show all nodes for the service (no connectivity filter)
        if (viewType === "dataFlow" || viewType === "functionFlow") return serviceFilteredNodes;
        const connectedIds = new Set(filteredEdges.flatMap((e) => [e.source, e.target]));
        return serviceFilteredNodes.filter((n) => connectedIds.has(n.id));
      })()
    : serviceFilteredNodes;

  // ── 1b. Function flow: kind filter + collapse ─────────────────────────────
  let fnFlowNodes = filteredNodes;
  let fnFlowEdges = filteredEdges;

  if (viewType === "functionFlow") {
    const hiddenNodeIds = new Set<string>();

    fnFlowNodes = filteredNodes
      .map((n) => {
        if (n.type === "classGroupNode") {
          const isCollapsed = collapsedGroups.has(n.id);
          return {
            ...n,
            data: { ...n.data, isCollapsed },
            style: { ...n.style, height: isCollapsed ? COLLAPSED_H : n.style?.height },
          };
        }
        // Function node: mark as hidden if its group is collapsed or kind is filtered
        if (n.parentId && collapsedGroups.has(n.parentId)) {
          hiddenNodeIds.add(n.id);
        } else if (hiddenKinds.has((n.data as any).kind as FunctionKind)) {
          hiddenNodeIds.add(n.id);
        }
        return n;
      })
      .filter((n) => !hiddenNodeIds.has(n.id));

    // Remove groups that have no visible children — but keep collapsed groups
    // (their children are intentionally hidden, not absent)
    const nonEmptyGroupIds = new Set(fnFlowNodes.filter((n) => n.parentId).map((n) => n.parentId!));
    fnFlowNodes = fnFlowNodes.filter(
      (n) => n.type !== "classGroupNode" || nonEmptyGroupIds.has(n.id) || collapsedGroups.has(n.id)
    );

    const visibleIds = new Set(fnFlowNodes.map((n) => n.id));
    fnFlowEdges = filteredEdges.filter(
      (e) => visibleIds.has(e.source) && visibleIds.has(e.target)
    );
  }

  // ── 2. Enrich and assign z-index ──────────────────────────────────────────
  // functionFlow nodes already have kind/httpMethod/path/topics from the builder
  const enrichedNodes = viewType === "functionFlow"
    ? fnFlowNodes
    : filteredNodes;


  // ── 3. Dagre layout (memoised — re-runs only when view data changes) ───────
  // containerDiagram skips dagre: nodes already have hand-crafted positions and
  // use parent/child (group) relationships that dagre doesn't understand.
  const laidNodes = useMemo(() => {
    if (viewType === "containerDiagram" || viewType === "functionFlow") return enrichedNodes;
    const { nodes } = getLayoutedElements(enrichedNodes as any, fnFlowEdges as any);
    return nodes;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeView, viewType, selectedServiceId, collapsedGroups, hiddenKinds]);

  // ── 4. Route edges using laid-out positions ───────────────────────────────
  const rfEdges = useMemo(() => {
    const map = new Map((laidNodes as any[]).map((n: any) => [n.id, n]));
    // functionFlow edges already have markerEnd:"arrow" from the builder; strip labels
    const edgesToRoute = viewType === "functionFlow"
      ? fnFlowEdges.map((e) => ({ ...e, label: undefined }))
      : fnFlowEdges;
    return routeEdges(edgesToRoute, map);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [laidNodes]);

  // Ref to avoid stale closure in deferred re-route callbacks
  const filteredEdgesRef = useRef(fnFlowEdges);
  filteredEdgesRef.current = fnFlowEdges;

  // ── 5. React Flow state ───────────────────────────────────────────────────
  const [nodes, setNodes, onNodesChange] = useNodesState(laidNodes as any);
  const [edges, setEdges, onEdgesChange] = useEdgesState(rfEdges as any);
  const { fitView, getNodes } = useReactFlow();

  // ── 6. Edge highlight based on selected node ──────────────────────────────
  const displayEdges = useMemo(() => {
    if (!selectedNodeId) return edges;
    return (edges as any[]).map((e: any) => {
      const connected = e.source === selectedNodeId || e.target === selectedNodeId;
      return {
        ...e,
        style: {
          ...e.style,
          stroke: connected ? "#f59e0b" : "#1f2937",
          strokeWidth: connected ? 2.5 : 1,
          opacity: connected ? 1 : 0.15,
        },
      };
    });
  }, [edges, selectedNodeId]);

  // Sync state whenever the laid-out data changes (view switch, filter change)
  useEffect(() => {
    setNodes(laidNodes as any);
    setEdges(rfEdges as any);

    if (viewType === "containerDiagram" || viewType === "functionFlow") {
      // Second pass: re-route once React Flow has measured actual node dimensions.
      // Use getNodes() (reads React Flow's Zustand store synchronously) to avoid
      // stale positions from batched React state.
      const timer = setTimeout(() => {
        const nm = new Map(getNodes().map((n: any) => [n.id, n]));
        const edgesForReroute = viewType === "functionFlow"
          ? filteredEdgesRef.current.map((e: any) => ({ ...e, label: undefined }))
          : filteredEdgesRef.current;
        setEdges(routeEdges(edgesForReroute, nm) as any);
        fitView({ duration: 300 });
      }, 150);
      return () => clearTimeout(timer);
    }

    setTimeout(() => fitView({ duration: 300 }), 50);
  }, [laidNodes, rfEdges, setNodes, setEdges, fitView]);

  // Manual re-layout: uses measured dimensions from current state and re-routes
  // edges from the original (unprocessed) filteredEdges to avoid double-
  // converting markerEnd.
  const handleAutoLayout = useCallback(() => {
    if (viewType === "containerDiagram" || viewType === "functionFlow") {
      // No dagre — just re-route with current measured positions, then fitView.
      // getNodes() reads React Flow's Zustand store directly (never stale).
      const nm = new Map(getNodes().map((n: any) => [n.id, n]));
      const edgesForReroute = viewType === "functionFlow"
        ? filteredEdgesRef.current.map((e: any) => ({ ...e, label: undefined }))
        : filteredEdgesRef.current;
      setEdges(routeEdges(edgesForReroute, nm) as any);
      setTimeout(() => fitView({ duration: 400 }), 50);
    } else {
      // Re-run with actual measured dimensions (available after first render).
      const { nodes: laid } = getLayoutedElements(nodes as any, filteredEdges as any);
      const nm = new Map(laid.map((n: any) => [n.id, n]));
      setNodes(laid as any);
      setEdges(routeEdges(filteredEdges, nm) as any);
      setTimeout(() => fitView({ duration: 400 }), 50);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [nodes, filteredEdges, viewType, getNodes, setNodes, setEdges, fitView]);

  return (
    <>
    <ReactFlow
      key={`${viewType}-${selectedServiceId ?? "all"}`}
      nodes={nodes}
      edges={displayEdges}
      onNodesChange={onNodesChange}
      onEdgesChange={onEdgesChange}
      nodeTypes={nodeTypes}
      onPaneClick={() => setSelectedNodeId(null)}
      onNodeDragStop={() => {
        if (viewType !== "containerDiagram") return;
        // getNodes() reads React Flow's Zustand store synchronously — guaranteed
        // to have the final drag-end position of every node (bypasses React
        // batching, so never stale unlike setNodes(current => ...) pattern).
        const nm = new Map(getNodes().map((n: any) => [n.id, n]));
        setEdges(routeEdges(filteredEdgesRef.current, nm) as any);
      }}
      onNodeClick={(_, node) => {
        // DTO click → show JSON example popup
        if (node.type === "dataTypeNode") {
          const name = (node.data as any).name as string;
          const dto = allServices.flatMap((s) => s.dataTypes).find((d) => d.name === name);
          if (dto) setSelectedDto(dto);
          setSelectedNodeId(node.id);
          return;
        }
        // Class group click → toggle collapse
        if (node.type === "classGroupNode") {
          setCollapsedGroups((prev) => {
            const next = new Set(prev);
            if (next.has(node.id)) next.delete(node.id);
            else next.add(node.id);
            return next;
          });
          setSelectedNodeId(node.id);
          return;
        }
        if (viewType === "serviceFlow" && node.type === "serviceNode") {
          onDrillIn(node.id);
          return;
        }
        // External service nodes in container diagram → navigate to their container
        if (
          viewType === "containerDiagram" &&
          node.type === "serviceNode" &&
          !node.parentId
        ) {
          onDrillIn(node.id);
          return;
        }
        setSelectedNodeId((prev) => (prev === node.id ? null : node.id));
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
      {(viewType === "functionFlow" || viewType === "containerDiagram" || viewType === "dataFlow") && (
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
      {viewType === "functionFlow" && (
        <Panel position="bottom-left">
          <div className="flex items-center gap-1.5 bg-gray-900/90 border border-gray-700 rounded-md px-3 py-2 backdrop-blur">
            <span className="text-[10px] text-gray-500 mr-0.5">Hide:</span>
            {(
              [
                ["service",        "SERVICE",   "border-amber-700 text-amber-400"],
                ["controller",     "HTTP",      "border-blue-700 text-blue-400"],
                ["kafka-consumer", "CONSUMER",  "border-purple-700 text-purple-400"],
                ["repository",     "REPO",      "border-green-800 text-green-400"],
                ["scheduler",      "SCHEDULED", "border-orange-700 text-orange-400"],
              ] as [FunctionKind, string, string][]
            ).map(([kind, label, colorCls]) => (
              <button
                key={kind}
                onClick={() =>
                  setHiddenKinds((prev) => {
                    const next = new Set(prev);
                    if (next.has(kind)) next.delete(kind);
                    else next.add(kind);
                    return next;
                  })
                }
                className={`text-[10px] px-1.5 py-0.5 rounded border font-mono transition-opacity ${colorCls} ${
                  hiddenKinds.has(kind) ? "opacity-30" : "opacity-100"
                }`}
              >
                {label}
              </button>
            ))}
          </div>
        </Panel>
      )}
    </ReactFlow>
    {selectedDto && (
      <DtoJsonModal
        dto={selectedDto}
        allServices={allServices}
        onClose={() => setSelectedDto(null)}
      />
    )}
    </>

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

  if ((viewType === "functionFlow" || viewType === "containerDiagram" || viewType === "dataFlow") && !selectedServiceId) {
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
    (viewType === "functionFlow" || viewType === "dataFlow") && selectedServiceId
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
