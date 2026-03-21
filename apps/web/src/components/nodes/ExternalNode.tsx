"use client";

import { Handle, Position } from "@xyflow/react";
import type { NodeProps } from "@xyflow/react";

interface InfraNodeData {
  name: string;
  technology?: string;
  description?: string;
  ref?: string;
}

export default function ExternalNode({ data }: NodeProps) {
  const d = data as unknown as InfraNodeData;
  const refLabel = d.ref
    ? d.ref.includes("?ref=") || (d.ref.includes("/") && !d.ref.startsWith("./"))
      ? d.ref.replace(/^([^/]+)\/.*\?ref=(.+)$/, "$1@$2")
      : d.ref
    : null;

  return (
    <>
      <Handle type="target" position={Position.Top} />
      <div className="bg-gray-900 border border-gray-600 border-dashed rounded-lg p-3 min-w-[160px] max-w-[220px] shadow-lg">
        <div className="flex items-center gap-2 mb-1">
          <span className="text-xs bg-gray-800 text-gray-400 px-1.5 py-0.5 rounded font-mono">EXT</span>
          <span className="text-white font-semibold text-sm truncate">{d.name}</span>
        </div>
        {d.technology && (
          <p className="text-xs text-gray-400 truncate">{d.technology}</p>
        )}
        {d.description && (
          <p className="text-xs text-gray-500 mt-1 line-clamp-2">{d.description}</p>
        )}
        {refLabel && (
          <p className="text-xs text-gray-600 mt-1 truncate" title={d.ref}>{refLabel}</p>
        )}
      </div>
      <Handle type="source" position={Position.Bottom} />
    </>
  );
}
