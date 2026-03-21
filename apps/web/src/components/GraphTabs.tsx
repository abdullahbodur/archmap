"use client";

export type ViewTab = "serviceFlow" | "dataFlow" | "functionFlow";

const TABS: { id: ViewTab; label: string; description: string }[] = [
  { id: "serviceFlow", label: "Service Flow", description: "Service dependencies" },
  { id: "dataFlow", label: "Data Flow", description: "DTO contracts" },
  { id: "functionFlow", label: "Function Flow", description: "Intra-service method call graph" },
];

interface Props {
  active: ViewTab;
  onChange: (tab: ViewTab) => void;
}

export default function GraphTabs({ active, onChange }: Props) {
  return (
    <div className="flex gap-1 px-4 py-2 border-b border-gray-800 bg-gray-950">
      {TABS.map((tab) => (
        <button
          key={tab.id}
          onClick={() => onChange(tab.id)}
          className={`px-3 py-1.5 rounded text-sm font-medium transition-colors ${
            active === tab.id
              ? "bg-blue-600 text-white"
              : "text-gray-400 hover:text-gray-200 hover:bg-gray-800"
          }`}
          title={tab.description}
        >
          {tab.label}
        </button>
      ))}
    </div>
  );
}
