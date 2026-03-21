import type { AnalyzedService, GraphView } from "./types";
import { buildServiceFlow } from "./views/service-flow";
import { buildDataFlow } from "./views/data-flow";
import { buildFunctionFlow } from "./views/function-flow";
import { buildContainerDiagram } from "./views/container-diagram";

export type { AnalyzedService, GraphView };
export { gridLayout, groupedLayout } from "./layout";

export interface AllViews {
  serviceFlow: GraphView;
  dataFlow: GraphView;
  functionFlow: GraphView;
  containerDiagram: GraphView;
}

export function buildAllViews(services: AnalyzedService[]): AllViews {
  return {
    serviceFlow: buildServiceFlow(services),
    dataFlow: buildDataFlow(services),
    functionFlow: buildFunctionFlow(services),
    containerDiagram: buildContainerDiagram(services),
  };
}
