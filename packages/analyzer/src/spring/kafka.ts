import type { FileContent, KafkaProducer, KafkaConsumer } from "../types";

function className(content: string): string {
  return content.match(/(?:class|object)\s+(\w+)/)?.[1] ?? "Unknown";
}

/**
 * Parse topic strings from raw annotation text.
 * Handles: "topic", {"t1","t2"}, ["t1","t2"], ${prop.key}
 */
function parseTopics(raw: string): string[] {
  const topics: string[] = [];
  const quoted = /["']([^"']+)["']/g;
  let m: RegExpExecArray | null;
  while ((m = quoted.exec(raw)) !== null) {
    // Skip values that are property placeholders — handled below
    if (!m[1].startsWith("${")) topics.push(m[1]);
  }
  const prop = /\$\{([^}]+)\}/g;
  while ((m = prop.exec(raw)) !== null) topics.push(`\${${m[1]}}`);
  return [...new Set(topics.filter(Boolean))];
}

export function extractKafkaConsumers(file: FileContent): KafkaConsumer[] {
  const { content } = file;
  if (!content.includes("@KafkaListener")) return [];

  const cls = className(content);
  const lines = content.split("\n");
  const results: KafkaConsumer[] = [];

  for (let i = 0; i < lines.length; i++) {
    if (!lines[i].includes("@KafkaListener")) continue;

    // Collect full annotation (may span multiple lines until closing paren)
    let ann = lines[i].trim();
    let j = i;
    while (!ann.includes(")") && j < lines.length - 1) {
      j++;
      ann += " " + lines[j].trim();
    }

    const topicsM = ann.match(/topics\s*=\s*(.+?)(?:,\s*\w+\s*=|$)/);
    const topics = topicsM ? parseTopics(topicsM[1]) : [];
    const groupM = ann.match(/groupId\s*=\s*["']([^"']+)["']/);

    // Look for handler method after annotation block
    let handlerMethod = "unknown";
    let messageType: string | undefined;

    for (let k = j + 1; k < Math.min(j + 6, lines.length); k++) {
      const ml = lines[k].trim();
      if (ml.startsWith("@")) continue;

      // Java: public void handle(UserEvent event, ...
      const javaM = ml.match(
        /(?:public|private|protected|void|\w+)\s+(\w+)\s*\(\s*(?:@\w+\s+)?(\w+(?:<[^>]*>)?)\s+\w+/
      );
      // Kotlin: fun handle(event: UserEvent, ...
      const ktM = ml.match(/fun\s+(\w+)\s*\(\s*\w+\s*:\s*(\w+(?:<[^>]*>)?)/);
      // Kotlin positional: fun handle(UserEvent message, ...
      const ktM2 = ml.match(/fun\s+(\w+)\s*\(\s*(\w+(?:<[^>]*>)?)\s+\w+/);

      if (javaM) { handlerMethod = javaM[1]; messageType = javaM[2]; break; }
      if (ktM)   { handlerMethod = ktM[1];   messageType = ktM[2];   break; }
      if (ktM2)  { handlerMethod = ktM2[1];  messageType = ktM2[2];  break; }
    }

    if (topics.length > 0) {
      results.push({
        topics,
        groupId: groupM?.[1],
        handlerMethod,
        handlerClass: cls,
        messageType,
      });
    }
  }

  return results;
}

export function extractKafkaProducers(file: FileContent): KafkaProducer[] {
  const { content } = file;
  if (!content.includes("kafkaTemplate") && !content.includes("KafkaTemplate")) return [];

  const cls = className(content);
  const lines = content.split("\n");
  const results: KafkaProducer[] = [];

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim();

    // kafkaTemplate.send("topic-name", ...) or kafkaTemplate.send("topic", key, value)
    const sendM = line.match(/kafkaTemplate\.send\s*\(\s*["']([^"']+)["']/i);
    if (!sendM) continue;

    // Try to infer message type from the second argument
    const typeM = line.match(/kafkaTemplate\.send\s*\([^,]+,\s*(?:new\s+)?(\w+(?:<[^>]*>)?)\s*[,(]/);
    results.push({
      topic: sendM[1],
      messageType: typeM?.[1],
      inClass: cls,
    });
  }

  return results;
}
