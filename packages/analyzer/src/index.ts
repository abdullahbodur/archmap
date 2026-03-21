export type {
  FileContent,
  AnalyzerInput,
  AnalyzerResult,
  DetectedEndpoint,
  KafkaProducer,
  KafkaConsumer,
  FeignClient,
  RestClientCall,
  DetectedDataType,
  DataTypeRole,
  DetectedFunction,
} from "./types";

export { analyzeSpringBoot } from "./spring/index";
