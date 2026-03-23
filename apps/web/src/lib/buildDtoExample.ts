import type { DataType } from "@/types/graph";

export function exampleValue(
  fieldName: string,
  typeName: string,
  dtoMap: Map<string, DataType>,
  visited: Set<string>
): unknown {
  const genericMatch = typeName.match(/^(\w+)<(.+)>$/);
  const baseType = genericMatch ? genericMatch[1] : typeName;
  const innerType = genericMatch ? genericMatch[2].trim() : null;

  if (baseType === "List" || baseType === "Set" || baseType === "Collection") {
    const item = innerType ? exampleValue(fieldName, innerType, dtoMap, visited) : "item";
    return [item];
  }
  if (baseType === "Map") return { key: "value" };

  switch (baseType) {
    case "String":
      return fieldName.toLowerCase().includes("email") ? "user@example.com"
           : fieldName.toLowerCase().includes("name")  ? "Example Name"
           : fieldName.toLowerCase().includes("sku")   ? "SKU-001"
           : fieldName.toLowerCase().includes("url")   ? "https://example.com"
           : "string";
    case "UUID":         return "550e8400-e29b-41d4-a716-446655440000";
    case "Integer":
    case "int":          return 1;
    case "Long":
    case "long":         return 1000;
    case "Double":
    case "double":
    case "Float":
    case "float":        return 0.0;
    case "BigDecimal":   return "9.99";
    case "Boolean":
    case "boolean":      return true;
    case "Instant":
    case "LocalDateTime":return "2024-01-01T00:00:00Z";
    case "LocalDate":    return "2024-01-01";
    case "LocalTime":    return "12:00:00";
    case "byte[]":       return "<binary>";
    case "Object":       return {};
  }

  if (dtoMap.has(baseType)) {
    if (visited.has(baseType)) return `<${baseType}>`;
    const nested = dtoMap.get(baseType)!;
    if (nested.fields.length > 0 && nested.fields.every((f) => f.type === "enum constant")) {
      return nested.fields[0].name;
    }
    return buildExample(nested, dtoMap, new Set(visited).add(baseType));
  }

  return baseType.toUpperCase();
}

export function buildExample(
  dto: DataType,
  dtoMap: Map<string, DataType>,
  visited: Set<string> = new Set()
): Record<string, unknown> {
  const obj: Record<string, unknown> = {};
  for (const field of dto.fields) {
    if (field.type === "enum constant") continue;
    obj[field.name] = exampleValue(field.name, field.type, dtoMap, visited);
  }
  return obj;
}
