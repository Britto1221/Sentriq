import { randomUUID } from "node:crypto";
import { Buffer } from "node:buffer";
import { digestToken, type Database } from "../db/index";

export interface ProductionBootstrapInput {
  tenantId: string;
  tenantName: string;
  applicationId: string;
  applicationName: string;
  origin: string;
  rpId: string;
  apiKey: string;
}

const idPattern = /^[a-zA-Z0-9][a-zA-Z0-9_-]{0,62}$/;
const protectedActions = [
  ["data.export", "Export account data after fresh passkey verification"],
  ["account.delete", "Delete an account after fresh passkey verification"],
  ["security.settings.change", "Change security settings after fresh passkey verification"],
  ["session.revoke", "Revoke a session after fresh passkey verification"],
  ["passkey.remove", "Remove a passkey after fresh passkey verification"],
] as const;

function isValid(input: ProductionBootstrapInput): boolean {
  try {
    const origin = new URL(input.origin);
    return idPattern.test(input.tenantId) && idPattern.test(input.applicationId)
      && input.tenantName.trim().length > 0 && input.tenantName.length <= 100
      && input.applicationName.trim().length > 0 && input.applicationName.length <= 80
      && input.apiKey.length === 43 && /^[A-Za-z0-9_-]{43}$/.test(input.apiKey)
      && Buffer.from(input.apiKey, "base64url").length === 32 && Buffer.from(input.apiKey, "base64url").toString("base64url") === input.apiKey
      && origin.protocol === "https:" && origin.origin === input.origin && origin.pathname === "/"
      && !origin.username && !origin.password && !origin.search && !origin.hash
      && input.rpId.length <= 253 && !input.rpId.includes(":")
      && (origin.hostname === input.rpId || origin.hostname.endsWith(`.${input.rpId}`));
  } catch {
    return false;
  }
}

/** Idempotently provisions one explicitly configured HTTPS application; it never returns or logs the API key. */
export async function bootstrapApplication(database: Database, input: ProductionBootstrapInput): Promise<void> {
  if (!isValid(input)) throw new Error("Invalid production bootstrap configuration");
  const apiKeyDigest = digestToken(input.apiKey);

  await database.client.transaction(async (tx) => {
    await tx.query("INSERT INTO tenants(id,name) VALUES ($1,$2) ON CONFLICT (id) DO NOTHING", [input.tenantId, input.tenantName]);
    const tenant = await tx.query<{ name: string }>("SELECT name FROM tenants WHERE id=$1 FOR UPDATE", [input.tenantId]);
    if (tenant.rows[0]?.name !== input.tenantName) throw new Error("Production bootstrap conflicts with persisted application configuration");

    await tx.query(
      "INSERT INTO applications(id,tenant_id,name,origins,rp_id) VALUES ($1,$2,$3,$4,$5) ON CONFLICT (id) DO NOTHING",
      [input.applicationId, input.tenantId, input.applicationName, JSON.stringify([input.origin]), input.rpId],
    );
    const application = await tx.query<{ tenant_id: string; name: string; origins: string[]; rp_id: string }>(
      "SELECT tenant_id,name,origins,rp_id FROM applications WHERE id=$1 FOR UPDATE",
      [input.applicationId],
    );
    const app = application.rows[0];
    if (!app || app.tenant_id !== input.tenantId || app.name !== input.applicationName || app.rp_id !== input.rpId
      || JSON.stringify(app.origins) !== JSON.stringify([input.origin])) {
      throw new Error("Production bootstrap conflicts with persisted application configuration");
    }

    const keys = await tx.query<{ digest: string; revoked_at: Date | null }>(
      "SELECT digest,revoked_at FROM application_api_keys WHERE tenant_id=$1 AND application_id=$2 FOR UPDATE",
      [input.tenantId, input.applicationId],
    );
    const activeKeys = keys.rows.filter((key) => key.revoked_at === null);
    if (activeKeys.some((key) => key.digest !== apiKeyDigest) || activeKeys.length > 1) {
      throw new Error("Production bootstrap conflicts with persisted application configuration");
    }
    if (activeKeys.length === 0) {
      await tx.query(
        "INSERT INTO application_api_keys(id,tenant_id,application_id,digest) VALUES ($1,$2,$3,$4)",
        [randomUUID(), input.tenantId, input.applicationId, apiKeyDigest],
      );
    }

    for (const [actionId, description] of protectedActions) {
      await tx.query(
        "INSERT INTO protected_actions(id,tenant_id,application_id,action_id,description,enabled) VALUES ($1,$2,$3,$4,$5,true) ON CONFLICT (tenant_id,application_id,action_id) DO NOTHING",
        [randomUUID(), input.tenantId, input.applicationId, actionId, description],
      );
      const action = await tx.query<{ enabled: boolean }>(
        "SELECT enabled FROM protected_actions WHERE tenant_id=$1 AND application_id=$2 AND action_id=$3 FOR UPDATE",
        [input.tenantId, input.applicationId, actionId],
      );
      if (!action.rows[0]?.enabled) throw new Error("Production bootstrap conflicts with persisted application configuration");

      const policies = await tx.query<{ mode: string; version: number }>(
        "SELECT mode,version FROM policies WHERE tenant_id=$1 AND application_id=$2 AND action_id=$3 AND enabled ORDER BY version DESC FOR UPDATE",
        [input.tenantId, input.applicationId, actionId],
      );
      if (policies.rows.length && policies.rows[0]?.mode !== "STEP_UP") {
        throw new Error("Production bootstrap conflicts with persisted application configuration");
      }
      if (!policies.rows.length) {
        await tx.query(
          "INSERT INTO policies(id,tenant_id,application_id,action_id,mode,version,enabled) VALUES ($1,$2,$3,$4,'STEP_UP',1,true)",
          [randomUUID(), input.tenantId, input.applicationId, actionId],
        );
      }
    }
  });
}
