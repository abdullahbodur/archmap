import { Octokit } from "@octokit/rest";
import path from "path";
import fs from "fs";
import { load as loadYaml } from "js-yaml";
import { buildAllViews } from "@archmap/graph-builder";
import type { AnalyzedService } from "@archmap/graph-builder";
import { createDeployer } from "@archmap/deployers";
import { analyzeSpringBoot } from "@archmap/analyzer";
import type { FileContent } from "@archmap/analyzer";
import type { GraphData, RepoConfig, InfraNode, InfraType, RawInfraDecl } from "./types";

const SCANNER_SOURCE = process.env.SCANNER_SOURCE ?? "github"; // "github" | "local"

// ─── Shared helpers ───────────────────────────────────────────────────────────

function parseRepoConfig(text: string): RepoConfig | null {
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

// ─── Infra ref resolution ─────────────────────────────────────────────────────

function resolveLocalInfraRef(ref: string, repoDir: string): Partial<InfraNode> | null {
  if (!ref.startsWith("./") && !ref.startsWith("../")) return null;
  try {
    const p = path.resolve(repoDir, ref);
    const text = fs.readFileSync(p, "utf-8");
    return loadYaml(text) as Partial<InfraNode>;
  } catch { return null; }
}

async function resolveGithubInfraRef(ref: string, octokit: Octokit, owner: string): Promise<Partial<InfraNode> | null> {
  const match = ref.match(/^([^/]+)\/(.+?)(?:\?ref=(.+))?$/);
  if (!match) return null;
  const [, repo, filePath, gitRef = "HEAD"] = match;
  try {
    const { data } = await octokit.repos.getContent({ owner, repo, path: filePath, ref: gitRef });
    if (!("content" in data)) return null;
    return loadYaml(Buffer.from(data.content, "base64").toString("utf-8")) as Partial<InfraNode>;
  } catch { return null; }
}

function resolveInfraRefsLocal(decls: RawInfraDecl[] | undefined, repoDir: string): InfraNode[] | undefined {
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

async function resolveInfraRefsGithub(
  decls: RawInfraDecl[] | undefined,
  octokit: Octokit,
  owner: string,
  repoName: string
): Promise<InfraNode[] | undefined> {
  if (!decls?.length) return undefined;
  const validTypes = new Set(["database", "queue", "cache", "external"]);
  const result: InfraNode[] = [];
  for (const decl of decls) {
    let merged: Record<string, unknown> = { ...decl };
    if (decl.ref) {
      if (decl.ref.startsWith("./") || decl.ref.startsWith("../")) {
        // Same-repo ref — fetch from GitHub
        const relPath = decl.ref.startsWith("./") ? decl.ref.slice(2) : decl.ref;
        try {
          const { data } = await octokit.repos.getContent({ owner, repo: repoName, path: relPath });
          if ("content" in data) {
            const fromRef = loadYaml(Buffer.from(data.content, "base64").toString("utf-8")) as Partial<InfraNode>;
            merged = { ...fromRef, ...decl };
          }
        } catch {}
      } else {
        // Cross-repo ref
        const fromRef = await resolveGithubInfraRef(decl.ref, octokit, owner);
        if (fromRef) merged = { ...fromRef, ...decl };
      }
    }
    if (typeof merged.name === "string" && typeof merged.type === "string" && validTypes.has(merged.type)) {
      result.push(merged as unknown as InfraNode);
    }
  }
  return result.length > 0 ? result : undefined;
}

function buildAnalyzedService(
  repoName: string,
  repoUrl: string,
  description: string,
  language: string,
  result: ReturnType<typeof analyzeSpringBoot>
): AnalyzedService {
  return {
    id: repoName,
    name: repoName,
    repoName,
    repoUrl,
    language: language || result.language,
    summary: description,
    endpoints: result.endpoints.map((e) => ({
      method: e.method, path: e.path, inputType: e.inputType, outputType: e.outputType,
    })),
    dataTypes: result.dataTypes.map((dt) => ({
      name: dt.name,
      fields: dt.fields,
      producedBy: dt.role === "entity" || dt.role === "event"   ? [repoName] : [],
      consumedBy: dt.role === "request" || dt.role === "response" || dt.role === "dto"
                    ? [repoName] : [],
    })),
    functions: result.functions.map((fn) => ({
      name: fn.name,
      className: fn.className,
      signature: fn.signature,
      callsOut: fn.callsServices.map((svc) => ({ targetService: svc })),
      callsMethods: fn.callsMethods,
      callsBeanMethods: fn.callsBeanMethods,
    })),
    dependsOn:      result.dependsOnServices,
    kafkaProducers: result.kafkaProducers,
    kafkaConsumers: result.kafkaConsumers,
  };
}

function buildStubService(
  repoName: string,
  repoUrl: string,
  description: string,
  language: string
): AnalyzedService {
  return {
    id: repoName, name: repoName, repoName, repoUrl, language,
    summary: description, endpoints: [], dataTypes: [], functions: [], dependsOn: [],
  };
}

function applyConfigOverrides(analyzed: AnalyzedService, config: RepoConfig | null): void {
  if (!config) return;
  if (config.name)          analyzed.name    = config.name;
  if (config.description)   analyzed.summary = config.description;
  if (config.type)          analyzed.type    = config.type;
  if (config.domain)        analyzed.domain  = config.domain;
  if (config.tags?.length)  analyzed.tags    = config.tags;
  if (config.depends_on?.length) {
    analyzed.dependsOn = [...analyzed.dependsOn, ...config.depends_on];
  }
  if (config.node) analyzed.nodeConfig = config.node;
}

function resolveServiceReferences(services: AnalyzedService[]): void {
  const idByName = new Map<string, string>();
  for (const svc of services) {
    idByName.set(svc.name.toLowerCase(),     svc.id);
    idByName.set(svc.repoName.toLowerCase(), svc.id);
  }
  for (const svc of services) {
    svc.dependsOn = svc.dependsOn
      .map((dep) => idByName.get(dep.toLowerCase()) ?? dep)
      .filter((dep) => services.some((s) => s.id === dep));
    for (const fn of svc.functions) {
      for (const call of fn.callsOut) {
        call.targetServiceId = idByName.get(call.targetService.toLowerCase()) ?? call.targetService;
      }
    }
  }
}

// ─── Local filesystem source ──────────────────────────────────────────────────

function isSpringBootLocal(repoDir: string): boolean {
  const pomPath = path.join(repoDir, "pom.xml");
  if (fs.existsSync(pomPath)) {
    return fs.readFileSync(pomPath, "utf-8").includes("spring-boot");
  }
  for (const f of ["build.gradle", "build.gradle.kts"]) {
    const p = path.join(repoDir, f);
    if (fs.existsSync(p) && fs.readFileSync(p, "utf-8").includes("spring-boot")) return true;
  }
  return false;
}

function detectLanguageLocal(repoDir: string): string {
  const srcMain = path.join(repoDir, "src", "main");
  if (!fs.existsSync(srcMain)) return "unknown";
  const files = walkDir(srcMain);
  const hasKotlin = files.some((f) => f.endsWith(".kt"));
  const hasJava   = files.some((f) => f.endsWith(".java"));
  if (hasKotlin && hasJava) return "mixed";
  if (hasKotlin) return "Kotlin";
  if (hasJava)   return "Java";
  return "unknown";
}

function readDescriptionLocal(repoDir: string): string {
  // Try README.md — grab first non-empty line after the h1
  const readmePath = path.join(repoDir, "README.md");
  if (fs.existsSync(readmePath)) {
    const lines = fs.readFileSync(readmePath, "utf-8").split("\n");
    for (let i = 1; i < lines.length; i++) {
      const l = lines[i].trim();
      if (l && !l.startsWith("#") && !l.startsWith("```")) return l;
    }
  }
  return "";
}

function readLocalRepoConfig(repoDir: string): RepoConfig | null {
  const configPath = path.join(repoDir, "archmap.yml");
  if (!fs.existsSync(configPath)) return null;
  return parseRepoConfig(fs.readFileSync(configPath, "utf-8"));
}

function walkDir(dir: string): string[] {
  const results: string[] = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) results.push(...walkDir(full));
    else results.push(full);
  }
  return results;
}

