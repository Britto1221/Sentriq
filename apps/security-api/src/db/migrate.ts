import { readConfig } from "../config";
import { migrateDatabase, openDatabase } from "./index";
import { describeMigrationFailure } from "./migration-error";

let phase = "configuration";
try {
  const config = readConfig(process.env);
  phase = "database-open";
  const database = await openDatabase(config.dataDir);
  try {
    phase = "migration";
    await migrateDatabase(database.client);
    console.info("Security API migrations applied");
  } finally {
    phase = "database-close";
    await database.client.close();
  }
} catch (cause) {
  console.error(describeMigrationFailure(phase, cause));
  process.exitCode = 1;
}
