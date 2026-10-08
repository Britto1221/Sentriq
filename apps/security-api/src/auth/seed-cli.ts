import { randomUUID } from "node:crypto";
import { dirname, join } from "node:path";
import { readConfig } from "../config";
import { initializeDatabase } from "../db/index";
import { seedDemo } from "./seed";

try {
  const config = readConfig(process.env);
  if (config.nodeEnv === "production") throw new Error("Development seed is disabled in production");
  const database = await initializeDatabase(config);
  try {
    const output = join(dirname(config.dataDir), `bootstrap-${randomUUID()}.json`);
    const result = await seedDemo(database, config.nodeEnv, output);
    console.info(`Configured ${result.createdApplications} local application(s); the private development key file is ${output}`);
  } finally { await database.client.close(); }
} catch {
  console.error("Development seed failed or is disabled; no credentials are printed");
  process.exitCode = 1;
}