function fetchLocalSourceFiles(repoDir: string): FileContent[] {
  const srcMain = path.join(repoDir, "src", "main");
  if (!fs.existsSync(srcMain)) return [];
  return walkDir(srcMain)
    .filter((f) => f.endsWith(".java") || f.endsWith(".kt"))
    .map((f) => ({
      path: path.relative(repoDir, f).replace(/\\/g, "/"),
      content: fs.readFileSync(f, "utf-8"),
    }));
}

async function runLocalScan(servicesDir: string): Promise<{ services: AnalyzedService[]; dirCount: number }> {
  console.log(`\nScanning local services directory: ${servicesDir}\n`);

  const entries = fs.readdirSync(servicesDir, { withFileTypes: true });
  const repoDirs = entries.filter((e) => e.isDirectory() && !e.name.startsWith("."));
  console.log(`Found ${repoDirs.length} service directories`);

  const services: AnalyzedService[] = [];

  for (const entry of repoDirs) {
    const repoDir  = path.join(servicesDir, entry.name);
    const repoName = entry.name;

    const config = readLocalRepoConfig(repoDir);
    if (config?.skip) {
      console.log(`  Skipping ${repoName} (archmap.yml: skip: true)`);
      continue;
    }

    console.log(`Analyzing ${repoName}…`);

    const springBoot = isSpringBootLocal(repoDir);
    const language   = detectLanguageLocal(repoDir);
    const description = readDescriptionLocal(repoDir);
    const repoUrl    = `file://${repoDir.replace(/\\/g, "/")}`;

    let analyzed: AnalyzedService;

    if (springBoot) {
      console.log(`  Spring Boot detected`);
      const files  = fetchLocalSourceFiles(repoDir);
      const result = analyzeSpringBoot({ repoName, files });
      analyzed = buildAnalyzedService(repoName, repoUrl, description, language, result);
      console.log(
        `  → ${result.endpoints.length} endpoints, ` +
        `${result.kafkaProducers.length} kafka producers, ` +
        `${result.kafkaConsumers.length} kafka consumers, ` +
        `${result.feignClients.length} feign clients, ` +
        `${files.length} source files`
      );
    } else {
      analyzed = buildStubService(repoName, repoUrl, description, language);
    }

    const resolvedInfra = resolveInfraRefsLocal(config?.infrastructure, repoDir);
    applyConfigOverrides(analyzed, config);
    if (resolvedInfra) analyzed.infrastructure = resolvedInfra;
    services.push(analyzed);
  }

  return { services, dirCount: repoDirs.length };
}

