import { mkdtemp, readFile, rm, stat } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { migrateDatabase, openDatabase } from "../db/index";

const seedModulePath = "./seed.ts";
describe("development seed", { timeout: 60_000 }, () => {
  it("refuses production before writing accounts or output files", async () => {
    const db = await openDatabase("memory://"); const dir = await mkdtemp(join(tmpdir(), "sentriq-seed-production-"));
    try {
      await migrateDatabase(db.client);
      const imported = await import(seedModulePath).catch(() => null);
      expect(imported !== null, "development seed module must exist").toBe(true);
      const { seedDemo } = imported as typeof import("./seed");
      const output = join(dir, "bootstrap.json");
      await expect(seedDemo(db, "production", output)).rejects.toThrow("Development seed is disabled in production");
      expect((await db.client.query("SELECT id FROM users")).rows).toHaveLength(0);
      await expect(stat(output)).rejects.toMatchObject({ code: "ENOENT" });
    } finally { await db.client.close(); await rm(dir, { recursive: true, force: true }); }
  });
  it("creates a local application and private API key without seeding accounts or passwords", async () => {
    const db = await openDatabase("memory://"); const dir = await mkdtemp(join(tmpdir(), "sentriq-seed-"));
    try {
      await migrateDatabase(db.client);
      const imported = await import(seedModulePath).catch(() => null);
      expect(imported !== null, "development seed module must exist").toBe(true);
      const { seedDemo } = imported as typeof import("./seed");
      const output = join(dir, "bootstrap.json");
      expect(await seedDemo(db, "test", output)).toEqual({ createdApplications: 1 });
      const parsed = JSON.parse(await readFile(output, "utf8")) as { developmentOnly: boolean; accounts?: unknown; applications: { apiKey: string }[] };
      expect(parsed.developmentOnly).toBe(true);
      expect(parsed.accounts).toBeUndefined();
      expect((await db.client.query("SELECT id FROM users")).rows).toHaveLength(0);
      expect(parsed.applications.every((application) => /^[A-Za-z0-9_-]{43}$/.test(application.apiKey))).toBe(true);
      const passkeyRemovalPolicy = (await db.client.query<{ mode: string }>("SELECT mode FROM policies WHERE tenant_id='development-synthetic' AND application_id='development-northstar' AND action_id='passkey.remove' AND version=1")).rows[0];
      expect(passkeyRemovalPolicy?.mode).toBe("STEP_UP");
      expect(await seedDemo(db, "test", join(dir, "second.json"))).toEqual({ createdApplications: 0 });
      expect((await db.client.query("SELECT id FROM application_api_keys")).rows).toHaveLength(1);
      // The service returns counts only; secrets are read within this test and never printed.
    } finally { await db.client.close(); await rm(dir, { recursive: true, force: true }); }
  });
});
