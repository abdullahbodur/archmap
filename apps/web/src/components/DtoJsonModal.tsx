"use client";

import type { DataType, AnalyzedService } from "@/types/graph";
import { buildExample } from "@/lib/buildDtoExample";

interface Props {
  dto: DataType;
  allServices: AnalyzedService[];
  onClose: () => void;
}

export default function DtoJsonModal({ dto, allServices, onClose }: Props) {
  const dtoMap = new Map<string, DataType>();
  for (const svc of allServices) {
    for (const dt of svc.dataTypes) {
      if (!dtoMap.has(dt.name)) dtoMap.set(dt.name, dt);
    }
  }

  const isEnum = dto.fields.every((f) => f.type === "enum constant");
  const json = isEnum
    ? dto.fields.map((f) => f.name)
    : buildExample(dto, dtoMap);

  const jsonStr = JSON.stringify(json, null, 2);

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm"
      onClick={onClose}
    >
      <div
        className="bg-gray-900 border border-gray-700 rounded-xl shadow-2xl w-full max-w-lg mx-4 overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between px-4 py-3 border-b border-gray-700">
          <div className="flex items-center gap-2">
            <span className={`text-xs px-1.5 py-0.5 rounded ${isEnum ? "bg-amber-900 text-amber-300" : "bg-purple-900 text-purple-300"}`}>
              {isEnum ? "ENUM" : "DTO"}
            </span>
            <span className="text-white font-semibold">{dto.name}</span>
          </div>
          <button
            onClick={onClose}
            className="text-gray-500 hover:text-gray-300 text-lg leading-none"
          >
            ✕
          </button>
        </div>
        <div className="p-4 overflow-auto max-h-[60vh]">
          <pre className="text-xs font-mono text-gray-300 whitespace-pre leading-5">
            {jsonStr}
          </pre>
        </div>
      </div>
    </div>
  );
}