// ─── GitHub source ────────────────────────────────────────────────────────────

function requireGithubEnv() {
  const token = process.env.ORG_TOKEN ?? process.env.GITHUB_TOKEN;
  const org   = process.env.GITHUB_ORG;
  if (!token || !org) {
    console.error("Missing ORG_TOKEN (or GITHUB_TOKEN) and GITHUB_ORG env vars");
    process.exit(1);
  }
  return { token, org };
}

async function getRepoConfigGithub(
  octokit: Octokit, owner: string, repo: string
): Promise<RepoConfig | null> {
  try {
    const { data } = await octokit.repos.getContent({ owner, repo, path: "archmap.yml" });
    if (!("content" in data)) return null;
    return parseRepoConfig(Buffer.from(data.content, "base64").toString("utf-8"));
  } catch { return null; }
}

async function isSpringBootGithub(octokit: Octokit, owner: string, repo: string): Promise<boolean> {
  try {
    const { data } = await octokit.repos.getContent({ owner, repo, path: "pom.xml" });
    if ("content" in data && Buffer.from(data.content, "base64").toString("utf-8").includes("spring-boot"))
      return true;
  } catch {}
  for (const f of ["build.gradle", "build.gradle.kts"]) {
    try {
      const { data } = await octokit.repos.getContent({ owner, repo, path: f });
      if ("content" in data && Buffer.from(data.content, "base64").toString("utf-8").includes("spring-boot"))
        return true;
    } catch {}
  }
  return false;
}

async function fetchGithubSourceFiles(
  octokit: Octokit, owner: string, repo: string, branch: string
): Promise<FileContent[]> {
  try {
    const { data } = await octokit.git.getTree({ owner, repo, tree_sha: branch, recursive: "1" });
    if (data.truncated) console.warn(`  Tree truncated for ${repo}`);
    const files = data.tree
      .filter((f) => f.type === "blob" && /^src\/main\/.*\.(java|kt)$/.test(f.path ?? ""))
      .slice(0, 200);
    if (files.length === 0) return [];
    console.log(`  Fetching ${files.length} source files…`);
    const results: FileContent[] = [];
    for (const file of files) {
      try {
        const { data: blob } = await octokit.repos.getContent({ owner, repo, path: file.path! });
        if ("content" in blob)
          results.push({ path: file.path!, content: Buffer.from(blob.content, "base64").toString("utf-8") });
      } catch {}
    }
    return results;
  } catch { return []; }
}

