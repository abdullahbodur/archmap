import type { FileContent, FeignClient, RestClientCall } from "../types";

function className(content: string): string {
  return content.match(/(?:interface|class|object)\s+(\w+)/)?.[1] ?? "Unknown";
}

/** Extract service hostname from a URL like http://payment-service/api/... */
function serviceFromUrl(url: string): string | undefined {
  // Skip property placeholders
  if (url.startsWith("${")) return undefined;
  const m = url.match(/https?:\/\/([a-zA-Z0-9_-]+?)(?::\d+)?(?:\/|$)/);
  return m?.[1];
}

export function extractFeignClients(file: FileContent): FeignClient[] {
  const { content } = file;
  if (!content.includes("@FeignClient")) return [];

  const cls = className(content);
  const results: FeignClient[] = [];

  // @FeignClient(name = "svc") or @FeignClient(value = "svc") or @FeignClient("svc")
  const pattern = /@FeignClient\s*\(([^)]+)\)/g;
  let m: RegExpExecArray | null;
  while ((m = pattern.exec(content)) !== null) {
    const ann = m[1];
    const nameM = ann.match(/(?:name|value)\s*=\s*["']([^"']+)["']/) ?? ann.match(/^\s*["']([^"']+)["']/);
    const urlM  = ann.match(/url\s*=\s*["']([^"']+)["']/);
    if (nameM) {
      results.push({ serviceName: nameM[1], url: urlM?.[1], interfaceName: cls });
    }
  }

  return results;
}

export function extractRestClientCalls(file: FileContent): RestClientCall[] {
  const { content } = file;
  const cls = className(content);
  const results: RestClientCall[] = [];
  const lines = content.split("\n");

  for (const line of lines) {
    const t = line.trim();

    // RestTemplate.getForObject/getForEntity/postForObject/postForEntity/exchange/put/delete
    const rtM = t.match(
      /restTemplate\.(getForObject|getForEntity|postForObject|postForEntity|put|delete|exchange)\s*\(\s*["']([^"']+)["']/i
    );
    if (rtM) {
      const url = rtM[2];
      results.push({
        targetUrl: url,
        targetService: serviceFromUrl(url),
        httpMethod: rtM[1].replace(/ForObject|ForEntity/i, "").toUpperCase().replace("EXCHANGE", "?"),
        via: "resttemplate",
        inClass: cls,
      });
      continue;
    }

    // WebClient — .uri("...") call
    const wcM = t.match(/\.uri\s*\(\s*["']([^"']+)["']/);
    if (wcM && (content.includes("WebClient") || content.includes("webClient"))) {
      const url = wcM[1];
      results.push({
        targetUrl: url,
        targetService: serviceFromUrl(url),
        via: "webclient",
        inClass: cls,
      });
      continue;
    }

    // WebClient.create("http://service") or WebClient.builder().baseUrl("...")
    const wcBaseM = t.match(/(?:WebClient\.create|baseUrl)\s*\(\s*["']([^"']+)["']/);
    if (wcBaseM) {
      const url = wcBaseM[1];
      const svc = serviceFromUrl(url);
      if (svc) {
        results.push({ targetUrl: url, targetService: svc, via: "webclient", inClass: cls });
      }
    }
  }

  return results;
}
