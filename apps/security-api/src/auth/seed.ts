import { randomBytes, randomUUID } from "node:crypto";
import { execFile } from "node:child_process";
import { mkdir, open, rm } from "node:fs/promises";
import { userInfo } from "node:os";
import { dirname } from "node:path";
import { promisify } from "node:util";
import { digestToken, type Database } from "../db/index";

/** The local application key goes only to an exclusively created private file, never stdout or return values. */
export async function seedDemo(database: Database, nodeEnv: "development" | "test" | "production", outputPath: string) {
  if (nodeEnv === "production") throw new Error("Development seed is disabled in production");
  await mkdir(dirname(outputPath), { recursive: true, mode: 0o700 });
  const file = await open(outputPath, "wx", 0o600);
  try {
    if (process.platform === "win32") {
      // Restrict the empty file before writing any credential material.
      await promisify(execFile)("icacls.exe", [outputPath, "/inheritance:r", "/grant:r", `${userInfo().username}:(F)`], { windowsHide: true });
    }
    return await database.client.transaction(async (tx) => {
      const applications: { id: string; name: string; origin: string; apiKey: string }[] = [];
      const tenantId = "development-synthetic";
      await tx.query("INSERT INTO tenants(id,name) VALUES ($1,'Development synthetic tenant') ON CONFLICT (id) DO NOTHING", [tenantId]);
      for (const definition of [
        { id: "development-northstar", name: "Northstar (synthetic)", origin: "http://localhost:3001" },
      ]) {
        const inserted = await tx.query("INSERT INTO applications(id,tenant_id,name,origins,rp_id) VALUES ($1,$2,$3,$4,'localhost') ON CONFLICT (id) DO NOTHING RETURNING id", [definition.id, tenantId, definition.name, JSON.stringify([definition.origin])]);
        const owned = await tx.query("SELECT id FROM applications WHERE id=$1 AND tenant_id=$2", [definition.id, tenantId]);
        if (owned.rows.length !== 1) throw new Error("Development seed ownership mismatch");
        if (inserted.rows.length) {
          const apiKey = randomBytes(32).toString("base64url");
          await tx.query("INSERT INTO application_api_keys(id,tenant_id,application_id,digest) VALUES ($1,$2,$3,$4)", [randomUUID(), tenantId, definition.id, digestToken(apiKey)]);
          applications.push({ id: definition.id, name: definition.name, origin: definition.origin, apiKey });
        }
        if (definition.id === "development-northstar") {
          for (const [actionId, mode, description] of [
            ["data.export", "STEP_UP", "Export account data after fresh passkey verification"],
            ["account.delete", "STEP_UP", "Delete an account after fresh passkey verification"],
            ["security.settings.change", "STEP_UP", "Change security settings after fresh passkey verification"],
            ["session.revoke", "STEP_UP", "Revoke a session after fresh passkey verification"],
            ["passkey.remove", "STEP_UP", "Remove a passkey after fresh verification"],
          ] as const) {
            await tx.query("INSERT INTO protected_actions(id,tenant_id,application_id,action_id,description,enabled) VALUES ($1,$2,$3,$4,$5,true) ON CONFLICT (tenant_id,application_id,action_id) DO NOTHING",
              [randomUUID(), tenantId, definition.id, actionId, description]);
            await tx.query("INSERT INTO policies(id,tenant_id,application_id,action_id,mode,version,enabled) VALUES ($1,$2,$3,$4,$5,1,true) ON CONFLICT (tenant_id,application_id,action_id,version) DO NOTHING",
              [randomUUID(), tenantId, definition.id, actionId, mode]);
          }
        }
      }
      await file.writeFile(JSON.stringify({ developmentOnly: true, applications }, null, 2), "utf8");
      await file.sync();
      return { createdApplications: applications.length };
    });
  } catch (error) { await file.close(); await rm(outputPath, { force: true }); throw error; }
  finally { await file.close(); }
}
