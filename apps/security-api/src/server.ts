import { buildApp } from "./app";
import { readConfig } from "./config";
import { initializeDatabase } from "./db/index";

try {
  const config = readConfig(process.env);
  const database = await initializeDatabase(config);
  try {
    const app = await buildApp({ database, config });
    app.addHook("onClose", async () => { await database.client.close(); });
    for (const signal of ["SIGINT", "SIGTERM"] as const) {
      process.once(signal, () => { void app.close().catch(() => { process.exitCode = 1; }); });
    }
    await app.listen({ host: config.host, port: config.port });
  } catch (error) { await database.client.close(); throw error; }
} catch {
  console.error("Security API startup failed; inspect configuration and database initialization");
  process.exitCode = 1;
}
