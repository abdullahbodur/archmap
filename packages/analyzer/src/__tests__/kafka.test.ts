import { describe, it, expect } from "vitest";
import { extractKafkaConsumers, extractKafkaProducers } from "../spring/kafka";

describe("extractKafkaConsumers", () => {
  it("returns empty for files without @KafkaListener", () => {
    expect(extractKafkaConsumers({ path: "Foo.java", content: "class Foo {}" })).toEqual([]);
  });

  it("detects a consumer with single topic and groupId", () => {
    const content = `
class OrderConsumer {
  @KafkaListener(topics = "order-events", groupId = "order-group")
  public void handle(OrderCreatedEvent event) {}
}`;
    const result = extractKafkaConsumers({ path: "OrderConsumer.java", content });
    expect(result).toHaveLength(1);
    expect(result[0]).toMatchObject({
      topics: ["order-events"],
      groupId: "order-group",
      handlerMethod: "handle",
      messageType: "OrderCreatedEvent",
      handlerClass: "OrderConsumer",
    });
  });

  it("detects a consumer with multiple topics", () => {
    const content = `
class InventoryConsumer {
  @KafkaListener(topics = {"stock-events", "reserve-events"})
  public void handle(Object event) {}
}`;
    const result = extractKafkaConsumers({ path: "InventoryConsumer.java", content });
    expect(result[0].topics).toEqual(["stock-events", "reserve-events"]);
  });

  it("detects a consumer with property placeholder topic", () => {
    const content = `
class PaymentConsumer {
  @KafkaListener(topics = "\${kafka.topics.payment}")
  public void handle(PaymentEvent event) {}
}`;
    const result = extractKafkaConsumers({ path: "PaymentConsumer.java", content });
    expect(result[0].topics).toEqual(["${kafka.topics.payment}"]);
  });

  it("detects multiple consumers in one class", () => {
    const content = `
class EventConsumer {
  @KafkaListener(topics = "topic-a")
  public void handleA(EventA event) {}

  @KafkaListener(topics = "topic-b")
  public void handleB(EventB event) {}
}`;
    const result = extractKafkaConsumers({ path: "EventConsumer.java", content });
    expect(result).toHaveLength(2);
    expect(result[0].handlerMethod).toBe("handleA");
    expect(result[1].handlerMethod).toBe("handleB");
  });
});

describe("extractKafkaProducers", () => {
  it("returns empty for files without kafkaTemplate", () => {
    expect(extractKafkaProducers({ path: "Foo.java", content: "class Foo {}" })).toEqual([]);
  });

  it("detects kafkaTemplate.send with topic and message type", () => {
    const content = `
class OrderService {
  public void createOrder() {
    kafkaTemplate.send("order-events", new OrderCreatedEvent());
  }
}`;
    const result = extractKafkaProducers({ path: "OrderService.java", content });
    expect(result).toHaveLength(1);
    expect(result[0]).toMatchObject({
      topic: "order-events",
      inClass: "OrderService",
    });
  });

  it("detects multiple producers in one class", () => {
    const content = `
class NotificationService {
  public void onOrder() {
    kafkaTemplate.send("order-events", event);
  }
  public void onPayment() {
    kafkaTemplate.send("payment-events", event);
  }
}`;
    const result = extractKafkaProducers({ path: "NotificationService.java", content });
    expect(result).toHaveLength(2);
    expect(result.map((p) => p.topic)).toEqual(["order-events", "payment-events"]);
  });
});
