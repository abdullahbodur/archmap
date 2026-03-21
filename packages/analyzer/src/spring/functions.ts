import type { FileContent, DetectedFunction } from "../types";

const SKIP_PREFIXES = ["get", "set", "is", "has", "to", "equals", "hashCode", "toString"];
const SERVICE_SUFFIXES = /(?:Service|Client|Repository|Gateway|Adapter|Facade|Port)$/i;

function className(content: string): string {
  return content.match(/(?:class|object)\s+(\w+)/)?.[1] ?? "Unknown";
}

function shouldSkipMethod(name: string, cls: string): boolean {
  if (name === cls) return true; // constructor
  return SKIP_PREFIXES.some((p) => name.startsWith(p) && name.length > p.length && /[A-Z]/.test(name[p.length]));
}

export function extractFunctions(file: FileContent): DetectedFunction[] {
  const { content } = file;
  const cls = className(content);
  const lines = content.split("\n");
  const results: DetectedFunction[] = [];

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim();

    // Java method: [public|private|protected] [static] ReturnType methodName(
    const javaM = line.match(
      /^(?:public|private|protected)\s+(?:static\s+)?(\w+(?:<[^>]*>)?)\s+(\w+)\s*\(/
    );
    // Kotlin: [override] [suspend] fun methodName(
    const ktM = line.match(/^(?:override\s+)?(?:suspend\s+)?fun\s+(\w+)\s*\(/);

    if (!javaM && !ktM) continue;

    const methodName  = javaM ? javaM[2] : ktM![1];
    const returnType  = javaM ? javaM[1] : "Unit";

    if (shouldSkipMethod(methodName, cls)) continue;

    // Scan the method body (next ~40 lines or until depth returns to 0)
    const callsServices: string[] = [];
    let depth = 0;
    let started = false;

    for (let j = i; j < Math.min(i + 50, lines.length); j++) {
      const bl = lines[j];
      for (const ch of bl) {
        if (ch === "{") { depth++; started = true; }
        if (ch === "}") depth--;
      }
      if (started && depth === 0) break;

      // Find service/client calls: someService.method( or someClient.method(
      const callM = bl.match(/(\w+)\.\w+\s*\(/g);
      if (callM) {
        for (const c of callM) {
          const varName = c.split(".")[0];
          if (SERVICE_SUFFIXES.test(varName)) {
            // strip suffix to get a rough service name
            const svcName = varName.replace(SERVICE_SUFFIXES, "").toLowerCase();
            if (svcName && !callsServices.includes(svcName)) {
              callsServices.push(svcName);
            }
          }
        }
      }
    }

    results.push({
      name: methodName,
      className: cls,
      signature: line.replace(/\s+/g, " "),
      returnType,
      callsServices,
    });
  }

  return results;
}
