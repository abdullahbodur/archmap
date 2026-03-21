"use client";

import { Handle, Position } from "@xyflow/react";
import type { NodeProps } from "@xyflow/react";
import type { FunctionKind } from "@/lib/classify";

interface FunctionNodeData {
  name: string;
  className: string;
  serviceName: string;
  serviceId: string;
  signature: string;
  kind?: FunctionKind;
  httpMethod?: string;
  path?: string;
  topics?: string[];
}

const HTTP_METHOD_COLORS: Record<string, string> = {
  GET: "bg-green-800 text-green-300",
  POST: "bg-yellow-800 text-yellow-300",
  PUT: "bg-orange-800 text-orange-300",
  PATCH: "bg-orange-800 text-orange-300",
  DELETE: "bg-red-800 text-red-300",
};

const KIND_STYLES: Record<
  FunctionKind,
  { border: string; accent: string; badge: string; badgeClass: string }
> = {
  controller: {
    border: "border-blue-500",
    accent: "bg-blue-500",
    badge: "HTTP",
    badgeClass: "bg-blue-900 text-blue-300",
  },
  "kafka-consumer": {
    border: "border-purple-500",
    accent: "bg-purple-500",
    badge: "CONSUMER",
    badgeClass: "bg-purple-900 text-purple-300",
  },
  scheduler: {
    border: "border-orange-500",
    accent: "bg-orange-500",
    badge: "SCHEDULED",
    badgeClass: "bg-orange-900 text-orange-300",
  },
  service: {
    border: "border-amber-600",
    accent: "bg-amber-600",
    badge: "SERVICE",
    badgeClass: "bg-amber-900/60 text-amber-300",
  },
  repository: {
    border: "border-green-700",
    accent: "bg-green-700",
    badge: "REPO",
    badgeClass: "bg-green-900 text-green-300",
  },
  config: {
    border: "border-gray-600",
    accent: "bg-gray-600",
    badge: "CONFIG",
    badgeClass: "bg-gray-800 text-gray-400",
  },
  app: {
    border: "border-gray-600",
    accent: "bg-gray-600",
    badge: "APP",
    badgeClass: "bg-gray-800 text-gray-400",
  },
  method: {
    border: "border-gray-700",
    accent: "bg-gray-700",
    badge: "",
    badgeClass: "bg-gray-800 text-gray-500",
  },
};

export default function FunctionNode({ data }: NodeProps) {
  const d = data as unknown as FunctionNodeData;
  const kind: FunctionKind = d.kind ?? "method";
  const style = KIND_STYLES[kind];

  const isPrivate = d.signature?.includes("private ");
  const isStatic = d.signature?.includes("static ");

  // For "method" kind, fall back to access modifier badge
  const methodBadge = isPrivate ? "private" : isStatic ? "static" : "public";
  const methodBadgeClass = isPrivate
    ? "bg-gray-800 text-gray-500"
    : isStatic
    ? "bg-blue-900 text-blue-300"
    : "bg-amber-900/60 text-amber-300";

  return (
    <>
      <Handle type="target" position={Position.Top} />
      <div
        className={`bg-gray-900 border rounded-lg overflow-hidden min-w-[200px] max-w-[300px] shadow-lg ${style.border}`}
      >
        {/* Left accent bar */}
        <div className={`flex`}>
          <div className={`w-1 shrink-0 ${style.accent}`} />
          <div className="flex-1 p-3">
            {/* Class name */}
            <div className="text-gray-500 text-[10px] font-mono truncate mb-1 leading-tight">
              {d.className}
            </div>

            {/* Badge + method name */}
            <div className="flex items-center gap-1.5 mb-1">
              {kind === "controller" && d.httpMethod ? (
                <span
                  className={`text-[10px] px-1.5 py-0.5 rounded shrink-0 font-mono font-semibold ${
                    HTTP_METHOD_COLORS[d.httpMethod] ?? "bg-blue-900 text-blue-300"
                  }`}
                >
                  {d.httpMethod}
                </span>
              ) : kind === "method" ? (
                <span className={`text-[10px] px-1.5 py-0.5 rounded shrink-0 font-mono ${methodBadgeClass}`}>
                  {methodBadge}
                </span>
              ) : style.badge ? (
                <span className={`text-[10px] px-1.5 py-0.5 rounded shrink-0 font-mono ${style.badgeClass}`}>
                  {style.badge}
                </span>
              ) : null}
              <span className="text-white font-semibold text-sm truncate">{d.name}</span>
            </div>

            {/* Extra info: path for controller, topics for kafka */}
            {kind === "controller" && d.path && (
              <div className="text-blue-400 text-[10px] font-mono truncate mb-1">{d.path}</div>
            )}
            {kind === "kafka-consumer" && d.topics && d.topics.length > 0 && (
              <div className="text-purple-400 text-[10px] font-mono truncate mb-1">
                {d.topics.join(", ")}
              </div>
            )}

            {/* Service name footer */}
            <p className="text-gray-600 text-[10px] truncate">{d.serviceName}</p>
          </div>
        </div>
      </div>
      <Handle type="source" position={Position.Bottom} />
    </>
  );
}