async function runGithubScan(): Promise<{ services: AnalyzedService[]; repoCount: number; org: string }> {
  const { token, org } = requireGithubEnv();
  const octokit = new Octokit({ auth: token });

  console.log(`Scanning GitHub org: ${org}`);
  // Skip the repo this scanner is running in (e.g. the deployment repo)
  const currentRepo = process.env.GITHUB_REPOSITORY?.split("/")[1];

  const repos = (await octokit.paginate(octokit.repos.listForOrg, { org, type: "all", per_page: 100 }))
    .filter((r) => !r.archived && !r.fork)
    .filter((r) => r.name !== currentRepo);
  console.log(`Found ${repos.length} repos`);

  const services: AnalyzedService[] = [];

  for (const repo of repos) {
    const config = await getRepoConfigGithub(octokit, org, repo.name);
    if (config?.skip) { console.log(`Skipping ${repo.name}`); continue; }

    console.log(`Analyzing ${repo.name}…`);
    const springBoot = await isSpringBootGithub(octokit, org, repo.name);
    let analyzed: AnalyzedService;

    if (springBoot) {
      console.log(`  Spring Boot detected`);
      const files  = await fetchGithubSourceFiles(octokit, org, repo.name, repo.default_branch ?? "main");
      const result = analyzeSpringBoot({ repoName: repo.name, files });
      analyzed = buildAnalyzedService(repo.name, repo.html_url, repo.description ?? "", repo.language ?? "", result);
      console.log(`  → ${result.endpoints.length} endpoints, ${result.kafkaProducers.length} producers, ${result.kafkaConsumers.length} consumers`);
    } else {
      analyzed = buildStubService(repo.name, repo.html_url, repo.description ?? "", repo.language ?? "unknown");
    }

    const resolvedInfra = await resolveInfraRefsGithub(config?.infrastructure, octokit, org, repo.name);
    applyConfigOverrides(analyzed, config);
    if (resolvedInfra) analyzed.infrastructure = resolvedInfra;
    services.push(analyzed);
  }

  return { services, repoCount: repos.length, org };
}

// ─── Main ─────────────────────────────────────────────────────────────────────

async function main() {
  let allServices: AnalyzedService[];
  let meta: GraphData["meta"];

  if (SCANNER_SOURCE === "local") {
    const servicesDir = process.env.SERVICES_DIR
      ? path.resolve(process.env.SERVICES_DIR)
      : path.join(__dirname, "../../../../services");

    const { services, dirCount } = await runLocalScan(servicesDir);
    allServices = services;
    meta = { org: "local", repoCount: dirCount, serviceCount: services.length };
  } else {
    const { services, repoCount, org } = await runGithubScan();
    allServices = services;
    meta = { org, repoCount, serviceCount: services.length };
  }

  resolveServiceReferences(allServices);

  const views     = buildAllViews(allServices);
  const timestamp = new Date().toISOString();
  const graph: GraphData = { generatedAt: timestamp, meta, services: allServices, views };

  const dataDir = process.env.OUTPUT_DIR
    ? path.resolve(process.env.OUTPUT_DIR)
    : path.join(__dirname, "../../../data");

  const deployerEnv = process.env.DEPLOYER ?? "git";
  if (deployerEnv !== "git" && deployerEnv !== "files") {
    console.error(`Unknown DEPLOYER: "${deployerEnv}". Must be "git" or "files".`);
    process.exit(1);
  }
  const deployer = createDeployer(deployerEnv as "git" | "files");
  const result   = await deployer.deploy({ dataDir, graphJson: JSON.stringify(graph, null, 2), timestamp });

  if (result.success) {
    console.log(`\nDone — ${allServices.length} services. ${result.message}`);
  } else {
    console.error("Deploy failed:", result.message, result.details);
    process.exit(1);
  }
}

main().catch((e) => { console.error(e); process.exit(1); });
