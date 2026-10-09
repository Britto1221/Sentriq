import { afterEach, describe, expect, it } from "vitest";
import { migrateDatabase, openDatabase } from "../db/index";
import { bootstrapApplication, type ProductionBootstrapInput } from "./production-bootstrap";

const base: ProductionBootstrapInput = {
  tenantId: "sentriq-hackathon",
  tenantName: "Sentriq demonstration",
  applicationId: "northstar-hackathon",
  applicationName: "Northstar Workspace",
  origin: "https://northstar-demo.up.railway.app",
  rpId: "northstar-demo.up.railway.app",
  apiKey: "A".repeat(43),
};

describe("production application bootstrap", () => {
  const databases: Awaited<ReturnType<typeof openDatabase>>[] = [];

  async function migratedDatabase() {
    const database = await openDatabase("memory://");
    databases.push(database);
    await migrateDatabase(database.client);
    return database;
  }

  afterEach(async () => {
    await Promise.all(databases.splice(0).map((database) => database.client.close()));
  });

  it("stores a matching HTTPS application and Shield policies idempotently without storing the API key", async () => {
    const database = await migratedDatabase();
    await bootstrapApplication(database, base);
    await bootstrapApplication(database, base);

    const applications = await database.client.query<{ origins: string[]; rp_id: string }>("SELECT origins,rp_id FROM applications WHERE id=$1", [base.applicationId]);
    const keys = await database.client.query<{ digest: string }>("SELECT digest FROM application_api_keys WHERE application_id=$1", [base.applicationId]);
    const actions = await database.client.query<{ action_id: string; mode: string }>(
      "SELECT a.action_id,p.mode FROM protected_actions a JOIN policies p USING (tenant_id,application_id,action_id) WHERE a.application_id=$1 AND a.enabled AND p.enabled",
      [base.applicationId],
    );

    expect(applications.rows).toEqual([{ origins: [base.origin], rp_id: base.rpId }]);
    expect(keys.rows).toHaveLength(1);
    expect(keys.rows[0]?.digest === base.apiKey).toBe(false);
    expect(actions.rows.length).toBeGreaterThan(0);
    expect(actions.rows.every((action) => action.mode === "STEP_UP")).toBe(true);
  });

  it("fails closed when an existing application ID has a different origin", async () => {
    const database = await migratedDatabase();
    await bootstrapApplication(database, base);

    await expect(bootstrapApplication(database, { ...base, origin: "https://attacker.example", rpId: "attacker.example" }))
      .rejects.toThrow("Production bootstrap conflicts with persisted application configuration");
  });

  it("rejects non-HTTPS origins and API keys that do not meet the application-key format", async () => {
    const database = await migratedDatabase();

    await expect(bootstrapApplication(database, { ...base, origin: "http://localhost:3001", rpId: "localhost" }))
      .rejects.toThrow("Invalid production bootstrap configuration");
    await expect(bootstrapApplication(database, { ...base, apiKey: "short" }))
      .rejects.toThrow("Invalid production bootstrap configuration");
  });
});
