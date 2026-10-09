import { randomBytes, randomUUID } from "node:crypto";
import { mkdtemp, rm } from "node:fs/promises";
import { join } from "node:path";
import { Writable } from "node:stream";
import { describe, expect, it } from "vitest";

const modulePath = "./db/index.ts";
const appPath = "./app.ts";
const configPath = "./config.ts";
async function foundation() {
  const imported = await import(modulePath).catch(() => null);
  expect(imported !== null, "database foundation module must exist").toBe(true);
  return imported! as typeof import("./db/index");
}
async function fixture() {
  const api = await foundation();
  const db = await api.openDatabase("memory://");
  await api.migrateDatabase(db.client);
  await db.client.exec(`
    INSERT INTO tenants (id,name) VALUES ('t1','Tenant 1'),('t2','Tenant 2');
    INSERT INTO applications (id,tenant_id,name,origins,rp_id) VALUES
      ('a1','t1','App 1','["http://localhost:3001"]','localhost'),
      ('a2','t1','App 2','["http://localhost:3002"]','localhost'),
      ('a3','t2','App 3','["https://example.test"]','example.test');
    INSERT INTO users (id,tenant_id,application_id,email,display_name) VALUES
      ('u1','t1','a1','alice@example.test','Alice'),('u2','t1','a2','alice@example.test','Alice 2');
  `);
  return { ...api, ...db };
}

