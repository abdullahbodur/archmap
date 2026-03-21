import type { FileContent, DetectedDataType, DataTypeRole } from "../types";

const ENTITY_ANNOTATIONS  = ["@Entity", "@Table", "@Document", "@RedisHash", "@MappedSuperclass"];
const LOMBOK_ANNOTATIONS   = ["@Data", "@Value", "@Builder"];

function guessRole(className: string, isEntity: boolean): DataTypeRole {
  if (isEntity) return "entity";
  const lower = className.toLowerCase();
  if (lower.endsWith("request") || lower.endsWith("req") || lower.endsWith("command")) return "request";
  if (lower.endsWith("response") || lower.endsWith("resp") || lower.endsWith("result")) return "response";
  if (lower.endsWith("event") || lower.endsWith("message") || lower.endsWith("payload")) return "event";
  return "dto";
}

export function extractDataTypes(file: FileContent): DetectedDataType[] {
  const { content } = file;
  const results: DetectedDataType[] = [];

  // Match classes with their preceding annotation block + body (up to 3000 chars of body)
  // We use a non-dotAll block scan to keep it reliable.
  const lines = content.split("\n");
  let i = 0;

  while (i < lines.length) {
    const line = lines[i].trim();

    // Detect class declaration
    const classM = line.match(/(?:public\s+)?(?:data\s+)?class\s+(\w+)/);
    if (!classM) { i++; continue; }

    const name = classM[1];

    // Skip tests, configs, controllers, services, repositories
    if (
      name.endsWith("Test") || name.endsWith("Tests") ||
      name.endsWith("Config") || name.endsWith("Configuration") ||
      name.endsWith("Application") || name.endsWith("Controller") ||
      name.endsWith("Service") || name.endsWith("Repository") ||
      name.endsWith("Impl")
    ) { i++; continue; }

    // Look back up to 8 lines for annotations
    const annotationLines = lines.slice(Math.max(0, i - 8), i).join("\n");
    const isEntity = ENTITY_ANNOTATIONS.some((a) => annotationLines.includes(a));
    const hasLombok = LOMBOK_ANNOTATIONS.some((a) => annotationLines.includes(a));

    const lower = name.toLowerCase();
    const isNamedDataType =
      lower.endsWith("dto") || lower.endsWith("request") || lower.endsWith("req") ||
      lower.endsWith("response") || lower.endsWith("resp") || lower.endsWith("result") ||
      lower.endsWith("event") || lower.endsWith("message") || lower.endsWith("payload") ||
      lower.endsWith("command");

    if (!isEntity && !hasLombok && !isNamedDataType) { i++; continue; }

    // Collect class body (scan until matching closing brace, max 60 lines)
    const bodyLines: string[] = [];
    let depth = 0;
    let started = false;
    for (let j = i; j < Math.min(i + 80, lines.length); j++) {
      const bl = lines[j];
      for (const ch of bl) {
        if (ch === "{") { depth++; started = true; }
        if (ch === "}") depth--;
      }
      if (started) bodyLines.push(bl);
      if (started && depth === 0) break;
    }
    const body = bodyLines.join("\n");

    // Extract field declarations
    const fields: { name: string; type: string }[] = [];
    // Java fields: private String firstName; or val firstName: String (Kotlin)
    const javaFieldPat = /(?:private|protected|public|val|var)\s+(?:final\s+)?(\w+(?:<[^>]*>)?)\s+(\w+)\s*[;=]/g;
    const ktFieldPat   = /(?:val|var)\s+(\w+)\s*:\s*(\w+(?:<[^>]*>)?)/g;
    let fm: RegExpExecArray | null;

    while ((fm = javaFieldPat.exec(body)) !== null) {
      if (!["private", "protected", "public", "static", "final", "val", "var"].includes(fm[1])) {
        fields.push({ type: fm[1], name: fm[2] });
      }
    }
    while ((fm = ktFieldPat.exec(body)) !== null) {
      fields.push({ name: fm[1], type: fm[2] });
    }

    if (fields.length > 0 || isEntity) {
      results.push({ name, fields, role: guessRole(name, isEntity) });
    }

    i++;
  }

  return results;
}
