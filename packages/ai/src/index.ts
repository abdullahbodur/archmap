import Anthropic from "@anthropic-ai/sdk";

export interface RepoInput {
  name: string;
  description: string | null;
  language: string | null;
  url: string;
  codeContent: string;
}

export interface DetectedEndpoint {
  method: string;
  path: string;
  inputType?: string;
  outputType?: string;
}

export interface DetectedDataTypeField {
  name: string;
  type: string;
}

export interface DetectedDataType {
  name: string;
  fields: DetectedDataTypeField[];
  role: "produced" | "consumed" | "both";
}

export interface DetectedCrossServiceCall {
  targetService: string;
  targetEndpoint?: string;
  via?: string;
}

export interface DetectedFunction {
  name: string;
  signature: string;
  callsOut: DetectedCrossServiceCall[];
}

export interface DetectedService {
  id: string;
  name: string;
  summary: string;
  endpoints: DetectedEndpoint[];
  dataTypes: DetectedDataType[];
  functions: DetectedFunction[];
  dependsOn: string[];
}

const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

export async function analyzeRepo(repo: RepoInput): Promise<DetectedService[]> {
  if (!repo.codeContent) {
    return fallback(repo);
  }

  const codeSample = repo.codeContent.slice(0, 8000);

  const prompt = `You are analyzing a software repository to extract its architecture.

Repository: ${repo.name}
Description: ${repo.description ?? "N/A"}
Language: ${repo.language ?? "unknown"}
URL: ${repo.url}

Code sample:
\`\`\`
${codeSample}
\`\`\`

Analyze this repository and return a JSON array of services. A single repo may have multiple services (e.g. a monorepo with multiple sub-packages/services). If it's a standard single-service repo, return an array with one item.

For each service, extract:
- id: unique identifier, use "<repoName>" for single service, "<repoName>/<serviceName>" for monorepo services
- name: human-readable service name
- summary: one-sentence description of what this service does
- endpoints: HTTP or API endpoints exposed (method, path, optional inputType and outputType DTO names)
- dataTypes: DTOs/data structures defined or heavily used. Each has name, fields array ({name, type}), and role = "produced" | "consumed" | "both"
- functions: key exported or handler functions. Each has name, signature string, and callsOut array ({targetService, targetEndpoint?, via?})
- dependsOn: names of other services/repos this depends on

Return ONLY valid JSON, no markdown, no explanation. Format:
[
  {
    "id": "repo-name",
    "name": "Service Name",
    "summary": "One sentence description",
    "endpoints": [{"method": "GET", "path": "/api/users", "outputType": "User"}],
    "dataTypes": [{"name": "User", "fields": [{"name": "id", "type": "string"}], "role": "produced"}],
    "functions": [{"name": "getUser", "signature": "getUser(id: string): Promise<User>", "callsOut": []}],
    "dependsOn": ["other-service"]
  }
]`;

  try {
    const message = await client.messages.create({
      model: "claude-sonnet-4-6",
      max_tokens: 4096,
      messages: [{ role: "user", content: prompt }],
    });

    const content = message.content[0];
    if (content.type !== "text") {
      return fallback(repo);
    }

    const match = content.text.match(/\[[\s\S]*\]/);
    if (!match) {
      return fallback(repo);
    }

    const parsed = JSON.parse(match[0]) as DetectedService[];
    if (!Array.isArray(parsed) || parsed.length === 0) {
      return fallback(repo);
    }

    return parsed;
  } catch (e) {
    console.warn(`AI analysis failed for ${repo.name}:`, e);
    return fallback(repo);
  }
}

function fallback(repo: RepoInput): DetectedService[] {
  return [
    {
      id: repo.name,
      name: repo.name,
      summary: repo.description ?? "No description available",
      endpoints: [],
      dataTypes: [],
      functions: [],
      dependsOn: [],
    },
  ];
}
