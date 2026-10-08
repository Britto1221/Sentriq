import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { buildApp } from "../app";
import type { ApiConfig } from "../config";
import * as database from "./index";
import { migrateDatabase, openDatabase } from "./index";

describe("review regressions", { timeout: 30_000 }, () => {
  it("rejects audit TRUNCATE and preserves its records", async () => {
    const db = await openDatabase("memory://");
    try {
      await migrateDatabase(db.client);
      await db.client.exec(`
        INSERT INTO tenants(id,name) VALUES ('tenant','Synthetic');
        INSERT INTO applications(id,tenant_id,name,origins,rp_id) VALUES ('app','tenant','Synthetic','[]','localhost');
        INSERT INTO audit_events(id,tenant_id,application_id,type,outcome,reason_code,correlation_id)
          VALUES ('event','tenant','app','AUTH_LOGIN_FAILED','FAILURE','invalid_credentials','synthetic');
      `);
      await expect(db.client.exec("TRUNCATE audit_events")).rejects.toThrow("audit events are append-only");
      expect((await db.client.query("SELECT id FROM audit_events")).rows).toEqual([{ id: "event" }]);
    } finally { await db.client.close(); }
  });

  it("fails readiness on a mismatched migration checksum and recovers after restoration", async () => {
    const db = await openDatabase("memory://");
    const config: ApiConfig = { nodeEnv: "test", host: "127.0.0.1", port: 4000, dataDir: "memory://", rateLimitMax: 100, rateLimitWindowMs: 60_000, logLevel: "silent" };
    const app = await buildApp({ database: db, config });
    try {
      await migrateDatabase(db.client);
      expect((await app.inject({ url: "/health" })).statusCode).toBe(200);
      const checksum = (await db.client.query<{ checksum: string }>("SELECT checksum FROM schema_migrations WHERE name='0001_foundation'")).rows[0]!.checksum;
      await db.client.query("UPDATE schema_migrations SET checksum=$1 WHERE name='0001_foundation'", ["f".repeat(64)]);
      expect((await app.inject({ url: "/health" })).statusCode).toBe(503);
      await db.client.query("UPDATE schema_migrations SET checksum=$1 WHERE name='0001_foundation'", [checksum]);
      expect((await app.inject({ url: "/health" })).statusCode).toBe(200);
    } finally { await app.close(); await db.client.close(); }
  });

  it("verifies schema without writes and rejects missing columns or disabled audit guards", async () => {
    const db = await openDatabase("memory://");
    try {
      await migrateDatabase(db.client);
      expect(typeof database.verifyDatabase).toBe("function");
      const before = (await db.client.query("SELECT * FROM schema_migrations ORDER BY name")).rows;
      await db.client.exec("SET default_transaction_read_only = on");
      await database.verifyDatabase(db.client);
      await db.client.exec("SET default_transaction_read_only = off");
      expect((await db.client.query("SELECT * FROM schema_migrations ORDER BY name")).rows).toEqual(before);
      await db.client.exec("ALTER TABLE users DROP COLUMN display_name");
      await expect(database.verifyDatabase(db.client)).rejects.toThrow("Database schema verification failed");
      await db.client.exec("ALTER TABLE users ADD COLUMN display_name text NOT NULL");
      await database.verifyDatabase(db.client);
      await db.client.exec("ALTER TABLE audit_events DISABLE TRIGGER audit_events_no_truncate");
      await expect(database.verifyDatabase(db.client)).rejects.toThrow("Database schema verification failed");
    } finally { await db.client.close(); }
  });

  it("blocks production initialization on bad checksums or missing migrations without migrating", async () => {
    expect(typeof database.initializeDatabase).toBe("function");
    const dir = await mkdtemp(join(tmpdir(), "sentriq-review-production-"));
    const config: ApiConfig = { nodeEnv: "production", host: "127.0.0.1", port: 4000, dataDir: join(dir, "db"), rateLimitMax: 100, rateLimitWindowMs: 60_000, logLevel: "silent" };
    try {
      const initial = await openDatabase(config.dataDir);
      await migrateDatabase(initial.client);
      await initial.client.close();
      const healthy = await database.initializeDatabase(config);
      const checksum = (await healthy.client.query<{ checksum: string }>("SELECT checksum FROM schema_migrations WHERE name='0002_audit_truncate'")).rows[0]!.checksum;
      await healthy.client.query("UPDATE schema_migrations SET checksum=$1 WHERE name='0002_audit_truncate'", ["f".repeat(64)]);
      await healthy.client.close();
      await expect(database.initializeDatabase(config)).rejects.toThrow("Applied migration checksum mismatch");
      const corrected = await openDatabase(config.dataDir);
      await corrected.client.query("UPDATE schema_migrations SET checksum=$1 WHERE name='0002_audit_truncate'", [checksum]);
      await corrected.client.exec("DELETE FROM schema_migrations WHERE name='0002_audit_truncate'");
      await corrected.client.close();
      await expect(database.initializeDatabase(config)).rejects.toThrow("Database migration required");
      const after = await openDatabase(config.dataDir);
      try { expect((await after.client.query("SELECT name FROM schema_migrations WHERE name='0002_audit_truncate'")).rows).toHaveLength(0); }
      finally { await after.client.close(); }
    } finally { await rm(dir, { recursive: true, force: true }); }
  }, 60_000);
});
