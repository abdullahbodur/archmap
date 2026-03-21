import { describe, it, expect } from "vitest";
import { extractEndpoints } from "../spring/endpoints";

describe("extractEndpoints", () => {
  it("returns empty array for non-controller files", () => {
    const result = extractEndpoints({ path: "OrderService.java", content: "public class OrderService {}" });
    expect(result).toEqual([]);
  });

  it("detects a simple GET endpoint", () => {
    const content = `
@RestController
public class OrderController {
  @GetMapping("/orders")
  public List<Order> getOrders() { return orders; }
}`;
    const result = extractEndpoints({ path: "OrderController.java", content });
    expect(result).toHaveLength(1);
    expect(result[0]).toMatchObject({
      method: "GET",
      path: "/orders",
      handlerClass: "OrderController",
      handlerMethod: "getOrders",
      outputType: "List<Order>",
    });
  });

  it("detects a POST endpoint with @RequestBody", () => {
    const content = `
@RestController
public class OrderController {
  @PostMapping("/orders")
  public Order createOrder(@RequestBody CreateOrderRequest request) { return order; }
}`;
    const result = extractEndpoints({ path: "OrderController.java", content });
    expect(result).toHaveLength(1);
    expect(result[0]).toMatchObject({
      method: "POST",
      path: "/orders",
      inputType: "CreateOrderRequest",
    });
  });

  it("combines class-level @RequestMapping with method-level path", () => {
    const content = `
@RestController
@RequestMapping("/api/v1")
public class UserController {
  @GetMapping("/users")
  public List<User> listUsers() { return users; }
}`;
    const result = extractEndpoints({ path: "UserController.java", content });
    expect(result[0].path).toBe("/api/v1/users");
  });

  it("detects multiple endpoints in one controller", () => {
    const content = `
@RestController
@RequestMapping("/items")
public class ItemController {
  @GetMapping("/")
  public List<Item> list() { return items; }

  @PostMapping("/")
  public Item create(@RequestBody CreateItemRequest req) { return item; }

  @DeleteMapping("/{id}")
  public void delete() {}
}`;
    const result = extractEndpoints({ path: "ItemController.java", content });
    expect(result).toHaveLength(3);
    expect(result.map((e) => e.method)).toEqual(["GET", "POST", "DELETE"]);
  });

  it("detects PUT and PATCH endpoints", () => {
    const content = `
@RestController
public class ProductController {
  @PutMapping("/products/{id}")
  public Product update(@RequestBody UpdateProductRequest req) { return product; }

  @PatchMapping("/products/{id}/status")
  public Product patch() { return product; }
}`;
    const result = extractEndpoints({ path: "ProductController.java", content });
    expect(result).toHaveLength(2);
    expect(result[0].method).toBe("PUT");
    expect(result[1].method).toBe("PATCH");
  });

  it("normalizes double slashes in combined path", () => {
    const content = `
@RestController
@RequestMapping("/api/")
public class FooController {
  @GetMapping("/bar")
  public String bar() { return "bar"; }
}`;
    const result = extractEndpoints({ path: "FooController.java", content });
    expect(result[0].path).not.toContain("//");
  });
});
