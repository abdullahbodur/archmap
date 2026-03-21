"use client";

import { Handle, Position } from "@xyflow/react";
import type { NodeProps } from "@xyflow/react";
import type { Endpoint } from "@/types/graph";

interface ServiceNodeData {
  name: string;
  repoName: string;
  repoUrl: string;
  language: string;
  summary: string;
  endpoints: Endpoint[];
  serviceType?: "service" | "library" | "tool" | "infra";
  domain?: string;
  tags?: string[];
}

const TYPE_COLORS: Record<string, string> = {
  service: "bg-blue-900 text-blue-300",
  library: "bg-green-900 text-green-300",
  tool: "bg-amber-900 text-amber-300",
  infra: "bg-red-900 text-red-300",
};

export default function ServiceNode({ data }: NodeProps) {
  const d = data as unknown as ServiceNodeData;
  const typeColor = d.serviceType ? (TYPE_COLORS[d.serviceType] ?? "bg-gray-800 text-gray-400") : null;

  return (
    <>
      <Handle type="target" position={Position.Top} />
      <div className="bg-gray-900 border border-gray-700 rounded-lg p-3 min-w-[200px] max-w-[260px] shadow-lg">
        <div className="flex items-center justify-between gap-2 mb-1">
          <span className="text-white font-semibold text-sm truncate">{d.name}</span>
          <div className="flex items-center gap-1 shrink-0">
            {typeColor && (
              <span className={`text-xs px-1.5 py-0.5 rounded ${typeColor}`}>
                {d.serviceType}
              </span>
            )}
            {d.language && (
              <span className="text-xs bg-blue-900 text-blue-300 px-1.5 py-0.5 rounded">
                {d.language}
              </span>
            )}
          </div>
        </div>
        {d.domain && (
          <div className="text-gray-500 text-xs mb-1">{d.domain}</div>
        )}
        {d.summary && (
          <p className="text-gray-400 text-xs mb-2 line-clamp-2">{d.summary}</p>
        )}
        {d.endpoints && d.endpoints.length > 0 && (
          <ul className="space-y-0.5 mb-2">
            {d.endpoints.slice(0, 4).map((ep, i) => (
              <li key={i} className="text-xs font-mono text-gray-300 flex gap-1">
                <span className="text-green-400 shrink-0">{ep.method}</span>
                <span className="truncate">{ep.path}</span>
              </li>
            ))}
            {d.endpoints.length > 4 && (
              <li className="text-xs text-gray-500">+{d.endpoints.length - 4} more</li>
            )}
          </ul>
        )}
        {d.tags && d.tags.length > 0 && (
          <div className="flex flex-wrap gap-1">
            {d.tags.slice(0, 3).map((tag) => (
              <span key={tag} className="text-xs bg-gray-800 text-gray-400 px-1.5 py-0.5 rounded">
                {tag}
              </span>
            ))}
          </div>
        )}
      </div>
      <Handle type="source" position={Position.Bottom} />
    </>
  );
}
