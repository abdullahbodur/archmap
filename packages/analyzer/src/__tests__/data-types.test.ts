import { describe, it, expect } from "vitest";
import { extractDataTypes } from "../spring/data-types";

describe("extractDataTypes", () => {
  it("returns empty for plain class with no annotations or naming convention", () => {
    const content = `public class OrderService { private String name; }`;
    expect(extractDataTypes({ path: "OrderService.java", content })).toEqual([]);
  });

  it("detects @Entity class with role 'entity'", () => {
    const content = `
@Entity
@Table(name = "orders")
public class Order {
  private Long id;
  private String status;
}`;
    const result = extractDataTypes({ path: "Order.java", content });
    expect(result).toHaveLength(1);
    expect(result[0]).toMatchObject({ name: "Order", role: "entity" });
  });

  it("detects class named *Request with role 'request'", () => {
    const content = `
public class CreateOrderRequest {
  private String productId;
  private int quantity;
}`;
    const result = extractDataTypes({ path: "CreateOrderRequest.java", content });
    expect(result).toHaveLength(1);
    expect(result[0]).toMatchObject({ name: "CreateOrderRequest", role: "request" });
  });

  it("detects class named *Response with role 'response'", () => {
    const content = `
public class OrderResponse {
  private String orderId;
  private String status;
}`;
    const result = extractDataTypes({ path: "OrderResponse.java", content });
    expect(result[0]).toMatchObject({ name: "OrderResponse", role: "response" });
  });

  it("detects class named *Event with role 'event'", () => {
    const content = `
public class OrderCreatedEvent {
  private String orderId;
  private String customerId;
}`;
    const result = extractDataTypes({ path: "OrderCreatedEvent.java", content });
    expect(result[0]).toMatchObject({ name: "OrderCreatedEvent", role: "event" });
  });

  it("detects @Data annotated class as dto", () => {
    const content = `
@Data
public class StockLevel {
  private String productId;
  private int quantity;
}`;
    const result = extractDataTypes({ path: "StockLevel.java", content });
    expect(result).toHaveLength(1);
    expect(result[0].role).toBe("dto");
  });

  it("extracts fields correctly", () => {
    const content = `
public class CreateOrderRequest {
  private String productId;
  private int quantity;
}`;
    const result = extractDataTypes({ path: "CreateOrderRequest.java", content });
    expect(result[0].fields).toEqual(
      expect.arrayContaining([
        { name: "productId", type: "String" },
        { name: "quantity", type: "int" },
      ])
    );
  });

  it("skips Controller, Service, Repository, and Test classes", () => {
    const skipped = [
      `public class OrderController {}`,
      `public class OrderService { private String x; }`,
      `public class OrderRepository {}`,
      `public class OrderTest {}`,
    ];
    for (const content of skipped) {
      expect(extractDataTypes({ path: "Foo.java", content })).toEqual([]);
    }
  });
});

describe("extractDataTypes — enums", () => {
  it("detects a basic enum and assigns role dto", () => {
    const content = `
public enum ReservationStatus {
    RESERVED,
    INSUFFICIENT_STOCK,
    RELEASED,
    FULFILLED
}`;
    const result = extractDataTypes({ path: "ReservationStatus.java", content });
    expect(result).toHaveLength(1);
    expect(result[0]).toMatchObject({ name: "ReservationStatus", role: "dto" });
  });

  it("extracts enum constants as fields with type 'enum constant'", () => {
    const content = `
public enum OrderStatus {
    PENDING,
    CONFIRMED,
    SHIPPED
}`;
    const result = extractDataTypes({ path: "OrderStatus.java", content });
    expect(result[0].fields).toEqual(
      expect.arrayContaining([
        { name: "PENDING",    type: "enum constant" },
        { name: "CONFIRMED",  type: "enum constant" },
        { name: "SHIPPED",    type: "enum constant" },
      ])
    );
  });

  it("handles enums with constructor arguments", () => {
    const content = `
public enum ValidationOutcome {
    PASSED,
    FAILED_FRAUD,
    FAILED_CREDIT
}`;
    const result = extractDataTypes({ path: "ValidationOutcome.java", content });
    expect(result).toHaveLength(1);
    expect(result[0].fields.map((f) => f.name)).toEqual(
      expect.arrayContaining(["PASSED", "FAILED_FRAUD", "FAILED_CREDIT"])
    );
  });

  it("does not detect enums with no constants as a data type", () => {
    const content = `public enum Empty {}`;
    const result = extractDataTypes({ path: "Empty.java", content });
    expect(result).toHaveLength(0);
  });

  it("detects enum and class in same file independently", () => {
    const content = `
public enum Status { ACTIVE, INACTIVE }

public class UserDto {
    private String name;
    private Status status;
}`;
    const result = extractDataTypes({ path: "UserDto.java", content });
    const names = result.map((r) => r.name);
    expect(names).toContain("Status");
    expect(names).toContain("UserDto");
  });
});
