import type { FileContent, DetectedEndpoint } from "../types";

const VERB_MAP: Record<string, string> = {
  Get: "GET", Post: "POST", Put: "PUT", Delete: "DELETE", Patch: "PATCH",
};

/** Extract the class-level @RequestMapping base path (if any). */
function basePath(content: string): string {
  return (
    content.match(/@RequestMapping\s*\(\s*["']([^"']+)["']/)?.[1] ??
    content.match(/@RequestMapping\s*\([^)]*?(?:value|path)\s*=\s*["']([^"']+)["']/s)?.[1] ??
    ""
  );
}

function className(content: string): string {
  return content.match(/(?:class|object)\s+(\w+)/)?.[1] ?? "Unknown";
}

function normalizePath(p: string): string {
  const normalized = p.replace(/\/+/g, "/");
  return normalized || "/";
}

export function extractEndpoints(file: FileContent): DetectedEndpoint[] {
  const { content } = file;
  if (!/@(?:Rest)?Controller/.test(content)) return [];

  const cls = className(content);
  const base = basePath(content);
  const lines = content.split("\n");
  const results: DetectedEndpoint[] = [];

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim();

    // Match @GetMapping("/path"), @PostMapping, @PutMapping, etc.
    const m = line.match(
      /@(Get|Post|Put|Delete|Patch)Mapping\s*(?:\(\s*(?:value\s*=\s*)?["']([^"']*?)["'](?:[^)]*)\)|\(\s*\))?/
    );
    if (!m) continue;

    const httpMethod = VERB_MAP[m[1]] ?? m[1].toUpperCase();
    const path = m[2] ?? "";

    let methodName = "unknown";
    let returnType: string | undefined;
    let inputType: string | undefined;

    // Scan ahead up to 8 lines for the method signature, skipping annotations
    for (let j = i + 1; j < Math.min(i + 9, lines.length); j++) {
      const ml = lines[j].trim();
      if (ml.startsWith("@")) continue;

      // Java: [public] ReturnType methodName(
      const javaM = ml.match(/(?:public|private|protected)?\s*(?:static\s+)?(\w+(?:<[^>]*>)?)\s+(\w+)\s*\(/);
      // Kotlin: [override] [suspend] fun methodName(
      const ktM = ml.match(/(?:override\s+)?(?:suspend\s+)?fun\s+(\w+)\s*\(/);

      if (javaM) {
        returnType = javaM[1] !== "void" ? javaM[1] : undefined;
        methodName = javaM[2];
        // Look for @RequestBody in the next few lines
        const window = lines.slice(j, j + 4).join(" ");
        const bodyM = window.match(/@RequestBody\s+(\w+(?:<[^>]*>)?)/);
        if (bodyM) inputType = bodyM[1];
        break;
      }
      if (ktM) {
        methodName = ktM[1];
        // Kotlin return type: ): ReturnType
        const retM = lines.slice(j, j + 3).join(" ").match(/\)\s*:\s*(\w+(?:<[^>]*>)?)/);
        if (retM && retM[1] !== "Unit") returnType = retM[1];
        break;
      }
    }

    results.push({
      method: httpMethod,
      path: normalizePath(base + path),
      handlerClass: cls,
      handlerMethod: methodName,
      inputType,
      outputType: returnType,
    });
  }

  return results;
}