describe("database foundation", { timeout: 30_000 }, () => {
  it("migrates all identity/enforcement tables once and persists data across restart", async () => {
    const api = await foundation();
    // The Windows sandbox redirects os.tmpdir() to a location where PGlite's
    // checkpoint rename is denied. Keep this persistence fixture inside the
    // writable workspace so the test exercises a real on-disk restart.
    const dir = await mkdtemp(join(process.cwd(), ".sentriq-foundation-"));
    try {
      const first = await api.openDatabase(join(dir, "db"));
      try {
        await api.migrateDatabase(first.client);
        await api.migrateDatabase(first.client);
        const result = await first.client.query<{ tablename: string }>("SELECT tablename FROM pg_tables WHERE schemaname='public'");
        expect(result.rows.map((r) => r.tablename)).toEqual(expect.arrayContaining([
          "tenants", "applications", "application_api_keys", "users", "retired_password_credentials", "retired_email_verification_transactions", "passkey_enrollment_transactions", "device_link_requests", "webauthn_credentials",
          "webauthn_challenges", "sessions", "policies", "protected_actions", "step_up_grants", "user_resources",
          "recovery_codes", "audit_events",
        ]));
        await first.client.query("INSERT INTO tenants(id,name) VALUES ($1,$2)", ["persistent", "Persisted"]);
        expect((await first.client.query("SELECT * FROM schema_migrations")).rows).toHaveLength(11);
      } finally { await first.client.close(); }
      const second = await api.openDatabase(join(dir, "db"));
      try { expect((await second.client.query("SELECT name FROM tenants WHERE id='persistent'")).rows).toEqual([{ name: "Persisted" }]); }
      finally { await second.client.close(); }
    } finally { await rm(dir, { recursive: true, force: true }); }
  }, 30_000);

  it("accepts email-less host identities and keeps optional email uniqueness separate from credentials", async () => {
    const db = await fixture();
    try {
      await db.client.exec("INSERT INTO users(id,tenant_id,application_id,email,display_name) VALUES ('host-no-email','t1','a1',NULL,'Host Identity')");
      expect((await db.client.query("SELECT id FROM users WHERE id='host-no-email' AND email IS NULL")).rows).toHaveLength(1);
      await expect(db.client.exec("INSERT INTO users(id,tenant_id,application_id,email,display_name) VALUES ('dup','t1','a1','alice@example.test','Duplicate')")).rejects.toMatchObject({ code: "23505" });
      await expect(db.client.exec("INSERT INTO users(id,tenant_id,application_id,email,display_name) VALUES ('upper','t1','a1','Alice@example.test','Upper')")).rejects.toMatchObject({ code: "23514" });
      await expect(db.client.exec("INSERT INTO application_api_keys(id,tenant_id,application_id,digest) VALUES ('key','t1','a1','raw-key')")).rejects.toMatchObject({ code: "23514" });
      const secretColumns = await db.client.query<{ table_name: string; column_name: string }>("SELECT table_name,column_name FROM information_schema.columns WHERE table_name IN ('application_api_keys','sessions','recovery_codes','retired_email_verification_transactions','passkey_enrollment_transactions')");
      expect(secretColumns.rows.some((r) => r.column_name === "token")).toBe(false);
      expect(secretColumns.rows.some((r) => r.column_name === "api_key")).toBe(false);
      expect(secretColumns.rows.some((r) => r.table_name === "retired_email_verification_transactions" && r.column_name === "verification_code")).toBe(false);
      expect((await db.client.query("SELECT tablename FROM pg_tables WHERE schemaname='public' AND tablename='password_credentials'")).rows).toHaveLength(0);
      expect((await db.client.query("SELECT tablename FROM pg_tables WHERE schemaname='public' AND tablename='retired_password_credentials'")).rows).toHaveLength(1);
    } finally { await db.client.close(); }
  });

  it("rejects cross-tenant/application/user ownership and mismatched session bindings", async () => {
    const db = await fixture();
    try {
      const digest = "a".repeat(64);
      await db.client.query("INSERT INTO sessions(id,tenant_id,application_id,user_id,token_digest,expires_at) VALUES ('s1','t1','a1','u1',$1,now()+interval '1 hour')", [digest]);
      for (const statement of [
        "INSERT INTO applications(id,tenant_id,name,origins,rp_id) VALUES ('bad','missing','Bad','[]','localhost')",
        "INSERT INTO users(id,tenant_id,application_id,email,display_name) VALUES ('bad','t2','a1','bad@example.test','Bad')",
        `INSERT INTO sessions(id,tenant_id,application_id,user_id,token_digest,expires_at) VALUES ('bad','t1','a1','u2','${"b".repeat(64)}',now()+interval '1 hour')`,
        "INSERT INTO user_resources(id,tenant_id,application_id,user_id,kind,data) VALUES ('bad','t1','a1','u2','profile','{}')",
        "INSERT INTO audit_events(id,tenant_id,application_id,subject_id,session_id,type,outcome,reason_code,correlation_id) VALUES ('bad','t1','a1','u2','s1','AUTH_LOGIN_FAILED','FAILURE','invalid_credentials','c1')",
      ]) await expect(db.client.exec(statement)).rejects.toMatchObject({ code: "23503" });
    } finally { await db.client.close(); }
  });

  it("binds challenges and grants to owned session/action/resource and preserves audit records", async () => {
    const db = await fixture();
    try {
      await db.client.exec(`
        INSERT INTO sessions(id,tenant_id,application_id,user_id,token_digest,expires_at) VALUES ('s1','t1','a1','u1','${"c".repeat(64)}',now()+interval '1 hour');
        INSERT INTO user_resources(id,tenant_id,application_id,user_id,kind,data) VALUES ('r1','t1','a1','u1','profile','{}');
        INSERT INTO protected_actions(id,tenant_id,application_id,action_id) VALUES ('pa1','t1','a1','DATA_EXPORT');
        INSERT INTO webauthn_challenges(id,tenant_id,application_id,user_id,session_id,purpose,challenge,action_id,resource_id,expires_at)
          VALUES ('ch1','t1','a1','u1','s1','step_up','${randomBytes(32).toString("base64url")}','DATA_EXPORT','r1',now()+interval '5 minutes');
        INSERT INTO step_up_grants(id,tenant_id,application_id,user_id,session_id,challenge_id,action_id,resource_id,expires_at)
          VALUES ('g1','t1','a1','u1','s1','ch1','DATA_EXPORT','r1',now()+interval '5 minutes');
        INSERT INTO audit_events(id,tenant_id,application_id,subject_id,session_id,type,outcome,reason_code,correlation_id)
          VALUES ('ev1','t1','a1','u1','s1','AUTH_LOGIN_SUCCEEDED','SUCCESS','authenticated','correlation');
      `);
      await expect(db.client.exec("UPDATE step_up_grants SET resource_id='missing' WHERE id='g1'")).rejects.toMatchObject({ code: "23503" });
      await expect(db.client.exec("UPDATE step_up_grants SET action_id='ACCOUNT_DELETE' WHERE id='g1'")).rejects.toMatchObject({ code: "23503" });
      await expect(db.client.exec("UPDATE audit_events SET reason_code='changed' WHERE id='ev1'")).rejects.toThrow();
      await expect(db.client.exec("DELETE FROM audit_events WHERE id='ev1'")).rejects.toThrow();
    } finally { await db.client.close(); }
  });
});

