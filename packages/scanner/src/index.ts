import { Octokit } from "@octokit/rest";
import path from "path";
import { load as loadYaml } from "js-yaml";
import { buildAllViews } from "@archmap/graph-builder";
import type { AnalyzedService } from "@archmap/graph-builder";
import { createDeployer } from "@archmap/deployers";
import { analyzeSpringBoot } from "@archmap/analyzer";
import type { FileContent } from "@archmap/analyzer";
import type { GraphData, RepoConfig } from "./types";

// ─── Env ─────────────────────────────────────────────────────────────────────

const GITHUB_TOKEN = process.env.GITHUB_TOKEN!;
const GITHUB_ORG   = process.env.GITHUB_ORG!;

if (!GITHUB_TOKEN || !GITHUB_ORG) {
  console.error("Missing GITHUB_TOKEN or GITHUB_ORG env vars");
  process.exit(1);
}

const octokit = new Octokit({ auth: GITHUB_TOKEN });

// ─── Stage 1: Fetch repos ────────────────────────────────────────────────────

async function getOrgRepos() {
  const repos = await octokit.paginate(octokit.repos.listForOrg, {
    org: GITHUB_ORG,
    type: "all",
    per_page: 100,
  });
  return repos.filter((r) => !r.archived && !r.fork);
}

// ─── Stage 1b: Per-repo config ───────────────────────────────────────────────

async function getRepoConfig(owner: string, repo: string): Promise<RepoConfig | null> {
  try {
    const { data } = await octokit.repos.getContent({ owner, repo, path: "archmap.yml" });
    if (!("content" in data)) return null;
    const text = Buffer.from(data.content, "base64").toString("utf-8");
    const parsed = loadYaml(text) as Record<string, unknown>;
    return {
      name: typeof parsed.name === "string" ? parsed.name : undefined,
      description: typeof parsed.description === "string" ? parsed.description : undefined,
      skip: parsed.skip === true,
      type: (["service", "library", "tool", "infra"] as const).includes(parsed.type as any)
        ? (parsed.type as RepoConfig["type"])
        : undefined,
      domain:
        typeof parsed.domain === "string" ? parsed.domain
          : typeof parsed.group === "string" ? parsed.group
          : undefined,
      depends_on: Array.isArray(parsed.depends_on)
        ? (parsed.depends_on as unknown[]).filter((x): x is string => typeof x === "string")
        : [],
      tags: Array.isArray(parsed.tags)
        ? (parsed.tags as unknown[]).filter((x): x is string => typeof x === "string")
        : [],
    };
  } catch {
    return null;
  }
}

// ─── Spring Boot detection ───────────────────────────────────────────────────

async function isSpringBootRepo(owner: string, repo: string): Promise<boolean> {
  // Check pom.xml
  try {
    const { data } = await octokit.repos.getContent({ owner, repo, path: "pom.xml" });
    if ("content" in data) {
      const xml = Buffer.from(data.content, "base64").toString("utf-8");
      if (xml.includes("spring-boot")) return true;
    }
  } catch { /* no pom.xml */ }

  // Check build.gradle / build.gradle.kts
  for (const buildFile of ["build.gradle", "build.gradle.kts"]) {
    try {
      const { data } = await octokit.repos.getContent({ owner, repo, path: buildFile });
      if ("content" in data) {
        const gradle = Buffer.from(data.content, "base64").toString("utf-8");
        if (gradle.includes("spring-boot")) return true;
      }
    } catch { /* not found */ }
  }

  return false;
}

// ─── Fetch source files via Git Trees API ────────────────────────────────────

const MAX_SOURCE_FILES = 200;

async function fetchSpringSourceFiles(
  owner: string,
  repo: string,
  defaultBranch: string
): Promise<FileContent[]> {
  let tree: Awaited<ReturnType<typeof octokit.git.getTree>>["data"]["tree"];

  try {
    const { data } = await octokit.git.getTree({
      owner, repo, tree_sha: defaultBranch, recursive: "1",
    });
    if (data.truncated) {
      console.warn(`  ⚠ Tree truncated for ${repo} — some files may be missing`);
    }
    tree = data.tree;
  } catch {
    return [];
  }

  const sourceFiles = tree
    .filter(
      (f) =>
        f.type === "blob" &&
        /^src\/main\/.*\.(java|kt)$/.test(f.path ?? "")
    )
    .slice(0, MAX_SOURCE_FILES);

  if (sourceFiles.length === 0) return [];
  console.log(`  Fetching ${sourceFiles.length} source files…`);

  const results: FileContent[] = [];
  for (const file of sourceFiles) {
    try {
      const { data } = await octokit.repos.getContent({ owner, repo, path: file.path! });
      if ("content" in data) {
        results.push({
          path: file.path!,
          content: Buffer.from(data.content, "base64").toString("utf-8"),
        });
      }
    } catch { /* skip unreadable files */ }
  }

  return results;
}

// ─── Stage 2: Resolve cross-service references ───────────────────────────────

