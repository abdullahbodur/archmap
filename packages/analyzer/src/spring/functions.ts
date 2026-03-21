import type { FileContent, DetectedFunction, BeanCall } from "../types";

const SKIP_PREFIXES = ["get", "set", "is", "has", "to", "equals", "hashCode", "toString"];
const SERVICE_SUFFIXES = /(?:Service|Client|Repository|Gateway|Adapter|Facade|Port)$/i;

function className(content: string): string {
  return content.match(/(?:class|object)\s+(\w+)/)?.[1] ?? "Unknown";
}

function shouldSkipMethod(name: string, cls: string): boolean {
  if (name === cls) return true; // constructor
  return SKIP_PREFIXES.some((p) => name.startsWith(p) && name.length > p.length && /[A-Z]/.test(name[p.length]));
}

/** First pass: collect all non-trivial method names declared in this file. */
function collectDeclaredMethods(lines: string[], cls: string): Set<string> {
  const names = new Set<string>();
  for (const line of lines) {
    const t = line.trim();
    const javaM = t.match(/^(?:public|private|protected)\s+(?:static\s+)?(?:\w+(?:<[^>]*>)?)\s+(\w+)\s*\(/);
    const ktM = t.match(/^(?:override\s+)?(?:suspend\s+)?fun\s+(\w+)\s*\(/);
    const name = javaM ? javaM[1] : ktM ? ktM[1] : null;
    if (name && !shouldSkipMethod(name, cls)) names.add(name);
  }
  return names;
}

export function extractFunctions(file: FileContent): DetectedFunction[] {
  const { content } = file;
  const cls = className(content);
  const lines = content.split("\n");
  const results: DetectedFunction[] = [];

  // First pass: collect all declared method names so we can detect intra-class calls
  const localMethods = collectDeclaredMethods(lines, cls);

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim();

    // Java method: [public|private|protected] [static] ReturnType methodName(
    const javaM = line.match(
      /^(?:public|private|protected)\s+(?:static\s+)?(\w+(?:<[^>]*>)?)\s+(\w+)\s*\(/
    );
    // Kotlin: [override] [suspend] fun methodName(
    const ktM = line.match(/^(?:override\s+)?(?:suspend\s+)?fun\s+(\w+)\s*\(/);

    if (!javaM && !ktM) continue;

    const methodName = javaM ? javaM[2] : ktM![1];
    const returnType = javaM ? javaM[1] : "Unit";

    if (shouldSkipMethod(methodName, cls)) continue;

    // Scan the method body (up to 80 lines or until brace depth returns to 0)
    const callsServices: string[] = [];
    const callsBeanMethods: BeanCall[] = [];
    const callsMethods: string[] = [];
    let depth = 0;
    let started = false;
    const bodyLines: string[] = [];

    for (let j = i; j < Math.min(i + 80, lines.length); j++) {
      const bl = lines[j];
      for (const ch of bl) {
        if (ch === "{") { depth++; started = true; }
        if (ch === "}") depth--;
      }
      if (started && depth === 0) break;
      bodyLines.push(bl);
    }

    const bodyStr = bodyLines.join("\n");

    // ── Bean calls: varName.methodName( where varName ends in Service/Repository/etc. ──
    for (const m of bodyStr.matchAll(/\b(\w+)\.(\w+)\s*\(/g)) {
      const varName = m[1];
      const calledMethod = m[2];
      if (SERVICE_SUFFIXES.test(varName)) {
        const svcName = varName.replace(SERVICE_SUFFIXES, "").toLowerCase();
        if (svcName && !callsServices.includes(svcName)) {
          callsServices.push(svcName);
        }
        const exists = callsBeanMethods.some(
          (b) => b.beanVariable === varName && b.methodName === calledMethod
        );
        if (!exists) {
          callsBeanMethods.push({ beanVariable: varName, methodName: calledMethod });
        }
      }
    }

    // ── Same-class direct calls: methodName( not preceded by "." or word char ──
    for (const knownMethod of localMethods) {
      if (knownMethod === methodName) continue; // skip self-reference
      // Pattern: not preceded by . or alphanumeric, then method name, then optional ws, then (
      // Also match: this.methodName( and this::methodName (method references)
      const directPat = new RegExp(`(?<![.\\w])\\b${knownMethod}\\s*\\(`, "g");
      const thisDotPat = new RegExp(`\\bthis\\.${knownMethod}\\s*\\(`, "g");
      const thisRefPat = new RegExp(`\\bthis::${knownMethod}\\b`, "g");
      const methodRefPat = new RegExp(`::${knownMethod}\\b`, "g");
      if (
        (directPat.test(bodyStr) || thisDotPat.test(bodyStr) ||
         thisRefPat.test(bodyStr) || methodRefPat.test(bodyStr)) &&
        !callsMethods.includes(knownMethod)
      ) {
        callsMethods.push(knownMethod);
      }
    }

    results.push({
      name: methodName,
      className: cls,
      signature: line.replace(/\s+/g, " "),
      returnType,
      callsServices,
      callsMethods,
      callsBeanMethods,
    });
  }

  return results;
}
