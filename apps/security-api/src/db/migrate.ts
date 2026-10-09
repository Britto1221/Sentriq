import { readConfig } from "../config";
import { migrateDatabase, openDatabase } from "./index";
import { describeMigrationFailure } from "./migration-error";

let phase = "configuration";
try {
  const config = readConfig(process.env);
  phase = "database-open";
  const database = await openDatabase(config.dataDir);
  let migrationFailed = false;
  let migrationError: unknown;
  try {
    phase = "migration";
    await migrateDatabase(database.client);
    console.info("Security API migrations applied");
  } catch (cause) {
    migrationFailed = true;
    migrationError = cause;
  } finally {
    if (!migrationFailed) phase = "database-close";
    await database.client.close().catch(() => {
      if (!migrationFailed) throw new Error("Database close failed");
    });
  }
  if (migrationFailed) throw migrationError;
} catch (cause) {
  console.error(describeMigrationFailure(phase, cause));
  process.exitCode = 1;
}
