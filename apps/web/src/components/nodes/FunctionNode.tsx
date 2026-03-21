"use client";

import { Handle, Position } from "@xyflow/react";
import type { NodeProps } from "@xyflow/react";

interface FunctionNodeData {
  name: string;
  serviceName: string;
  serviceId: string;
  signature: string;
}

export default function FunctionNode({ data }: NodeProps) {
  const d = data as unknown as FunctionNodeData;

  return (
    <>
      <Handle type="target" position={Position.Top} />
      <div className="bg-gray-900 border border-amber-800 rounded-lg p-3 min-w-[180px] max-w-[240px] shadow-lg">
        <div className="flex items-center gap-2 mb-1">
          <span className="text-xs bg-amber-900 text-amber-300 px-1.5 py-0.5 rounded shrink-0">fn</span>
          <span className="text-white font-semibold text-sm truncate">{d.name}</span>
        </div>
        <p className="text-gray-500 text-xs mb-1 truncate">{d.serviceName}</p>
        {d.signature && (
          <p className="text-gray-400 text-xs font-mono truncate">{d.signature}</p>
        )}
      </div>
      <Handle type="source" position={Position.Bottom} />
    </>
  );
}
