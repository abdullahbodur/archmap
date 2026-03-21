"use client";

import { Handle, Position } from "@xyflow/react";
import type { NodeProps } from "@xyflow/react";
import type { DataTypeField } from "@/types/graph";

interface DataTypeNodeData {
  name: string;
  fields: DataTypeField[];
  producedBy: string[];
  consumedBy: string[];
}

export default function DataTypeNode({ data }: NodeProps) {
  const d = data as unknown as DataTypeNodeData;

  return (
    <>
      <Handle type="target" position={Position.Top}    id="target-top" />
      <Handle type="target" position={Position.Left}   id="target-left" />
      <Handle type="target" position={Position.Right}  id="target-right" />
      <Handle type="target" position={Position.Bottom} id="target-bottom" />
      <div className="bg-gray-900 border border-purple-800 rounded-lg p-3 min-w-[160px] max-w-[220px] shadow-lg">
        <div className="flex items-center gap-2 mb-1">
          <span className="text-xs bg-purple-900 text-purple-300 px-1.5 py-0.5 rounded">DTO</span>
          <span className="text-white font-semibold text-sm truncate">{d.name}</span>
        </div>
        {d.fields && d.fields.length > 0 && (
          <ul className="space-y-0.5 mt-1">
            {d.fields.slice(0, 6).map((f, i) => (
              <li key={i} className="text-xs font-mono text-gray-300 flex gap-1">
                <span className="text-purple-400 shrink-0">{f.name}</span>
                <span className="text-gray-500">: {f.type}</span>
              </li>
            ))}
            {d.fields.length > 6 && (
              <li className="text-xs text-gray-500">+{d.fields.length - 6} more</li>
            )}
          </ul>
        )}
      </div>
      <Handle type="source" position={Position.Top}    id="source-top" />
      <Handle type="source" position={Position.Left}   id="source-left" />
      <Handle type="source" position={Position.Right}  id="source-right" />
      <Handle type="source" position={Position.Bottom} id="source-bottom" />
    </>
  );
}
