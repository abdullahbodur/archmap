"use client";

import { Handle, Position } from "@xyflow/react";
import type { NodeProps } from "@xyflow/react";
import type { DataTypeField } from "@/types/graph";

interface DataTypeNodeData {
  name: string;
  fields: DataTypeField[];
  producedBy: string[];
  consumedBy: string[];
  isEnum?: boolean;
}

export default function DataTypeNode({ data }: NodeProps) {
  const d = data as unknown as DataTypeNodeData;
  const isEnum = d.isEnum ?? false;

  return (
    <>
      <Handle type="target" position={Position.Top}    id="target-top" />
      <Handle type="target" position={Position.Left}   id="target-left" />
      <Handle type="target" position={Position.Right}  id="target-right" />
      <Handle type="target" position={Position.Bottom} id="target-bottom" />
      <div className={`bg-gray-900 rounded-lg p-3 min-w-[200px] shadow-lg border ${isEnum ? "border-amber-600" : "border-purple-800"}`}>
        <div className="flex items-center gap-2 mb-1">
          <span className={`text-xs px-1.5 py-0.5 rounded ${isEnum ? "bg-amber-900 text-amber-300" : "bg-purple-900 text-purple-300"}`}>
            {isEnum ? "ENUM" : "DTO"}
          </span>
          <span className="text-white font-semibold text-sm">{d.name}</span>
        </div>
        {d.fields && d.fields.length > 0 && (
          <ul className="space-y-0.5 mt-1">
            {d.fields.map((f, i) => (
              <li key={i} className={`text-xs font-mono flex gap-1 ${isEnum ? "text-amber-400" : "text-gray-300"}`}>
                <span className="shrink-0">{f.name}</span>
                {!isEnum && <span className="text-gray-500">: {f.type}</span>}
              </li>
            ))}
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