function resolveServiceReferences(services: AnalyzedService[]): void {
  const idByName = new Map<string, string>();
  for (const svc of services) {
    idByName.set(svc.name.toLowerCase(), svc.id);
    idByName.set(svc.repoName.toLowerCase(), svc.id);
  }

  for (const svc of services) {
    svc.dependsOn = svc.dependsOn
      .map((dep) => idByName.get(dep.toLowerCase()) ?? dep)
      .filter((dep) => services.some((s) => s.id === dep));

    for (const fn of svc.functions) {
      for (const call of fn.callsOut) {
        call.targetServiceId =
          idByName.get(call.targetService.toLowerCase()) ?? call.targetService;
      }
    }
  }
}

// ─── Main ────────────────────────────────────────────────────────────────────

async function main() {
  console.log(`Scanning org: ${GITHUB_ORG}`);

  const repos = await getOrgRepos();
  console.log(`Found ${repos.length} repos`);

  const allServices: AnalyzedService[] = [];

  for (const repo of repos) {
    // Per-repo config
    const config = await getRepoConfig(GITHUB_ORG, repo.name);
    if (config?.skip) {
      console.log(`Skipping ${repo.name} (archmap.yml: skip: true)`);
      continue;
    }

    console.log(`Analyzing ${repo.name}…`);

    const springBoot = await isSpringBootRepo(GITHUB_ORG, repo.name);
    let analyzed: AnalyzedService;

    if (springBoot) {
      console.log(`  Spring Boot detected`);
      const files = await fetchSpringSourceFiles(GITHUB_ORG, repo.name, repo.default_branch ?? "main");
      const result = analyzeSpringBoot({ repoName: repo.name, files });

      analyzed = {
        id: repo.name,
        name: repo.name,
        repoName: repo.name,
        repoUrl: repo.html_url,
        language: repo.language ?? result.language,
        summary: repo.description ?? "",
        endpoints: result.endpoints.map((e) => ({
          method: e.method,
          path: e.path,
          inputType: e.inputType,
          outputType: e.outputType,
        })),
        dataTypes: result.dataTypes.map((dt) => ({
          name: dt.name,
          fields: dt.fields,
          producedBy:
            dt.role === "entity" || dt.role === "event" ? [repo.name] : [],
          consumedBy:
            dt.role === "request" || dt.role === "response" || dt.role === "dto"
              ? [repo.name]
              : [],
        })),
        functions: result.functions.map((fn) => ({
          name: fn.name,
          signature: fn.signature,
          callsOut: fn.callsServices.map((svc) => ({ targetService: svc })),
        })),
        dependsOn: result.dependsOnServices,
        kafkaProducers: result.kafkaProducers,
        kafkaConsumers: result.kafkaConsumers,
      };

      console.log(
        `  → ${result.endpoints.length} endpoints, ` +
        `${result.kafkaProducers.length} kafka producers, ` +
        `${result.kafkaConsumers.length} kafka consumers, ` +
        `${result.feignClients.length} feign clients`
      );
    } else {
      // Fallback stub for non-Spring-Boot repos
      analyzed = {
        id: repo.name,
        name: repo.name,
        repoName: repo.name,
        repoUrl: repo.html_url,
        language: repo.language ?? "unknown",
        summary: repo.description ?? "",
        endpoints: [],
        dataTypes: [],
        functions: [],
        dependsOn: [],
      };
    }

    // Apply archmap.yml overrides
    if (config) {
      if (config.name)          analyzed.name = config.name;
      if (config.description)   analyzed.summary = config.description;
      if (config.type)          analyzed.type = config.type;
      if (config.domain)        analyzed.domain = config.domain;
      if (config.tags?.length)  analyzed.tags = config.tags;
      if (config.depends_on?.length) {
        analyzed.dependsOn = [...analyzed.dependsOn, ...config.depends_on];
      }
    }

    allServices.push(analyzed);
  }

  resolveServiceReferences(allServices);

  // Build graph views
  const views = buildAllViews(allServices);

  const timestamp = new Date().toISOString();
  const graph: GraphData = {
    generatedAt: timestamp,
    meta: {
      org: GITHUB_ORG,
      repoCount: repos.length,
      serviceCount: allServices.length,
    },
    services: allServices,
    views,
  };

  const dataDir = process.env.OUTPUT_DIR
    ? path.resolve(process.env.OUTPUT_DIR)
    : path.join(__dirname, "../../../data");

  const deployerEnv = process.env.DEPLOYER ?? "git";
  if (deployerEnv !== "git" && deployerEnv !== "files") {
    console.error(`Unknown DEPLOYER: "${deployerEnv}". Must be "git" or "files".`);
    process.exit(1);
  }
  const deployer = createDeployer(deployerEnv as "git" | "files");

  const result = await deployer.deploy({
    dataDir,
    graphJson: JSON.stringify(graph, null, 2),
    timestamp,
  });

  if (result.success) {
    console.log(`Done. ${allServices.length} services across ${repos.length} repos.`);
    console.log(result.message);
  } else {
    console.error("Deploy failed:", result.message, result.details);
    process.exit(1);
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
