import { describe, it, expect } from "vitest";
import { buildExample, exampleValue } from "./buildDtoExample";
import type { DataType } from "@/types/graph";

function makeDto(name: string, fields: { name: string; type: string }[]): DataType {
  return { name, fields, producedBy: [], consumedBy: [] };
}

function makeMap(...dtos: DataType[]): Map<string, DataType> {
  return new Map(dtos.map((d) => [d.name, d]));
}

describe("exampleValue — primitives", () => {
  const empty = new Map<string, DataType>();

  it("String → 'string'", () => {
    expect(exampleValue("value", "String", empty, new Set())).toBe("string");
  });

  it("String with 'email' in field name → email address", () => {
    expect(exampleValue("email", "String", empty, new Set())).toBe("user@example.com");
  });

  it("String with 'name' in field name → human name", () => {
    expect(exampleValue("firstName", "String", empty, new Set())).toBe("Example Name");
  });

  it("String with 'sku' in field name → SKU-001", () => {
    expect(exampleValue("productSku", "String", empty, new Set())).toBe("SKU-001");
  });

  it("UUID → uuid string", () => {
    expect(exampleValue("id", "UUID", empty, new Set())).toBe("550e8400-e29b-41d4-a716-446655440000");
  });

  it("Integer / int → 1", () => {
    expect(exampleValue("qty", "Integer", empty, new Set())).toBe(1);
    expect(exampleValue("qty", "int",     empty, new Set())).toBe(1);
  });

  it("Long / long → 1000", () => {
    expect(exampleValue("ts", "Long", empty, new Set())).toBe(1000);
  });

  it("BigDecimal → '9.99'", () => {
    expect(exampleValue("price", "BigDecimal", empty, new Set())).toBe("9.99");
  });

  it("Boolean / boolean → true", () => {
    expect(exampleValue("active", "Boolean", empty, new Set())).toBe(true);
    expect(exampleValue("active", "boolean", empty, new Set())).toBe(true);
  });

  it("Instant / LocalDateTime → ISO datetime string", () => {
    expect(exampleValue("createdAt", "Instant",       empty, new Set())).toBe("2024-01-01T00:00:00Z");
    expect(exampleValue("createdAt", "LocalDateTime", empty, new Set())).toBe("2024-01-01T00:00:00Z");
  });

  it("LocalDate → date string", () => {
    expect(exampleValue("date", "LocalDate", empty, new Set())).toBe("2024-01-01");
  });

  it("unknown type with no DTO match → uppercased type name", () => {
    expect(exampleValue("thing", "SomeUnknownType", empty, new Set())).toBe("SOMEUNKNOWNTYPE");
  });
});

describe("exampleValue — collections", () => {
  const empty = new Map<string, DataType>();

  it("List<String> → ['string']", () => {
    expect(exampleValue("tags", "List<String>", empty, new Set())).toEqual(["string"]);
  });

  it("Set<Integer> → [1]", () => {
    expect(exampleValue("ids", "Set<Integer>", empty, new Set())).toEqual([1]);
  });

  it("Map → { key: 'value' }", () => {
    expect(exampleValue("meta", "Map", empty, new Set())).toEqual({ key: "value" });
  });
});

describe("exampleValue — nested DTOs and enums", () => {
  it("resolves nested DTO by type name recursively", () => {
    const address = makeDto("Address", [{ name: "street", type: "String" }]);
    const dtoMap = makeMap(address);
    const result = exampleValue("address", "Address", dtoMap, new Set()) as Record<string, unknown>;
    expect(result).toEqual({ street: "string" });
  });

  it("resolves enum by returning the first constant as a string", () => {
    const status = makeDto("OrderStatus", [
      { name: "PENDING",   type: "enum constant" },
      { name: "CONFIRMED", type: "enum constant" },
    ]);
    const dtoMap = makeMap(status);
    expect(exampleValue("status", "OrderStatus", dtoMap, new Set())).toBe("PENDING");
  });

  it("cycle protection: circular reference returns <TypeName>", () => {
    const a = makeDto("A", [{ name: "b", type: "B" }]);
    const b = makeDto("B", [{ name: "a", type: "A" }]);
    const dtoMap = makeMap(a, b);
    const visited = new Set(["A"]); // simulate being inside A already
    expect(exampleValue("a", "A", dtoMap, visited)).toBe("<A>");
  });

  it("List<NestedDto> expands the nested DTO inside the array", () => {
    const item = makeDto("OrderItem", [{ name: "qty", type: "Integer" }]);
    const dtoMap = makeMap(item);
    const result = exampleValue("items", "List<OrderItem>", dtoMap, new Set()) as unknown[];
    expect(result).toHaveLength(1);
    expect(result[0]).toEqual({ qty: 1 });
  });
});

describe("buildExample", () => {
  it("builds a flat example object from DTO fields", () => {
    const dto = makeDto("CreateOrderRequest", [
      { name: "productSku", type: "String" },
      { name: "quantity",   type: "Integer" },
      { name: "active",     type: "Boolean" },
    ]);
    const result = buildExample(dto, new Map());
    expect(result).toEqual({
      productSku: "SKU-001",
      quantity:   1,
      active:     true,
    });
  });

  it("skips enum constant fields", () => {
    const dto = makeDto("OrderStatus", [
      { name: "PENDING",   type: "enum constant" },
      { name: "CONFIRMED", type: "enum constant" },
    ]);
    const result = buildExample(dto, new Map());
    expect(result).toEqual({});
  });

  it("expands nested DTO fields inline", () => {
    const address = makeDto("Address", [{ name: "city", type: "String" }]);
    const order = makeDto("OrderDto", [{ name: "shippingAddress", type: "Address" }]);
    const dtoMap = makeMap(address);
    const result = buildExample(order, dtoMap);
    expect(result).toEqual({ shippingAddress: { city: "string" } });
  });

  it("resolves enum field to first constant value", () => {
    const status = makeDto("OrderStatus", [
      { name: "PENDING", type: "enum constant" },
    ]);
    const order = makeDto("OrderDto", [{ name: "status", type: "OrderStatus" }]);
    const dtoMap = makeMap(status);
    const result = buildExample(order, dtoMap);
    expect(result.status).toBe("PENDING");
  });
});
