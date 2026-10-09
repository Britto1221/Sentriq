import { createHash } from "node:crypto";

const globalLimits = globalThis as typeof globalThis & { __sentriqIntegrationLimits?: Map<string, number[]> };
const attempts = globalLimits.__sentriqIntegrationLimits ??= new Map<string, number[]>();

/** Process-local demo limiter; production hosts should supply shared persistent rate-limit state. */
export function allowSignupRequest(source: string, now = Date.now()): boolean {
  return allowKey("signup", source, 10, 60 * 60_000, now);
}

export function allowLoginAttempt(now = Date.now()): boolean {
  return allowKey("login", "process-wide", 100, 60 * 60_000, now);
}

function allowKey(namespace: string, value: string, limit: number, windowMs: number, now: number): boolean {
  const key = createHash("sha256").update(`${namespace}:${value}`, "utf8").digest("hex");
  const recent = (attempts.get(key) ?? []).filter((time) => time > now - windowMs);
  if (recent.length >= limit) return false;
  recent.push(now);
  attempts.set(key, recent);
  return true;
}
