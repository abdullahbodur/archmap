import path from "path";
import fs from "fs";
import { load as loadYaml } from "js-yaml";
import type { RepoConfig, InfraNode, InfraType, RawInfraDecl } from "./types";

export function parseRepoConfig(text: string): RepoConfig | null {
  try {
    const parsed = loadYaml(text) as Record<string, unknown>;
    return {
      name:        typeof parsed.name        === "string" ? parsed.name        : undefined,
      description: typeof parsed.description === "string" ? parsed.description : undefined,
      skip:        parsed.skip === true,
      type:        (["service", "library", "tool", "infra"] as const).includes(parsed.type as any)
                     ? (parsed.type as RepoConfig["type"]) : undefined,
      domain:      typeof parsed.domain === "string" ? parsed.domain
                     : typeof parsed.group === "string" ? parsed.group : undefined,
      depends_on:  Array.isArray(parsed.depends_on)
                     ? (parsed.depends_on as unknown[]).filter((x): x is string => typeof x === "string")
                     : [],
      tags:        Array.isArray(parsed.tags)
                     ? (parsed.tags as unknown[]).filter((x): x is string => typeof x === "string")
                     : [],
      node: (() => {
        const n = parsed.node as Record<string, unknown> | undefined;
        if (!n || typeof n !== "object") return undefined;
        return {
          color:       typeof n.color       === "string" ? n.color       : undefined,
          icon:        typeof n.icon        === "string" ? n.icon        : undefined,
          badge:       typeof n.badge       === "string" ? n.badge       : undefined,
          description: typeof n.description === "string" ? n.description : undefined,
        };
      })(),
      infrastructure: (() => {
        const raw = parsed.infrastructure;
        if (!Array.isArray(raw)) return undefined;
        const validTypes = new Set(["database", "queue", "cache", "external"]);
        const result: RawInfraDecl[] = [];
        for (const entry of raw as unknown[]) {
          if (!entry || typeof entry !== "object") continue;
          const e = entry as Record<string, unknown>;
          if (typeof e.id !== "string") continue;
          const t = validTypes.has(e.type as string) ? (e.type as InfraType) : undefined;
          result.push({
            id: e.id,
            ...(typeof e.name === "string" && { name: e.name }),
            ...(t && { type: t }),
            ...(typeof e.technology === "string" && { technology: e.technology }),
            ...(typeof e.description === "string" && { description: e.description }),
            ...(typeof e.ref === "string" && { ref: e.ref }),
          });
        }
        return result.length > 0 ? result : undefined;
      })(),
    };
  } catch {
    return null;
  }
}

export function resolveLocalInfraRef(ref: string, repoDir: string): Partial<InfraNode> | null {
  if (!ref.startsWith("./") && !ref.startsWith("../")) return null;
  try {
    const p = path.resolve(repoDir, ref);
    const text = fs.readFileSync(p, "utf-8");
    return loadYaml(text) as Partial<InfraNode>;
  } catch { return null; }
}

export function resolveInfraRefsLocal(decls: RawInfraDecl[] | undefined, repoDir: string): InfraNode[] | undefined {
  if (!decls?.length) return undefined;
  const validTypes = new Set(["database", "queue", "cache", "external"]);
  const result: InfraNode[] = [];
  for (const decl of decls) {
    let merged: Record<string, unknown> = { ...decl };
    if (decl.ref) {
      const fromRef = resolveLocalInfraRef(decl.ref, repoDir);
      if (fromRef) merged = { ...fromRef, ...decl }; // inline wins
    }
    if (typeof merged.name === "string" && typeof merged.type === "string" && validTypes.has(merged.type)) {
      result.push(merged as unknown as InfraNode);
    } else if (!merged.ref) {
      // No ref and missing required fields — skip silently
    } else {
      console.warn(`  Infra node "${decl.id}" missing name/type after ref resolution — skipped`);
    }
  }
  return result.length > 0 ? result : undefined;
}
