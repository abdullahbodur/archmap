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
  producedBy: string[];
  consumedBy: string[];
}

export interface CrossServiceCall {
  targetService: string;
  targetServiceId?: string;
  targetEndpoint?: string;
  via?: string;
}

export interface ServiceFunction {
  name: string;
  className?: string;
  signature: string;
  callsOut: CrossServiceCall[];
  callsMethods?: string[];
  callsBeanMethods?: { beanVariable: string; methodName: string }[];
}

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

export interface AnalyzedService {
  id: string;
  name: string;
  repoName: string;
  repoUrl: string;
  language: string;
  summary: string;
  endpoints: Endpoint[];
  dataTypes: DataType[];
  functions: ServiceFunction[];
  dependsOn: string[];
  type?: "service" | "library" | "tool" | "infra";
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
  generatedAt: string | null;
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
