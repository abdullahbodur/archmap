import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdtempSync, writeFileSync, mkdirSync, rmdirSync, rmSync } from "fs";
import { tmpdir } from "os";
import { join } from "path";
import { parseRepoConfig, resolveInfraRefsLocal } from "../config";

// ─── parseRepoConfig ──────────────────────────────────────────────────────────

describe("parseRepoConfig", () => {
  it("returns null for invalid YAML", () => {
    expect(parseRepoConfig("{ invalid: yaml: : :")).toBeNull();
  });

  it("parses basic fields", () => {
    const yaml = `
name: Order Service
description: Handles orders
type: service
domain: commerce
skip: false
depends_on:
  - inventory-service
tags:
  - rest
  - critical
`;
    const config = parseRepoConfig(yaml);
    expect(config).not.toBeNull();
    expect(config!.name).toBe("Order Service");
    expect(config!.description).toBe("Handles orders");
    expect(config!.type).toBe("service");
    expect(config!.domain).toBe("commerce");
    expect(config!.skip).toBe(false);
    expect(config!.depends_on).toEqual(["inventory-service"]);
    expect(config!.tags).toEqual(["rest", "critical"]);
  });

  it("treats skip: true correctly", () => {
    const config = parseRepoConfig("skip: true");
    expect(config!.skip).toBe(true);
  });

  it("accepts group as alias for domain", () => {
    const config = parseRepoConfig("group: payments");
    expect(config!.domain).toBe("payments");
  });

  it("ignores unknown type values", () => {
    const config = parseRepoConfig("type: unknown-thing");
    expect(config!.type).toBeUndefined();
  });

  it("parses inline infrastructure with all fields", () => {
    const yaml = `
infrastructure:
  - id: orders-db
    name: Orders DB
    type: database
    technology: PostgreSQL 14
    description: Primary store
`;
    const config = parseRepoConfig(yaml);
    expect(config!.infrastructure).toHaveLength(1);
    const node = config!.infrastructure![0];
    expect(node.id).toBe("orders-db");
    expect(node.name).toBe("Orders DB");
    expect(node.type).toBe("database");
    expect(node.technology).toBe("PostgreSQL 14");
    expect(node.description).toBe("Primary store");
  });

  it("parses infrastructure entry with only id and ref", () => {
    const yaml = `
infrastructure:
  - id: orders-db
    ref: ./infra/postgres-archmap.yml
`;
    const config = parseRepoConfig(yaml);
    expect(config!.infrastructure).toHaveLength(1);
    expect(config!.infrastructure![0].id).toBe("orders-db");
    expect(config!.infrastructure![0].ref).toBe("./infra/postgres-archmap.yml");
    expect(config!.infrastructure![0].name).toBeUndefined();
  });

  it("skips infrastructure entries without an id", () => {
    const yaml = `
infrastructure:
  - name: Orphan
    type: database
`;
    const config = parseRepoConfig(yaml);
    expect(config!.infrastructure).toBeUndefined();
  });

  it("skips entries with invalid infra type but keeps valid ones", () => {
    const yaml = `
infrastructure:
  - id: db
    name: DB
    type: database
  - id: unknown
    name: Unknown
    type: not-a-type
`;
    const config = parseRepoConfig(yaml);
    expect(config!.infrastructure).toHaveLength(2);
    expect(config!.infrastructure![0].type).toBe("database");
    expect(config!.infrastructure![1].type).toBeUndefined();
  });

  it("parses all four valid infra types", () => {
    const yaml = `
infrastructure:
  - id: db
    name: DB
    type: database
  - id: q
    name: Q
    type: queue
  - id: c
    name: C
    type: cache
  - id: e
    name: E
    type: external
`;
    const config = parseRepoConfig(yaml);
    const types = config!.infrastructure!.map((n) => n.type);
    expect(types).toEqual(["database", "queue", "cache", "external"]);
  });

  it("returns undefined infrastructure when section is absent", () => {
    const config = parseRepoConfig("name: Service");
    expect(config!.infrastructure).toBeUndefined();
  });

  it("parses internal: true on an infra entry", () => {
    const yaml = `infrastructure:\n  - id: db\n    name: DB\n    type: database\n    internal: true`;
    expect(parseRepoConfig(yaml)!.infrastructure![0].internal).toBe(true);
  });

  it("internal is absent (not set) when not specified", () => {
    const yaml = `infrastructure:\n  - id: db\n    name: DB\n    type: database`;
    expect(parseRepoConfig(yaml)!.infrastructure![0].internal).toBeUndefined();
  });
});

