import type { AnalyzerInput, AnalyzerResult } from "../types";
import { extractEndpoints } from "./endpoints";
import { extractKafkaConsumers, extractKafkaProducers } from "./kafka";
import { extractFeignClients, extractRestClientCalls } from "./clients";
import { extractDataTypes } from "./data-types";
import { extractFunctions } from "./functions";

function detectLanguage(files: { path: string }[]): AnalyzerResult["language"] {
  const java   = files.some((f) => f.path.endsWith(".java"));
  const kotlin = files.some((f) => f.path.endsWith(".kt"));
  if (java && kotlin) return "mixed";
  if (java)   return "java";
  if (kotlin) return "kotlin";
  return "unknown";
}

function unique<T>(arr: T[]): T[] {
  return [...new Set(arr)];
}

export function analyzeSpringBoot(input: AnalyzerInput): AnalyzerResult {
  const endpoints      = input.files.flatMap(extractEndpoints);
  const kafkaProducers = input.files.flatMap(extractKafkaProducers);
  const kafkaConsumers = input.files.flatMap(extractKafkaConsumers);
  const feignClients   = input.files.flatMap(extractFeignClients);
  const restClientCalls = input.files.flatMap(extractRestClientCalls);
  const dataTypes      = input.files.flatMap(extractDataTypes);
  const functions      = input.files.flatMap(extractFunctions);

  // Derive cross-service dependencies from Feign + REST client targets
  const dependsOnServices = unique([
    ...feignClients.map((fc) => fc.serviceName),
    ...restClientCalls
      .map((rc) => rc.targetService)
      .filter((s): s is string => !!s),
  ]);

  return {
    isSpringBoot: true,
    language: detectLanguage(input.files),
    endpoints,
    kafkaProducers,
    kafkaConsumers,
    feignClients,
    restClientCalls,
    dataTypes,
    functions,
    dependsOnServices,
  };
}
