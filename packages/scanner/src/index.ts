import { Octokit } from "@octokit/rest";
import path from "path";
import { load as loadYaml } from "js-yaml";
import { buildAllViews } from "@archmap/graph-builder";
import type { AnalyzedService } from "@archmap/graph-builder";
import { createDeployer } from "@archmap/deployers";
import type { GraphData, RepoConfig } from "./types";

interface DetectedService {
  id: string;
  name: string;
  summary: string;
  endpoints: never[];
  dataTypes: never[];
  functions: never[];
  dependsOn: string[];
}

function stubAnalyzeRepo(repo: {
  name: string;
  description: string | null;
  language: string | null;
}): DetectedService[] {
  return [
    {
      id: repo.name,
      name: repo.name,
      summary: repo.description ?? "",
      endpoints: [],
      dataTypes: [],
      functions: [],
      dependsOn: [],
    },
  ];
}

const GITHUB_TOKEN = process.env.GITHUB_TOKEN!;
const GITHUB_ORG = process.env.GITHUB_ORG!;

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
        typeof parsed.domain === "string"
          ? parsed.domain
          : typeof parsed.group === "string"
          ? parsed.group
          : undefined,
      depends_on: Array.isArray(parsed.depends_on)
        ? (parsed.depends_on as unknown[]).filter((x): x is string => typeof x === "string")
        : [],
      tags: Array.isArray(parsed.tags)
        ? (parsed.tags as unknown[]).filter((x): x is string => typeof x === "string")
        : [],
    };
  } catch {
    return null; // 404 or parse error → treat as no config
  }
}

// ─── Stage 2: Analyze + resolve references ───────────────────────────────────

function resolveServiceReferences(services: AnalyzedService[]): void {
  const idByName = new Map<string, string>();
  for (const svc of services) {
    idByName.set(svc.name.toLowerCase(), svc.id);
    idByName.set(svc.repoName.toLowerCase(), svc.id);
  }

  for (const svc of services) {
    // Resolve dependsOn names → IDs
    svc.dependsOn = svc.dependsOn
      .map((dep) => idByName.get(dep.toLowerCase()) ?? dep)
      // Keep only IDs that exist in our service set
      .filter((dep) => services.some((s) => s.id === dep));

    // Resolve callsOut.targetService → targetServiceId
    for (const fn of svc.functions) {
      for (const call of fn.callsOut) {
        call.targetServiceId =
          idByName.get(call.targetService.toLowerCase()) ??
          call.targetService;
      }
    }
  }
}

function mapDetectedToAnalyzed(
  detected: DetectedService,
  repoName: string,
  repoUrl: string,
  language: string
): AnalyzedService {
  return {
    id: detected.id,
    name: detected.name,
    repoName,
    repoUrl,
    language,
    summary: detected.summary,
    endpoints: detected.endpoints,
    // Map DetectedDataType (has role) → DataType (has producedBy/consumedBy)
    dataTypes: detected.dataTypes.map((dt) => ({
      name: dt.name,
      fields: dt.fields,
      producedBy:
        dt.role === "produced" || dt.role === "both" ? [detected.id] : [],
      consumedBy:
        dt.role === "consumed" || dt.role === "both" ? [detected.id] : [],
    })),
    functions: detected.functions.map((fn) => ({
      name: fn.name,
      signature: fn.signature,
      callsOut: fn.callsOut.map((c) => ({
        targetService: c.targetService,
        targetEndpoint: c.targetEndpoint,
        via: c.via,
      })),
    })),
    dependsOn: detected.dependsOn,
  };
}

// ─── Main ────────────────────────────────────────────────────────────────────

async function main() {
  console.log(`Scanning org: ${GITHUB_ORG}`);

  // Stage 1: fetch repos
  const repos = await getOrgRepos();
  console.log(`Found ${repos.length} repos`);

  // Stage 2: analyze each repo → collect all AnalyzedServices
  const allServices: AnalyzedService[] = [];

  for (const repo of repos) {
    const config = await getRepoConfig(GITHUB_ORG, repo.name);
    if (config?.skip) {
      console.log(`Skipping ${repo.name} (archmap.yml: skip: true)`);
      continue;
    }
    console.log(`Analyzing ${repo.name}...`);

    const detected = stubAnalyzeRepo({
      name: repo.name,
      description: repo.description ?? null,
      language: repo.language ?? null,
    });

    for (const svc of detected) {
      const analyzed = mapDetectedToAnalyzed(svc, repo.name, repo.html_url, repo.language ?? "unknown");
      if (config) {
        if (config.name) analyzed.name = config.name;
        if (config.description) analyzed.summary = config.description;
        if (config.type) analyzed.type = config.type;
        if (config.domain) analyzed.domain = config.domain;
        if (config.tags?.length) analyzed.tags = config.tags;
        if (config.depends_on?.length) analyzed.dependsOn = [...analyzed.dependsOn, ...config.depends_on];
      }
      allServices.push(analyzed);
    }
  }

  resolveServiceReferences(allServices);

  // Stage 3: build graph views
  const views = buildAllViews(allServices);

  // Stage 4: write + deploy
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
