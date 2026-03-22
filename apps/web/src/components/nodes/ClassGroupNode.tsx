"use client";

import { Handle, Position } from "@xyflow/react";
import type { NodeProps } from "@xyflow/react";
import type { FunctionKind } from "@/lib/classify";

interface ClassGroupNodeData {
  className: string;
  serviceName: string;
  serviceId: string;
  functionCount: number;
  dominantKind: FunctionKind;
  isCollapsed: boolean;
}

const KIND_ACCENT: Partial<Record<FunctionKind, string>> = {
  controller: "bg-blue-500",
  "kafka-consumer": "bg-purple-500",
  scheduler: "bg-orange-500",
  service: "bg-amber-600",
  repository: "bg-green-700",
};

const KIND_BORDER: Partial<Record<FunctionKind, string>> = {
  controller: "border-blue-900",
  "kafka-consumer": "border-purple-900",
  scheduler: "border-orange-900",
  service: "border-amber-900",
  repository: "border-green-900",
};

export default function ClassGroupNode({ data }: NodeProps) {
  const d = data as unknown as ClassGroupNodeData;
  const accent = KIND_ACCENT[d.dominantKind] ?? "bg-gray-700";
  const border = KIND_BORDER[d.dominantKind] ?? "border-gray-700";

  return (
    <>
      <Handle type="target" position={Position.Top}    id="target-top" />
      <Handle type="target" position={Position.Left}   id="target-left" />
      <Handle type="target" position={Position.Right}  id="target-right" />
      <Handle type="target" position={Position.Bottom} id="target-bottom" />
      <div
        className={`w-full h-full rounded-lg border ${border} overflow-hidden cursor-pointer select-none`}
      >
        {/* Header */}
        <div className={`flex items-center gap-1.5 px-2.5 py-2.5 border-b ${border}`}
             style={{ background: "rgba(17,24,39,0.95)" }}>
          <div className={`w-1 h-4 rounded-sm shrink-0 ${accent}`} />
          <span className="text-gray-200 text-[11px] font-mono font-semibold truncate flex-1">
            {d.className}
          </span>
          <span className="text-gray-500 text-[10px] shrink-0 ml-1">
            {d.isCollapsed ? `▸ ${d.functionCount}` : "▾"}
          </span>
        </div>
        {/* Collapsed hint */}
        {d.isCollapsed && (
          <div className="px-3 py-2 text-gray-600 text-[10px]">
            {d.functionCount} function{d.functionCount !== 1 ? "s" : ""} — click to expand
          </div>
        )}
      </div>
      <Handle type="source" position={Position.Top}    id="source-top" />
      <Handle type="source" position={Position.Left}   id="source-left" />
      <Handle type="source" position={Position.Right}  id="source-right" />
      <Handle type="source" position={Position.Bottom} id="source-bottom" />
    </>
  );
}