// ─── resolveInfraRefsLocal ────────────────────────────────────────────────────

describe("resolveInfraRefsLocal", () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = mkdtempSync(join(tmpdir(), "archmap-test-"));
    mkdirSync(join(tmpDir, "infra"), { recursive: true });
  });

  afterEach(() => {
    rmSync(tmpDir, { recursive: true, force: true });
  });

  it("returns undefined for empty input", () => {
    expect(resolveInfraRefsLocal(undefined, tmpDir)).toBeUndefined();
    expect(resolveInfraRefsLocal([], tmpDir)).toBeUndefined();
  });

  it("resolves a same-repo ref and merges fields", () => {
    writeFileSync(join(tmpDir, "infra", "postgres-archmap.yml"), `
id: orders-db
name: Orders DB
type: database
technology: PostgreSQL 14
description: Primary store
`);
    const decls = [{ id: "orders-db", ref: "./infra/postgres-archmap.yml" }];
    const result = resolveInfraRefsLocal(decls, tmpDir);
    expect(result).toHaveLength(1);
    expect(result![0].name).toBe("Orders DB");
    expect(result![0].type).toBe("database");
    expect(result![0].technology).toBe("PostgreSQL 14");
  });

  it("inline fields override ref file fields", () => {
    writeFileSync(join(tmpDir, "infra", "postgres-archmap.yml"), `
id: orders-db
name: Generic DB
type: database
technology: PostgreSQL 14
`);
    const decls = [{ id: "orders-db", name: "My Custom DB", ref: "./infra/postgres-archmap.yml" }];
    const result = resolveInfraRefsLocal(decls, tmpDir);
    expect(result![0].name).toBe("My Custom DB");
    expect(result![0].technology).toBe("PostgreSQL 14");
  });

  it("skips nodes where ref cannot be resolved and name/type are missing", () => {
    const decls = [{ id: "missing", ref: "./infra/does-not-exist.yml" }];
    const result = resolveInfraRefsLocal(decls, tmpDir);
    expect(result).toBeUndefined();
  });

  it("includes fully inline nodes without a ref", () => {
    const decls = [{ id: "kafka", name: "Apache Kafka", type: "queue" as const }];
    const result = resolveInfraRefsLocal(decls, tmpDir);
    expect(result).toHaveLength(1);
    expect(result![0].name).toBe("Apache Kafka");
  });

  it("skips inline nodes missing name or type", () => {
    const decls = [{ id: "incomplete" }];
    const result = resolveInfraRefsLocal(decls, tmpDir);
    expect(result).toBeUndefined();
  });

  it("resolves multiple nodes including one ref and one inline", () => {
    writeFileSync(join(tmpDir, "infra", "postgres-archmap.yml"), `
id: orders-db
name: Orders DB
type: database
`);
    const decls = [
      { id: "orders-db", ref: "./infra/postgres-archmap.yml" },
      { id: "kafka", name: "Apache Kafka", type: "queue" as const },
    ];
    const result = resolveInfraRefsLocal(decls, tmpDir);
    expect(result).toHaveLength(2);
    expect(result!.map((n) => n.id)).toEqual(["orders-db", "kafka"]);
  });

  it("ignores cross-repo refs (non-relative paths)", () => {
    const decls = [{ id: "kafka", ref: "shared-infra/kafka-archmap.yml" }];
    const result = resolveInfraRefsLocal(decls, tmpDir);
    // cross-repo ref, no inline name/type → skipped
    expect(result).toBeUndefined();
  });
});
