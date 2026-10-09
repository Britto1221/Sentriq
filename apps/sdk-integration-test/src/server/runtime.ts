import { PGlite } from "@electric-sql/pglite";
import { createPasskeyServer } from "@sentriq/core";
import path from "node:path";
import { IndependentHostStorage } from "../host-storage";

export interface IntegrationRuntime {
  origin: string;
  rpID: string;
  rpName: string;
  storage: IndependentHostStorage;
  passkeys: ReturnType<typeof createPasskeyServer>;
}

const globalRuntime = globalThis as typeof globalThis & { __sentriqIntegrationRuntime?: Promise<IntegrationRuntime> };

function configuration() {
  const localDevelopment = process.env.NODE_ENV === "development";
  const rpName = process.env.SENTRIQ_RP_NAME ?? (localDevelopment ? "Independent SDK Integration" : "");
  const rpID = process.env.SENTRIQ_RP_ID ?? (localDevelopment ? "localhost" : "");
  const origin = process.env.SENTRIQ_ORIGIN ?? (localDevelopment ? "http://localhost:3010" : "");
  if (!rpName || !rpID || !origin) throw new Error("SENTRIQ_RP_NAME, SENTRIQ_RP_ID, and SENTRIQ_ORIGIN must be configured outside local development.");
  const parsedOrigin = new URL(origin);
  if (parsedOrigin.origin !== origin || parsedOrigin.hostname !== rpID && !parsedOrigin.hostname.endsWith(`.${rpID}`)) {
    throw new Error("SENTRIQ_ORIGIN must be an exact origin covered by SENTRIQ_RP_ID.");
  }
  const localHttp = parsedOrigin.protocol === "http:" && ["localhost", "127.0.0.1", "[::1]"].includes(parsedOrigin.hostname);
  if (parsedOrigin.protocol !== "https:" && !localHttp) throw new Error("Sentriq requires HTTPS except on loopback for local development.");
  return { rpName, rpID, origin };
}

async function createRuntime(): Promise<IntegrationRuntime> {
  const config = configuration();
  const configuredDir = process.env.SENTRIQ_DATA_DIR;
  if (!configuredDir && process.env.NODE_ENV !== "development") throw new Error("SENTRIQ_DATA_DIR must be configured outside local development.");
  const dataDir = path.resolve(/* turbopackIgnore: true */ process.cwd(), configuredDir ?? ".data/sdk-integration-test");
  const database = new PGlite(dataDir);
  await database.waitReady;
  const storage = new IndependentHostStorage(database);
  await storage.initialize();
  const passkeys = createPasskeyServer({
    ...config,
    allowedOrigins: [config.origin],
    storage,
  });
  return { ...config, storage, passkeys };
}

export function getIntegrationRuntime(): Promise<IntegrationRuntime> {
  globalRuntime.__sentriqIntegrationRuntime ??= createRuntime();
  return globalRuntime.__sentriqIntegrationRuntime;
}
