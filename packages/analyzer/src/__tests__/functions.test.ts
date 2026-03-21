import { describe, it, expect } from "vitest";
import { extractFunctions } from "../spring/functions";

describe("extractFunctions", () => {
  it("detects a public method", () => {
    const content = `
public class OrderService {
  public Order createOrder(CreateOrderRequest request) {
    return new Order();
  }
}`;
    const result = extractFunctions({ path: "OrderService.java", content });
    expect(result.some((f) => f.name === "createOrder")).toBe(true);
  });

  it("skips getter methods", () => {
    const content = `
public class OrderService {
  public String getStatus() { return status; }
  public boolean isActive() { return active; }
}`;
    const result = extractFunctions({ path: "OrderService.java", content });
    expect(result).toHaveLength(0);
  });

  it("detects bean calls on injected service", () => {
    const content = `
public class OrderService {
  public Order createOrder(CreateOrderRequest request) {
    inventoryService.reserveStock(request.getProductId());
    return new Order();
  }
}`;
    const result = extractFunctions({ path: "OrderService.java", content });
    const createOrder = result.find((f) => f.name === "createOrder");
    expect(createOrder?.callsBeanMethods).toEqual(
      expect.arrayContaining([
        { beanVariable: "inventoryService", methodName: "reserveStock" },
      ])
    );
    expect(createOrder?.callsServices).toContain("inventory");
  });

  it("detects intra-class method calls", () => {
    const content = `
public class OrderService {
  public Order createOrder(CreateOrderRequest request) {
    validateOrder(request);
    return new Order();
  }

  public void validateOrder(CreateOrderRequest request) {}
}`;
    const result = extractFunctions({ path: "OrderService.java", content });
    const createOrder = result.find((f) => f.name === "createOrder");
    expect(createOrder?.callsMethods).toContain("validateOrder");
  });

  it("does not include skipped methods in callsMethods", () => {
    const content = `
public class OrderService {
  public Order processOrder() {
    return getOrder();
  }
  public Order getOrder() { return null; }
}`;
    const result = extractFunctions({ path: "OrderService.java", content });
    const processOrder = result.find((f) => f.name === "processOrder");
    expect(processOrder?.callsMethods ?? []).not.toContain("getOrder");
  });

  it("detects multiple bean calls across services", () => {
    const content = `
public class OrderService {
  public void fulfillOrder() {
    inventoryService.reserveStock(id);
    paymentService.charge(amount);
    notificationService.send(msg);
  }
}`;
    const result = extractFunctions({ path: "OrderService.java", content });
    const fulfill = result.find((f) => f.name === "fulfillOrder");
    expect(fulfill?.callsServices).toEqual(
      expect.arrayContaining(["inventory", "payment", "notification"])
    );
  });
});
