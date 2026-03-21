import { describe, it, expect } from "vitest";
import { extractFeignClients, extractRestClientCalls } from "../spring/clients";

describe("extractFeignClients", () => {
  it("returns empty for files without @FeignClient", () => {
    expect(extractFeignClients({ path: "Foo.java", content: "class Foo {}" })).toEqual([]);
  });

  it("detects @FeignClient with name attribute", () => {
    const content = `
@FeignClient(name = "payment-service")
public interface PaymentClient {
  void pay();
}`;
    const result = extractFeignClients({ path: "PaymentClient.java", content });
    expect(result).toHaveLength(1);
    expect(result[0]).toMatchObject({
      serviceName: "payment-service",
      interfaceName: "PaymentClient",
    });
  });

  it("detects @FeignClient with value attribute", () => {
    const content = `
@FeignClient(value = "inventory-service")
public interface InventoryClient {}`;
    const result = extractFeignClients({ path: "InventoryClient.java", content });
    expect(result[0].serviceName).toBe("inventory-service");
  });

  it("detects @FeignClient with url attribute", () => {
    const content = `
@FeignClient(name = "external-service", url = "http://external-service/api")
public interface ExternalClient {}`;
    const result = extractFeignClients({ path: "ExternalClient.java", content });
    expect(result[0]).toMatchObject({
      serviceName: "external-service",
      url: "http://external-service/api",
    });
  });
});

describe("extractRestClientCalls", () => {
  it("detects restTemplate.getForObject call", () => {
    const content = `
class OrderService {
  public Order getOrder() {
    return restTemplate.getForObject("http://inventory-service/api/stock", Order.class);
  }
}`;
    const result = extractRestClientCalls({ path: "OrderService.java", content });
    expect(result).toHaveLength(1);
    expect(result[0]).toMatchObject({
      via: "resttemplate",
      targetService: "inventory-service",
    });
  });

  it("detects restTemplate.postForObject call", () => {
    const content = `
class PaymentService {
  public Receipt pay() {
    return restTemplate.postForObject("http://payment-service/pay", request, Receipt.class);
  }
}`;
    const result = extractRestClientCalls({ path: "PaymentService.java", content });
    expect(result[0].via).toBe("resttemplate");
    expect(result[0].targetService).toBe("payment-service");
  });

  it("detects WebClient.create base URL", () => {
    const content = `
class ShippingService {
  private WebClient client = WebClient.create("http://shipping-service");
}`;
    const result = extractRestClientCalls({ path: "ShippingService.java", content });
    expect(result).toHaveLength(1);
    expect(result[0]).toMatchObject({
      via: "webclient",
      targetService: "shipping-service",
    });
  });

  it("does not extract target service from property placeholder URLs", () => {
    const content = `
class FooService {
  private WebClient client = WebClient.create("\${service.url}");
}`;
    const result = extractRestClientCalls({ path: "FooService.java", content });
    expect(result.every((r) => r.targetService === undefined)).toBe(true);
  });
});
