import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { PGlite } from "@electric-sql/pglite";
import { drizzle } from "drizzle-orm/pglite";
import { getTableConfig } from "drizzle-orm/pg-core";
import type { ApiConfig } from "../config";
import * as schema from "./schema";

export function digestToken(token: string): string {
  return createHash("sha256").update(token, "utf8").digest("hex");
}

/** One process owns a persistent data directory; memory:// is for tests only. */
export async function openDatabase(dataDir: string) {
  const client = new PGlite(dataDir);
  try { await client.waitReady; }
  catch (error) { await client.close(); throw error; }
  return { client, orm: drizzle(client, { schema }) };
}
export type Database = Awaited<ReturnType<typeof openDatabase>>;

const migrationNames = ["0001_foundation", "0002_audit_truncate", "0003_authentication", "0004_recovery_attempts", "0005_policy_step_up", "0006_reclaim_passkey_recovery", "0007_deterministic_policy_modes", "0008_passwordless_email_registration", "0009_device_link", "0010_passkey_management"] as const;

async function expectedMigrations() {
  return Promise.all(migrationNames.map(async (name) => {
    const sql = await readFile(new URL(`../../migrations/${name}.sql`, import.meta.url), "utf8");
    return { name, sql, checksum: digestToken(sql) };
  }));
}

export async function migrateDatabase(client: PGlite): Promise<void> {
  const migrations = await expectedMigrations();
  await client.transaction(async (tx) => {
    await tx.exec("CREATE TABLE IF NOT EXISTS schema_migrations (name text PRIMARY KEY, checksum text NOT NULL, applied_at timestamptz NOT NULL DEFAULT now())");
    for (const { name, sql, checksum } of migrations) {
      const applied = await tx.query<{ checksum: string }>("SELECT checksum FROM schema_migrations WHERE name=$1", [name]);
      if (applied.rows[0]) {
        if (applied.rows[0].checksum !== checksum) throw new Error("Applied migration checksum mismatch");
        continue;
      }
      await tx.exec(sql);
      await tx.query("INSERT INTO schema_migrations(name,checksum) VALUES ($1,$2)", [name, checksum]);
    }
  });
}

/** Read-only readiness check. Never repairs or migrates an incompatible database. */
export async function verifyDatabase(client: PGlite): Promise<void> {
  const migrations = await expectedMigrations();
  const applied = await client.query<{ name: string; checksum: string }>("SELECT name,checksum FROM schema_migrations");
  for (const migration of migrations) {
    const row = applied.rows.find((item) => item.name === migration.name);
    if (!row) throw new Error("Database migration required");
    if (row.checksum !== migration.checksum) throw new Error("Applied migration checksum mismatch");
  }
  const columns = await client.query<{ table_name: string; column_name: string }>(
    "SELECT table_name,column_name FROM information_schema.columns WHERE table_schema='public'",
  );
  const actualColumns = new Set(columns.rows.map((row) => `${row.table_name}.${row.column_name}`));
  for (const table of Object.values(schema)) {
    const expected = getTableConfig(table);
    if (expected.columns.some((column) => !actualColumns.has(`${expected.name}.${column.name}`))) {
      throw new Error("Database schema verification failed");
    }
  }
  const guards = await client.query<{ tgname: string; tgtype: number }>(
    "SELECT tgname,tgtype FROM pg_trigger WHERE tgrelid='public.audit_events'::regclass AND tgenabled IN ('O','A') AND NOT tgisinternal",
  );
  if (!guards.rows.some((guard) => guard.tgname === "audit_events_immutable" && guard.tgtype === 27)
    || !guards.rows.some((guard) => guard.tgname === "audit_events_no_truncate" && guard.tgtype === 34)) {
    throw new Error("Database schema verification failed");
  }
}

/** Production validates existing state only; development applies the declared migrations. */
export async function initializeDatabase(config: ApiConfig): Promise<Database> {
  const database = await openDatabase(config.dataDir);
  try {
    if (config.nodeEnv !== "production") await migrateDatabase(database.client);
    await verifyDatabase(database.client);
    return database;
  } catch (error) { await database.client.close(); throw error; }
}
