"use client";

import { Handle, Position } from "@xyflow/react";
import type { NodeProps } from "@xyflow/react";

interface InfraNodeData {
  name: string;
  technology?: string;
  description?: string;
  ref?: string;
}

export default function CacheNode({ data }: NodeProps) {
  const d = data as unknown as InfraNodeData;
  const refLabel = d.ref
    ? d.ref.includes("?ref=") || (d.ref.includes("/") && !d.ref.startsWith("./"))
      ? d.ref.replace(/^([^/]+)\/.*\?ref=(.+)$/, "$1@$2")
      : d.ref
    : null;

  return (
    <>
      <Handle type="target" position={Position.Top}    id="target-top" />
      <Handle type="target" position={Position.Left}   id="target-left" />
      <Handle type="target" position={Position.Right}  id="target-right" />
      <Handle type="target" position={Position.Bottom} id="target-bottom" />
      <div className="bg-gray-900 border border-amber-700 rounded-lg p-3 min-w-[160px] max-w-[220px] shadow-lg">
        <div className="flex items-center gap-2 mb-1">
          <span className="text-xs bg-amber-900 text-amber-300 px-1.5 py-0.5 rounded font-mono">CACHE</span>
          <span className="text-white font-semibold text-sm truncate">{d.name}</span>
        </div>
        {d.technology && (
          <p className="text-xs text-amber-400 truncate">{d.technology}</p>
        )}
        {d.description && (
          <p className="text-xs text-gray-400 mt-1 line-clamp-2">{d.description}</p>
        )}
        {refLabel && (
          <p className="text-xs text-gray-600 mt-1 truncate" title={d.ref}>{refLabel}</p>
        )}
      </div>
      <Handle type="source" position={Position.Top}    id="source-top" />
      <Handle type="source" position={Position.Left}   id="source-left" />
      <Handle type="source" position={Position.Right}  id="source-right" />
      <Handle type="source" position={Position.Bottom} id="source-bottom" />
    </>
  );
}
