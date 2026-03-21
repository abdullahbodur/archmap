"use client";

import { Handle, Position } from "@xyflow/react";
import type { NodeProps } from "@xyflow/react";

interface InfraNodeData {
  name: string;
  technology?: string;
  description?: string;
  ref?: string;
}

export default function QueueNode({ data }: NodeProps) {
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
      <div className="bg-gray-900 border border-purple-700 rounded-lg p-3 min-w-[160px] max-w-[220px] shadow-lg">
        <div className="flex items-center gap-2 mb-1">
          <span className="text-xs bg-purple-900 text-purple-300 px-1.5 py-0.5 rounded font-mono">QUEUE</span>
          {/* Parallel lines icon */}
          <svg className="w-3.5 h-3.5 text-purple-500 shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
            <line x1="3" y1="6" x2="21" y2="6" />
            <line x1="3" y1="12" x2="21" y2="12" />
            <line x1="3" y1="18" x2="21" y2="18" />
          </svg>
          <span className="text-white font-semibold text-sm truncate">{d.name}</span>
        </div>
        {d.technology && (
          <p className="text-xs text-purple-400 truncate">{d.technology}</p>
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
