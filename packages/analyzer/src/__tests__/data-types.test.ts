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
