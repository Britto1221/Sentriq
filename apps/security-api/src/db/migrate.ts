import { readConfig } from "../config";
import { migrateDatabase, openDatabase } from "./index";

try {
  const config = readConfig(process.env);
  const database = await openDatabase(config.dataDir);
  try { await migrateDatabase(database.client); console.info("Security API migrations applied"); }
  finally { await database.client.close(); }
} catch {
  console.error("Security API migration failed; inspect configuration and local database availability");
  process.exitCode = 1;
}
