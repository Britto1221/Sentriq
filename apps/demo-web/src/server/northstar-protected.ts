import { createHash } from "node:crypto";
import { SentriqClient } from "@sentriq/sdk";
import type { AuthSession, AuthenticatedUser } from "@/lib/auth-client";
import { handleAuthProxy, readNorthstarSessionToken } from "./auth-proxy";

export interface NorthstarProtectedContext {
  applicationId: string;
  user: AuthenticatedUser;
  session: AuthSession["session"];
  resourceId: string;
  sessionToken: string;
  client: SentriqClient;
}

export function jsonReply(status: number, value: unknown, extraHeaders?: HeadersInit): Response {
  const headers = new Headers(extraHeaders);
  headers.set("content-type", "application/json; charset=utf-8");
  headers.set("cache-control", "no-store");
  headers.set("pragma", "no-cache");
  return new Response(JSON.stringify(value), { status, headers });
}

export function rejected(status: number, code: string, message: string): Response {
  return jsonReply(status, { error: { code, message } });
}

function isUser(value: unknown, applicationId: string): value is AuthenticatedUser {
  if (!value || typeof value !== "object") return false;
  const user = value as Partial<AuthenticatedUser>;
  return typeof user.id === "string" && typeof user.email === "string" && typeof user.displayName === "string"
    && (user.role === "user" || user.role === "developer" || user.role === "admin")
    && user.applicationId === applicationId && typeof user.passkeyEnrollmentRequired === "boolean";
}

export async function getNorthstarProtectedContext(request: Request): Promise<NorthstarProtectedContext | Response> {
  const publicOrigin = process.env.NORTHSTAR_PUBLIC_ORIGIN ?? "http://localhost:3001";
  if (request.method !== "GET" && (request.headers.get("origin") !== publicOrigin || request.headers.get("sec-fetch-site") === "cross-site")) {
    return rejected(403, "ORIGIN_REJECTED", "This request could not be verified.");
  }
  const apiBaseUrl = process.env.SENTRIQ_API_BASE_URL;
  const applicationId = process.env.SENTRIQ_APPLICATION_ID;
  const apiKey = process.env.SENTRIQ_APPLICATION_KEY;
  const sessionToken = readNorthstarSessionToken(request);
  if (!apiBaseUrl || !applicationId || !apiKey || !sessionToken || !/^[A-Za-z0-9_-]{32,256}$/.test(apiKey)) {
    return rejected(503, "SECURITY_UNAVAILABLE", "Protected actions are temporarily unavailable.");
  }
  try {
    const sessionResponse = await handleAuthProxy(new Request(`${publicOrigin}/api/auth/session`, {
      method: "GET", headers: { cookie: request.headers.get("cookie") ?? "" },
    }), ["session"]);
    if (!sessionResponse.ok) return rejected(401, "UNAUTHORIZED", "Sign in again to continue.");
    const value: unknown = await sessionResponse.json();
    if (!value || typeof value !== "object") return rejected(401, "UNAUTHORIZED", "Sign in again to continue.");
    const candidate = value as { user?: unknown; session?: unknown };
    if (!isUser(candidate.user, applicationId) || !candidate.session || typeof candidate.session !== "object") return rejected(401, "UNAUTHORIZED", "Sign in again to continue.");
    const sessionValue = candidate.session as { id?: unknown; expiresAt?: unknown };
    if (typeof sessionValue.id !== "string" || typeof sessionValue.expiresAt !== "string") return rejected(401, "UNAUTHORIZED", "Sign in again to continue.");
    const client = new SentriqClient({ baseUrl: apiBaseUrl, applicationId, apiKey, timeoutMs: 3000 });
    return {
      applicationId, user: candidate.user,
      session: { id: sessionValue.id, expiresAt: sessionValue.expiresAt },
      resourceId: `account-${candidate.user.id}`,
      sessionToken,
      client,
    };
  } catch {
    return rejected(503, "SECURITY_UNAVAILABLE", "Protected actions are temporarily unavailable.");
  }
}

export function isProtectedContext(value: NorthstarProtectedContext | Response): value is NorthstarProtectedContext {
  return !(value instanceof Response);
}

export type NorthstarProtectedAction = "data.export" | "account.delete" | "session.revoke" | "passkey.remove";

export function actionGrantCookieName(applicationId: string, actionId: NorthstarProtectedAction): string {
  const suffix = createHash("sha256").update(`${applicationId}:${actionId}`).digest("hex").slice(0, 16);
  return `${process.env.NODE_ENV === "production" ? "__Secure-" : ""}sentriq_stepup_${suffix}`;
}

export function actionGrantCookiePath(actionId: NorthstarProtectedAction): string {
  if (actionId === "data.export") return "/api/protected/export";
  if (actionId === "account.delete") return "/api/protected/account/delete";
  if (actionId === "passkey.remove") return "/api/protected/passkeys/revoke";
  return "/api/protected/sessions/revoke";
}

export function readCookie(request: Request, name: string): string | undefined {
  const raw = request.headers.get("cookie");
  if (!raw || raw.length > 8192) return undefined;
  const values = raw.split(";").flatMap((part) => {
    const separator = part.indexOf("=");
    return separator > 0 && part.slice(0, separator).trim() === name ? [part.slice(separator + 1).trim()] : [];
  });
  return values.length === 1 && /^[A-Za-z0-9_-]{43}$/.test(values[0]!) ? values[0] : undefined;
}

export async function readJsonBody(request: Request, limit = 16 * 1024): Promise<unknown | Response> {
  if (!request.headers.get("content-type")?.toLowerCase().startsWith("application/json")) return rejected(415, "INVALID_REQUEST", "The request could not be completed.");
  const declared = request.headers.get("content-length");
  if (declared && /^\d+$/.test(declared) && Number(declared) > limit) return rejected(413, "INVALID_REQUEST", "The request is too large.");
  try {
    const reader = request.body?.getReader();
    if (!reader) return rejected(400, "INVALID_REQUEST", "The request could not be completed.");
    const chunks: Uint8Array[] = []; let size = 0;
    while (true) {
      const item = await reader.read();
      if (item.done) break;
      size += item.value.byteLength;
      if (size > limit) { await reader.cancel(); return rejected(413, "INVALID_REQUEST", "The request is too large."); }
      chunks.push(item.value);
    }
    const bytes = new Uint8Array(size); let offset = 0;
    for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.byteLength; }
    const parsed: unknown = JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(bytes));
    return parsed && typeof parsed === "object" && !Array.isArray(parsed) ? parsed : rejected(400, "INVALID_REQUEST", "The request could not be completed.");
  } catch { return rejected(400, "INVALID_REQUEST", "The request could not be completed."); }
}
