import { readFileSync } from "fs";
import path from "path";
import ArchMapShell from "@/components/ArchMapShell";
import type { GraphData } from "@/types/graph";

const EMPTY_VIEW = { nodes: [], edges: [] };

function getGraphData(): GraphData {
  try {
    const dataPath = process.env.ARCHMAP_DATA_PATH
      ? path.resolve(process.env.ARCHMAP_DATA_PATH)
      : path.join(process.cwd(), "../../data/graph.json");
    const raw = readFileSync(dataPath, "utf-8");
    return JSON.parse(raw);
  } catch {
    return {
      generatedAt: null,
      meta: { org: "", repoCount: 0, serviceCount: 0 },
      services: [],
      views: {
        serviceFlow: EMPTY_VIEW,
        dataFlow: EMPTY_VIEW,
        functionFlow: EMPTY_VIEW,
      },
    };
  }
}

export default function Home() {
  const graph = getGraphData();

  return (
    <main className="w-screen h-screen bg-gray-950 flex flex-col">
      <header className="flex items-center justify-between px-6 py-3 border-b border-gray-800 shrink-0">
        <div className="flex items-center gap-3">
          <span className="text-white font-bold text-lg tracking-tight">ArchMap</span>
          <span className="text-gray-500 text-xs">AI-powered architecture visualizer</span>
          {graph.meta.serviceCount > 0 && (
            <span className="text-gray-600 text-xs">
              {graph.meta.serviceCount} services · {graph.meta.repoCount} repos
            </span>
          )}
        </div>
        {graph.generatedAt && (
          <span className="text-gray-500 text-xs">
            Last updated: {new Date(graph.generatedAt).toLocaleString()}
          </span>
        )}
      </header>
      <ArchMapShell graph={graph} />
    </main>
  );
}