describe("API foundation", { timeout: 30_000 }, () => {
  it("initializes auth against persistent keys and rejects missing, invalid, revoked and expired keys", async () => {
    const db = await fixture();
    const appModule = await import(appPath).catch(() => null);
    expect(appModule !== null, "API foundation module must exist").toBe(true);
    const { buildApp } = appModule! as typeof import("./app");
    const key = randomBytes(32).toString("base64url");
    await db.client.query("INSERT INTO application_api_keys(id,tenant_id,application_id,digest) VALUES ('k1','t1','a1',$1)", [db.digestToken(key)]);
    const app = await buildApp({ database: db, config: { nodeEnv: "test", host: "127.0.0.1", port: 4000, dataDir: "memory://", rateLimitMax: 100, rateLimitWindowMs: 60_000, logLevel: "silent" } });
    try {
      for (const authorization of [undefined, "Bearer invalid", "Basic invalid"]) {
        const response = await app.inject({ url: "/v1/auth/context", headers: authorization ? { authorization } : {} });
        expect(response.statusCode).toBe(401);
        expect(response.json().error.code).toBe("UNAUTHORIZED");
      }
      const response = await app.inject({ url: "/v1/auth/context?tenantId=t2&applicationId=a3", headers: { authorization: `Bearer ${key}` } });
      expect(response.statusCode).toBe(200);
      expect(response.json()).toMatchObject({ tenantId: "t1", applicationId: "a1" });
      await db.client.exec("UPDATE application_api_keys SET revoked_at=now() WHERE id='k1'");
      expect((await app.inject({ url: "/v1/auth/context", headers: { authorization: `Bearer ${key}` } })).statusCode).toBe(401);
      await db.client.exec("UPDATE application_api_keys SET revoked_at=NULL, expires_at=now()-interval '1 second' WHERE id='k1'");
      expect((await app.inject({ url: "/v1/auth/context", headers: { authorization: `Bearer ${key}` } })).statusCode).toBe(401);
    } finally { await app.close(); await db.client.close(); }
  });

  it("checks health, validates input, generates correlation IDs, rate limits and excludes sensitive log content", async () => {
    const db = await fixture();
    const appModule = await import(appPath).catch(() => null);
    expect(appModule !== null, "API foundation module must exist").toBe(true);
    const { buildApp } = appModule! as typeof import("./app");
    let logs = "";
    const stream = new Writable({ write(chunk, _encoding, callback) { logs += chunk.toString(); callback(); } });
    const app = await buildApp({ database: db, logStream: stream, config: { nodeEnv: "test", host: "127.0.0.1", port: 4000, dataDir: "memory://", rateLimitMax: 3, rateLimitWindowMs: 60_000, logLevel: "info" } });
    const sensitive = randomUUID();
    try {
      const health = await app.inject({ url: "/health", headers: { "x-correlation-id": "caller-controlled" } });
      expect(health.json()).toEqual({ status: "ok" });
      expect(health.headers["x-correlation-id"]).toMatch(/^[0-9a-f-]{36}$/);
      expect(health.headers["x-correlation-id"] === "caller-controlled").toBe(false);
      expect((await app.inject({ url: "/health?unexpected=1" })).statusCode).toBe(400);
      await app.inject({ method: "POST", url: `/missing?password=${sensitive}`, headers: { authorization: `Bearer ${sensitive}`, cookie: `session=${sensitive}` }, payload: { password: sensitive, recoveryCode: sensitive, challenge: sensitive } });
      expect((await app.inject({ url: "/health" })).statusCode).toBe(429);
      expect(logs.includes(sensitive)).toBe(false);
      const records = logs.trim().split("\n").map((line) => JSON.parse(line));
      expect(records.some((record) => typeof record.reqId === "string")).toBe(true);
    } finally { await app.close(); await db.client.close(); }
  });

  it("fails health closed when the database is unavailable", async () => {
    const db = await fixture();
    const appModule = await import(appPath).catch(() => null);
    expect(appModule !== null).toBe(true);
    const app = await (appModule! as typeof import("./app")).buildApp({ database: db, config: { nodeEnv: "test", host: "127.0.0.1", port: 4000, dataDir: "memory://", rateLimitMax: 100, rateLimitWindowMs: 60_000, logLevel: "silent" } });
    try { await db.client.close(); expect((await app.inject({ url: "/health" })).statusCode).toBe(503); }
    finally { await app.close(); }
  });

  it("reports an uninitialized database as unavailable", async () => {
    const db = await (await foundation()).openDatabase("memory://");
    const appModule = await import(appPath);
    const app = await (appModule as typeof import("./app")).buildApp({ database: db, config: { nodeEnv: "test", host: "127.0.0.1", port: 4000, dataDir: "memory://", rateLimitMax: 100, rateLimitWindowMs: 60_000, logLevel: "silent" } });
    try { expect((await app.inject({ url: "/health" })).statusCode).toBe(503); }
    finally { await app.close(); await db.client.close(); }
  });

  it("requires explicit persistent production configuration and rejects malformed configuration", async () => {
    const configModule = await import(configPath).catch(() => null);
    expect(configModule !== null, "configuration module must exist").toBe(true);
    const { readConfig } = configModule! as typeof import("./config");
    expect(readConfig({})).toMatchObject({ nodeEnv: "development", host: "127.0.0.1" });
    expect(() => readConfig({ NODE_ENV: "production" })).toThrow();
    expect(() => readConfig({ NODE_ENV: "production", SENTRIQ_DATA_DIR: "memory://", SENTRIQ_TLS_TERMINATED: "true" })).toThrow();
    expect(() => readConfig({ SENTRIQ_PORT: "not-a-port" })).toThrow();
    expect(readConfig({ NODE_ENV: "production", SENTRIQ_DATA_DIR: join(process.cwd(), ".sentriq-production-config-only"), SENTRIQ_TLS_TERMINATED: "true" }).nodeEnv).toBe("production");
  });
});
