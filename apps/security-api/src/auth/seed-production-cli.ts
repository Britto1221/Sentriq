import { readConfig } from "../config";
import { openDatabase } from "../db/index";
import { bootstrapApplication } from "./production-bootstrap";

try {
  const config = readConfig(process.env);
  if (config.nodeEnv !== "production") throw new Error("Production bootstrap is only available in production mode");
  const required = [
    "SENTRIQ_BOOTSTRAP_TENANT_ID",
    "SENTRIQ_BOOTSTRAP_TENANT_NAME",
    "SENTRIQ_BOOTSTRAP_APPLICATION_ID",
    "SENTRIQ_BOOTSTRAP_APPLICATION_NAME",
    "SENTRIQ_BOOTSTRAP_ORIGIN",
    "SENTRIQ_BOOTSTRAP_RP_ID",
    "SENTRIQ_BOOTSTRAP_APPLICATION_KEY",
  ] as const;
  const values = Object.fromEntries(required.map((key) => [key, process.env[key]]));
  if (required.some((key) => !values[key])) throw new Error("Production bootstrap configuration is incomplete");
  const database = await openDatabase(config.dataDir);
  try {
    await bootstrapApplication(database, {
      tenantId: values.SENTRIQ_BOOTSTRAP_TENANT_ID!,
      tenantName: values.SENTRIQ_BOOTSTRAP_TENANT_NAME!,
      applicationId: values.SENTRIQ_BOOTSTRAP_APPLICATION_ID!,
      applicationName: values.SENTRIQ_BOOTSTRAP_APPLICATION_NAME!,
      origin: values.SENTRIQ_BOOTSTRAP_ORIGIN!,
      rpId: values.SENTRIQ_BOOTSTRAP_RP_ID!,
      apiKey: values.SENTRIQ_BOOTSTRAP_APPLICATION_KEY!,
    });
    console.info("Production application bootstrap verified");
  } finally {
    await database.client.close();
  }
} catch {
  console.error("Production application bootstrap failed; no credentials were printed");
  process.exitCode = 1;
}
