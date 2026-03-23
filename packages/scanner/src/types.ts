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

export interface BeanCall {
  beanVariable: string;
  methodName: string;
}

export interface ServiceFunction {
  name: string;
  className?: string;
  signature: string;
  callsOut: CrossServiceCall[];
  callsMethods?: string[];       // same-class direct method calls
  callsBeanMethods?: BeanCall[]; // calls on injected beans with specific method names
}

export type ServiceType = "service" | "library" | "tool" | "infra";

export type InfraType = "database" | "queue" | "cache" | "external";

export interface InfraNode {
  id: string;
  name: string;
  type: InfraType;
  technology?: string;
  description?: string;
  ref?: string;
  internal?: boolean;
}

// Partial declaration as it appears in archmap.yml — name/type may come from a ref file
export interface RawInfraDecl {
  id: string;
  name?: string;
  type?: InfraType;
  technology?: string;
  description?: string;
  ref?: string;
  internal?: boolean;
}

// ─── Kafka (mirrored from @archmap/analyzer, kept local to avoid circular dep) ─

export interface KafkaProducer {
  topic: string;
  messageType?: string;
  inClass?: string;
  inMethod?: string;
}

export interface KafkaConsumer {
  topics: string[];
  groupId?: string;
  handlerMethod: string;
  handlerClass?: string;
  messageType?: string;
}

export interface NodeConfig {
  color?: string;
  icon?: string;
  badge?: string;
  description?: string;
}

export interface RepoConfig {
  name?: string;
  description?: string;
  skip?: boolean;
  type?: ServiceType;
  domain?: string;       // "group" accepted as alias during parsing
  depends_on?: string[];
  tags?: string[];
  node?: NodeConfig;
  infrastructure?: RawInfraDecl[];
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
  kafkaProducers?: KafkaProducer[];
  kafkaConsumers?: KafkaConsumer[];
  nodeConfig?: NodeConfig;
  infrastructure?: InfraNode[];
}

export interface ViewNode {
  id: string;
  type?: string;
  position: { x: number; y: number };
  data: Record<string, unknown>;
  parentId?: string;
  extent?: "parent";
  style?: Record<string, unknown>;
}

export interface ViewEdge {
  id: string;
  source: string;
  target: string;
  label?: string;
  animated?: boolean;
  markerEnd?: string;
  type?: string;
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
    containerDiagram: GraphView;
  };
}
