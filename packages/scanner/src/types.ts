export interface Endpoint {
  method: string;
  path: string;
  inputType?: string;
  outputType?: string;
}

export interface DataTypeField {
  name: string;
  type: string;
}

export interface DataType {
  name: string;
  fields: DataTypeField[];
  producedBy: string[];  // service IDs
  consumedBy: string[];  // service IDs
}

export interface CrossServiceCall {
  targetService: string;   // service name (pre-resolution)
  targetServiceId?: string; // resolved service ID
  targetEndpoint?: string;
  via?: string;            // e.g. "HTTP", "gRPC", "message queue"
}

export interface ServiceFunction {
  name: string;
  signature: string;
  callsOut: CrossServiceCall[];
}

export type ServiceType = "service" | "library" | "tool" | "infra";

export interface RepoConfig {
  name?: string;
  description?: string;
  skip?: boolean;
  type?: ServiceType;
  domain?: string;       // "group" accepted as alias during parsing
  depends_on?: string[];
  tags?: string[];
}

export interface AnalyzedService {
  id: string;              // "<repo>" or "<repo>/<service>" for monorepos
  name: string;
  repoName: string;
  repoUrl: string;
  language: string;
  summary: string;
  endpoints: Endpoint[];
  dataTypes: DataType[];
  functions: ServiceFunction[];
  dependsOn: string[];     // resolved service IDs
  type?: ServiceType;
  domain?: string;
  tags?: string[];
}

export interface ViewNode {
  id: string;
  type?: string;
  position: { x: number; y: number };
  data: Record<string, unknown>;
}

export interface ViewEdge {
  id: string;
  source: string;
  target: string;
  label?: string;
  animated?: boolean;
}

export interface GraphView {
  nodes: ViewNode[];
  edges: ViewEdge[];
}

export interface GraphData {
  generatedAt: string;
  meta: {
    org: string;
    repoCount: number;
    serviceCount: number;
  };
  services: AnalyzedService[];
  views: {
    serviceFlow: GraphView;
    dataFlow: GraphView;
    functionFlow: GraphView;
  };
}
