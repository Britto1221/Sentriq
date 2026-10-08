import { isAbsolute } from "node:path";
import { fileURLToPath } from "node:url";
import { z } from "zod";

export interface ApiConfig {
  nodeEnv: "development" | "test" | "production";
  host: string;
  port: number;
  dataDir: string;
  rateLimitMax: number;
  rateLimitWindowMs: number;
  logLevel: "fatal" | "error" | "warn" | "info" | "debug" | "trace" | "silent";
}
const envSchema = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  SENTRIQ_HOST: z.enum(["127.0.0.1", "0.0.0.0", "::1"]).default("127.0.0.1"),
  SENTRIQ_PORT: z.coerce.number().int().min(1).max(65535).default(4000),
  SENTRIQ_DATA_DIR: z.string().min(1).optional(),
  SENTRIQ_TLS_TERMINATED: z.enum(["true", "false"]).default("false"),
  SENTRIQ_RATE_LIMIT_MAX: z.coerce.number().int().min(1).max(1000).default(100),
  SENTRIQ_RATE_LIMIT_WINDOW_MS: z.coerce.number().int().min(1000).max(3_600_000).default(60_000),
  SENTRIQ_LOG_LEVEL: z.enum(["fatal", "error", "warn", "info", "debug", "trace", "silent"]).default("info"),
});
export function readConfig(env: Record<string, string | undefined>): ApiConfig {
  const parsed = envSchema.safeParse(env);
  // Zod errors may contain input values; never include them in startup output.
  if (!parsed.success) throw new Error("Invalid security API configuration");
  const value = parsed.data;
  if (value.NODE_ENV === "production" && (!value.SENTRIQ_DATA_DIR || !isAbsolute(value.SENTRIQ_DATA_DIR) || value.SENTRIQ_TLS_TERMINATED !== "true")) {
    throw new Error("Production requires an absolute persistent data directory and explicit TLS termination");
  }
  return {
    nodeEnv: value.NODE_ENV, host: value.SENTRIQ_HOST, port: value.SENTRIQ_PORT,
    dataDir: value.SENTRIQ_DATA_DIR ?? fileURLToPath(new URL("../../../.data/security-api", import.meta.url)),
    rateLimitMax: value.SENTRIQ_RATE_LIMIT_MAX, rateLimitWindowMs: value.SENTRIQ_RATE_LIMIT_WINDOW_MS,
    logLevel: value.SENTRIQ_LOG_LEVEL,
  };
}
