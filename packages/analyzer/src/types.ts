export interface FileContent {
  path: string;
  content: string;
}

export interface AnalyzerInput {
  repoName: string;
  files: FileContent[];
}

// ─── Endpoints ───────────────────────────────────────────────────────────────

export interface DetectedEndpoint {
  method: string;         // GET | POST | PUT | DELETE | PATCH
  path: string;           // /api/users/{id}
  handlerClass: string;
  handlerMethod: string;
  inputType?: string;     // @RequestBody class
  outputType?: string;    // return type
}

// ─── Kafka ───────────────────────────────────────────────────────────────────

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

// ─── REST clients ────────────────────────────────────────────────────────────

export interface FeignClient {
  serviceName: string;
  url?: string;
  interfaceName: string;
}

export interface RestClientCall {
  targetUrl?: string;
  targetService?: string;   // derived from URL hostname
  httpMethod?: string;
  via: "resttemplate" | "webclient" | "feign" | "httpclient";
  inClass?: string;
}

// ─── Data types ──────────────────────────────────────────────────────────────

export type DataTypeRole = "entity" | "dto" | "request" | "response" | "event";

export interface DetectedDataType {
  name: string;
  fields: { name: string; type: string }[];
  role: DataTypeRole;
}

// ─── Functions ───────────────────────────────────────────────────────────────

export interface DetectedFunction {
  name: string;
  className: string;
  signature: string;
  returnType: string;
  callsServices: string[];  // service-like names discovered in method body
}

// ─── Result ──────────────────────────────────────────────────────────────────

export interface AnalyzerResult {
  isSpringBoot: boolean;
  language: "java" | "kotlin" | "mixed" | "unknown";
  endpoints: DetectedEndpoint[];
  kafkaProducers: KafkaProducer[];
  kafkaConsumers: KafkaConsumer[];
  feignClients: FeignClient[];
  restClientCalls: RestClientCall[];
  dataTypes: DetectedDataType[];
  functions: DetectedFunction[];
  /** Service names derived from Feign clients and REST URL hostnames. */
  dependsOnServices: string[];
}
