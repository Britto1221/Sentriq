import { createHash, randomUUID } from "node:crypto";
import { deviceLinkRequestSummarySchema, passkeySummarySchema, securityEventSchema, sessionSummarySchema } from "@sentriq/shared";

const maxBodyBytes = 16 * 1024;
const timeoutMs = 5_000;
const routeTable: Record<string, { method: "GET" | "POST"; needsSession: boolean; issuesCookie?: "login" | "clear"; injectOrigin?: true | "transaction" | "login-email" | "device-link"; injectReclaim?: "verify-code" | "options" | "verify-passkey" | "cancel"; internalOnly?: boolean; needsEnrollment?: boolean; issuesEnrollment?: boolean; clearEnrollment?: boolean; needsDeviceLink?: boolean; issuesDeviceLink?: boolean; clearDeviceLink?: boolean; needsReclaim?: boolean; issuesReclaim?: boolean; clearReclaim?: boolean }> = {
  "registration/start": { method: "POST", needsSession: false },
  "registration/verify": { method: "POST", needsSession: false, issuesEnrollment: true },
  "dev/email-inbox": { method: "POST", needsSession: false },
  session: { method: "GET", needsSession: true },
  sessions: { method: "GET", needsSession: true },
  credentials: { method: "GET", needsSession: true },
  "credentials/rename": { method: "POST", needsSession: true },
  "credentials/revoke": { method: "POST", needsSession: true, internalOnly: true },
  events: { method: "GET", needsSession: true },
  "sessions/revoke": { method: "POST", needsSession: true, internalOnly: true },
  "account/delete": { method: "POST", needsSession: true, issuesCookie: "clear", internalOnly: true },
  logout: { method: "POST", needsSession: true, issuesCookie: "clear" },
  "webauthn/register/options": { method: "POST", needsSession: false, needsEnrollment: true, injectOrigin: true },
  "webauthn/register/verify": { method: "POST", needsSession: false, needsEnrollment: true, issuesCookie: "login", clearEnrollment: true },
  "webauthn/login/options": { method: "POST", needsSession: false, injectOrigin: "login-email" },
  "webauthn/login/verify": { method: "POST", needsSession: false, issuesCookie: "login" },
  "reclaim/start": { method: "POST", needsSession: false, issuesReclaim: true },
  "reclaim/verify": { method: "POST", needsSession: false, needsReclaim: true, injectReclaim: "verify-code" },
  "reclaim/passkey/options": { method: "POST", needsSession: false, needsReclaim: true, injectReclaim: "options" },
  "reclaim/passkey/verify": { method: "POST", needsSession: false, needsReclaim: true, injectReclaim: "verify-passkey", clearReclaim: true },
  "reclaim/cancel": { method: "POST", needsSession: false, needsReclaim: true, injectReclaim: "cancel", clearReclaim: true },
  "device-links/start": { method: "POST", needsSession: false, issuesDeviceLink: true },
  "device-links/inbox": { method: "GET", needsSession: true },
  "device-links/status": { method: "POST", needsSession: false, needsDeviceLink: true },
  "device-links/approval/options": { method: "POST", needsSession: true, injectOrigin: "device-link" },
  "device-links/approval/verify": { method: "POST", needsSession: true },
  "device-links/reject": { method: "POST", needsSession: true },
  "device-links/registration/options": { method: "POST", needsSession: false, needsDeviceLink: true, injectOrigin: "device-link" },
  "device-links/registration/verify": { method: "POST", needsSession: false, needsDeviceLink: true, issuesCookie: "login", clearDeviceLink: true },
  "device-links/cancel": { method: "POST", needsSession: false, needsDeviceLink: true, clearDeviceLink: true },
};

type Environment = Record<string, string | undefined>;
interface ProxyConfig { apiBaseUrl: string; applicationId: string; applicationKey: string; origin: string; production: boolean; cookieName: string; enrollmentCookieName: string; deviceLinkCookieName: string; reclaimCookieName: string }

function reply(status: number, payload: unknown, correlationId: string, headers?: HeadersInit): Response {
  const result = new Headers(headers);
  result.set("content-type", "application/json; charset=utf-8");
  result.set("cache-control", "no-store");
  result.set("pragma", "no-cache");
  result.set("x-correlation-id", correlationId);
  return new Response(JSON.stringify(payload), { status, headers: result });
}

function failure(status: number, code: string, message: string, correlationId: string): Response {
  return reply(status, { error: { code, message, correlationId } }, correlationId);
}

function configFrom(env: Environment): ProxyConfig | undefined {
  const rawBase = env.SENTRIQ_API_BASE_URL;
  const applicationId = env.SENTRIQ_APPLICATION_ID;
  const applicationKey = env.SENTRIQ_APPLICATION_KEY;
  const rawOrigin = env.NORTHSTAR_PUBLIC_ORIGIN;
  if (!rawBase || !applicationId || applicationId.length > 120 || !applicationKey || !/^[A-Za-z0-9_-]{32,256}$/.test(applicationKey) || !rawOrigin) return undefined;
  try {
    const base = new URL(rawBase);
    const origin = new URL(rawOrigin);
    const production = env.NODE_ENV === "production";
    const localHosts = new Set(["localhost", "127.0.0.1", "::1"]);
    const allowsHttp = !production && localHosts.has(base.hostname) && localHosts.has(origin.hostname);
    if ((base.protocol !== "https:" || origin.protocol !== "https:") && !allowsHttp) return undefined;
    if (origin.pathname !== "/" || origin.search || origin.hash || base.username || base.password || origin.username || origin.password) return undefined;
    const cookiePrefix = production ? "__Host-" : "";
    const digest = createHash("sha256").update(applicationId).digest("hex").slice(0, 12);
    return {
      apiBaseUrl: base.toString().replace(/\/$/, ""), applicationId, applicationKey, origin: origin.origin, production,
      cookieName: `${cookiePrefix}sentriq_${digest}`, enrollmentCookieName: `${cookiePrefix}sentriq_enrollment`, deviceLinkCookieName: `${cookiePrefix}sentriq_device_link`, reclaimCookieName: `${cookiePrefix}sentriq_reclaim`,
    };
  } catch {
    return undefined;
  }
}

function sessionToken(request: Request, name: string): string | undefined {
  const raw = request.headers.get("cookie");
  if (!raw || raw.length > 8_192) return undefined;
  const values: string[] = [];
  for (const pair of raw.split(";")) {
    const separator = pair.indexOf("=");
    if (separator < 0) continue;
    if (pair.slice(0, separator).trim() === name) values.push(pair.slice(separator + 1).trim());
  }
  if (values.length !== 1 || !/^[A-Za-z0-9_-]{43}$/.test(values[0]!)) return undefined;
  return values[0];
}

/** Read only the server-held, HttpOnly Northstar session cookie. Never expose this value to a client bundle. */
export function readNorthstarSessionToken(request: Request, env: Environment = process.env): string | undefined {
  const config = configFrom(env);
  return config ? sessionToken(request, config.cookieName) : undefined;
}

function acceptedCookie(raw: string | null, config: ProxyConfig, kind: "login" | "clear"): string | undefined {
  if (!raw || raw.length > 512) return undefined;
  const segments = raw.split(";").map((segment) => segment.trim());
  const equals = segments[0]?.indexOf("=") ?? -1;
  if (equals < 1 || segments[0]!.slice(0, equals) !== config.cookieName) return undefined;
  const value = segments[0]!.slice(equals + 1);
  if (kind === "login" && !/^[A-Za-z0-9_-]{43}$/.test(value)) return undefined;
  if (kind === "clear" && value !== "") return undefined;
  const attributes = new Set(segments.slice(1).map((part) => part.toLowerCase()));
  if (!attributes.has("path=/") || !attributes.has("httponly") || !attributes.has("samesite=lax")) return undefined;
  if (segments.slice(1).some((part) => part.toLowerCase().startsWith("domain="))) return undefined;
  if (config.production && !attributes.has("secure")) return undefined;
  if (kind === "login" && !attributes.has("max-age=43200")) return undefined;
  if (kind === "clear" && !attributes.has("max-age=0")) return undefined;
  return raw;
}

function issueRestrictedCookie(name: string, value: string, config: ProxyConfig): string {
  return `${name}=${value}; Path=/; HttpOnly; SameSite=Strict; Max-Age=600${config.production ? "; Secure" : ""}`;
}

function clearRestrictedCookie(name: string, config: ProxyConfig): string {
  return `${name}=; Path=/; HttpOnly; SameSite=Strict; Max-Age=0${config.production ? "; Secure" : ""}`;
}

function isJsonObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function safeUpstreamError(status: number, value: unknown, correlationId: string, rawRetryAfter: string | null): Response {
  const upstream = isJsonObject(value) && isJsonObject(value.error) ? value.error : undefined;
  const code = typeof upstream?.code === "string" && /^[A-Z_]{1,40}$/.test(upstream.code) ? upstream.code : "UPSTREAM_ERROR";
  const message = status === 401 ? "Authentication failed." : status === 429 ? "Too many attempts. Wait and try again." : status < 500 ? "The request could not be completed." : "Authentication is temporarily unavailable.";
  const headers = new Headers();
  if (status === 429 && rawRetryAfter && /^\d{1,5}$/.test(rawRetryAfter)) headers.set("retry-after", rawRetryAfter);
  const safeStatus = status >= 400 && status <= 599 ? status : 502;
  return reply(safeStatus, { error: { code, message, correlationId } }, correlationId, headers);
}

async function readLimitedStream(stream: ReadableStream<Uint8Array> | null, limit: number): Promise<string | undefined> {
  if (!stream) return "";
  const reader = stream.getReader();
  const chunks: Uint8Array[] = [];
  let size = 0;
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    size += value.byteLength;
    if (size > limit) {
      await reader.cancel();
      return undefined;
    }
    chunks.push(value);
  }
  const body = new Uint8Array(size);
  let offset = 0;
  for (const chunk of chunks) { body.set(chunk, offset); offset += chunk.byteLength; }
  return new TextDecoder("utf-8", { fatal: true }).decode(body);
}

async function handleAuthProxyImpl(
  request: Request,
  segments: readonly string[],
  env: Environment = process.env,
  fetcher: typeof fetch = globalThis.fetch,
  allowInternal = false,
): Promise<Response> {
  const correlationId = randomUUID();
  const config = configFrom(env);
  if (!config) return failure(503, "AUTH_UNAVAILABLE", "Authentication is not configured.", correlationId);
  const route = routeTable[segments.join("/")];
  if (!route || route.method !== request.method) return failure(404, "NOT_FOUND", "The requested authentication route is unavailable.", correlationId);
  if (route.internalOnly && !allowInternal) return failure(404, "NOT_FOUND", "The requested authentication route is unavailable.", correlationId);
  if (request.method !== "GET") {
    if (request.headers.get("origin") !== config.origin || request.headers.get("sec-fetch-site") === "cross-site") {
      return failure(403, "ORIGIN_REJECTED", "This request could not be verified.", correlationId);
    }
  }

  const token = sessionToken(request, config.cookieName);
  if (route.needsSession && !token) return failure(401, "UNAUTHORIZED", "Authentication failed.", correlationId);
  const registrationToken = route.needsEnrollment ? sessionToken(request, config.enrollmentCookieName) : undefined;
  if (route.needsEnrollment && !registrationToken) return failure(401, "UNAUTHORIZED", "Authentication failed.", correlationId);
  const deviceLinkToken = route.needsDeviceLink ? sessionToken(request, config.deviceLinkCookieName) : undefined;
  if (route.needsDeviceLink && !deviceLinkToken) return failure(401, "UNAUTHORIZED", "Authentication failed.", correlationId);
  const reclaimToken = route.needsReclaim ? sessionToken(request, config.reclaimCookieName) : undefined;
  if (route.needsReclaim && !reclaimToken) return failure(401, "UNAUTHORIZED", "Authentication failed.", correlationId);

  let body: string | undefined;
  if (request.method === "POST") {
    if (!request.headers.get("content-type")?.toLowerCase().startsWith("application/json")) {
      return failure(415, "INVALID_REQUEST", "The request could not be completed.", correlationId);
    }
    const lengthHeader = request.headers.get("content-length");
    if (lengthHeader && /^\d+$/.test(lengthHeader) && Number(lengthHeader) > maxBodyBytes) {
      return failure(413, "INVALID_REQUEST", "The request is too large.", correlationId);
    }
    let raw: string | undefined;
    try { raw = await readLimitedStream(request.body, maxBodyBytes); } catch { return failure(400, "INVALID_REQUEST", "The request could not be completed.", correlationId); }
    if (raw === undefined) return failure(413, "INVALID_REQUEST", "The request is too large.", correlationId);
    let parsed: unknown;
    try { parsed = JSON.parse(raw); } catch { return failure(400, "INVALID_REQUEST", "The request could not be completed.", correlationId); }
    if (!isJsonObject(parsed)) return failure(400, "INVALID_REQUEST", "The request could not be completed.", correlationId);
    if (route.injectOrigin === true) {
      if (Object.keys(parsed).length !== 0) return failure(400, "INVALID_REQUEST", "The request could not be completed.", correlationId);
      parsed = { origin: config.origin };
    } else if (route.injectOrigin === "transaction") {
      if (Object.keys(parsed).length !== 1 || typeof parsed.transaction !== "string" || !/^[A-Za-z0-9_-]{43}$/.test(parsed.transaction)) {
        return failure(400, "INVALID_REQUEST", "The request could not be completed.", correlationId);
      }
      parsed = { transaction: parsed.transaction, origin: config.origin };
    } else if (route.injectOrigin === "login-email") {
      if (Object.keys(parsed).some((key) => key !== "email") || (parsed.email !== undefined && (typeof parsed.email !== "string" || parsed.email.length > 254))) {
        return failure(400, "INVALID_REQUEST", "The request could not be completed.", correlationId);
      }
      parsed = { origin: config.origin, ...(typeof parsed.email === "string" ? { email: parsed.email } : {}) };
    } else if (route.injectOrigin === "device-link") {
      if (Object.keys(parsed).length !== 1 || typeof parsed.requestId !== "string" || !/^[0-9a-f-]{36}$/i.test(parsed.requestId)) {
        return failure(400, "INVALID_REQUEST", "The request could not be completed.", correlationId);
      }
      parsed = { requestId: parsed.requestId, origin: config.origin };
    } else if (route.injectReclaim === "verify-code") {
      if (Object.keys(parsed).some((key) => key !== "email" && key !== "recoveryCode")
        || typeof parsed.email !== "string" || parsed.email.length > 254
        || typeof parsed.recoveryCode !== "string" || !/^[A-Za-z0-9_-]{32}$/.test(parsed.recoveryCode)) {
        return failure(400, "INVALID_REQUEST", "The request could not be completed.", correlationId);
      }
      parsed = { email: parsed.email, recoveryCode: parsed.recoveryCode, transaction: reclaimToken };
    } else if (route.injectReclaim === "options") {
      if (Object.keys(parsed).length !== 0) return failure(400, "INVALID_REQUEST", "The request could not be completed.", correlationId);
      parsed = { transaction: reclaimToken, origin: config.origin };
    } else if (route.injectReclaim === "verify-passkey") {
      if (Object.keys(parsed).length !== 2 || typeof parsed.challengeId !== "string" || !/^[0-9a-f-]{36}$/i.test(parsed.challengeId)
        || !isJsonObject(parsed.response)) return failure(400, "INVALID_REQUEST", "The request could not be completed.", correlationId);
      parsed = { transaction: reclaimToken, challengeId: parsed.challengeId, response: parsed.response };
    } else if (route.injectReclaim === "cancel") {
      if (Object.keys(parsed).length !== 0) return failure(400, "INVALID_REQUEST", "The request could not be completed.", correlationId);
      parsed = { transaction: reclaimToken };
    }
    body = JSON.stringify(parsed);
  }

  const controller = new AbortController();
  let timeout: ReturnType<typeof setTimeout> | undefined;
  try {
    const headers = new Headers({
      accept: "application/json",
      "x-sentriq-api-key": config.applicationKey,
      "x-sentriq-application-id": config.applicationId,
      "x-correlation-id": correlationId,
    });
    if (body !== undefined) headers.set("content-type", "application/json");
    if (token) headers.set("x-sentriq-session-token", token);
    if (registrationToken) headers.set("x-sentriq-registration-token", registrationToken);
    if (deviceLinkToken) headers.set("x-sentriq-device-link-token", deviceLinkToken);
    const pendingUpstream = fetcher(`${config.apiBaseUrl}/v1/auth/${segments.join("/")}`, {
      method: route.method,
      headers,
      body,
      signal: controller.signal,
      cache: "no-store",
      credentials: "omit",
      redirect: "error",
    });
    const upstream = await Promise.race([
      pendingUpstream,
      new Promise<never>((_resolve, reject) => {
        timeout = setTimeout(() => { controller.abort(); reject(new Error("Sentriq auth request timed out")); }, timeoutMs);
      }),
    ]);
    const declaredLength = upstream.headers.get("content-length");
    if (declaredLength && /^\d+$/.test(declaredLength) && Number(declaredLength) > 128 * 1024) return failure(502, "UPSTREAM_ERROR", "Authentication is temporarily unavailable.", correlationId);
    const responseText = await readLimitedStream(upstream.body, 128 * 1024);
    if (responseText === undefined) return failure(502, "UPSTREAM_ERROR", "Authentication is temporarily unavailable.", correlationId);
    if (!upstream.headers.get("content-type")?.toLowerCase().includes("application/json")) return failure(502, "UPSTREAM_ERROR", "Authentication is temporarily unavailable.", correlationId);
    let payload: unknown;
    try { payload = JSON.parse(responseText); } catch { return failure(502, "UPSTREAM_ERROR", "Authentication is temporarily unavailable.", correlationId); }
    if (!upstream.ok) return safeUpstreamError(upstream.status, payload, correlationId, upstream.headers.get("retry-after"));
    const sessionListRoute = route.method === "GET" && segments.length === 1 && segments[0] === "sessions";
    const credentialListRoute = route.method === "GET" && segments.length === 1 && segments[0] === "credentials";
    const credentialRenameRoute = route.method === "POST" && segments.join("/") === "credentials/rename";
    const eventListRoute = route.method === "GET" && segments.length === 1 && segments[0] === "events";
    const deviceLinkInboxRoute = route.method === "GET" && segments.join("/") === "device-links/inbox";
    const validPayload = sessionListRoute ? sessionSummarySchema.array().safeParse(payload).success
      : credentialListRoute ? passkeySummarySchema.array().safeParse(payload).success
        : credentialRenameRoute ? passkeySummarySchema.safeParse(payload).success
      : eventListRoute ? securityEventSchema.array().safeParse(payload).success
        : deviceLinkInboxRoute ? deviceLinkRequestSummarySchema.array().safeParse(payload).success : isJsonObject(payload);
    if (!validPayload) return failure(502, "UPSTREAM_ERROR", "Authentication is temporarily unavailable.", correlationId);

    const responseHeaders = new Headers();
    if (route.issuesCookie) {
      const cookie = acceptedCookie(upstream.headers.get("set-cookie"), config, route.issuesCookie);
      if (!cookie) return failure(502, "UPSTREAM_ERROR", "Authentication is temporarily unavailable.", correlationId);
      responseHeaders.set("set-cookie", cookie);
    }
    let safePayload = payload;
    if (route.issuesEnrollment) {
      const value = isJsonObject(payload) ? payload.registrationToken : undefined;
      if (typeof value !== "string" || !/^[A-Za-z0-9_-]{43}$/.test(value) || !isJsonObject(payload)) return failure(502, "UPSTREAM_ERROR", "Authentication is temporarily unavailable.", correlationId);
      const visible = { ...payload };
      delete visible.registrationToken;
      safePayload = visible;
      responseHeaders.append("set-cookie", issueRestrictedCookie(config.enrollmentCookieName, value, config));
    }
    if (route.issuesReclaim) {
      if (!isJsonObject(payload) || payload.status !== "accepted" || typeof payload.transaction !== "string"
        || !/^[A-Za-z0-9_-]{43}$/.test(payload.transaction) || payload.expiresIn !== 600) {
        return failure(502, "UPSTREAM_ERROR", "Authentication is temporarily unavailable.", correlationId);
      }
      const visible = { ...payload };
      delete visible.transaction;
      safePayload = visible;
      responseHeaders.append("set-cookie", issueRestrictedCookie(config.reclaimCookieName, payload.transaction, config));
    }
    if (route.issuesDeviceLink) {
      if (!isJsonObject(payload) || typeof payload.transaction !== "string" || !/^[A-Za-z0-9_-]{43}$/.test(payload.transaction)
        || typeof payload.requestId !== "string" || !/^[0-9a-f-]{36}$/i.test(payload.requestId)
        || typeof payload.comparisonCode !== "string" || !/^[A-Z2-9]{6}$/.test(payload.comparisonCode)) return failure(502, "UPSTREAM_ERROR", "Authentication is temporarily unavailable.", correlationId);
      const visible = { ...payload };
      delete visible.transaction;
      safePayload = visible;
      responseHeaders.append("set-cookie", issueRestrictedCookie(config.deviceLinkCookieName, payload.transaction, config));
    }
    if (route.clearEnrollment) responseHeaders.append("set-cookie", clearRestrictedCookie(config.enrollmentCookieName, config));
    if (route.clearDeviceLink) responseHeaders.append("set-cookie", clearRestrictedCookie(config.deviceLinkCookieName, config));
    if (route.clearReclaim && isJsonObject(payload) && (payload.status === "completed" || payload.status === "cancelled")) {
      responseHeaders.append("set-cookie", clearRestrictedCookie(config.reclaimCookieName, config));
    }
    return reply(upstream.status, safePayload, correlationId, responseHeaders);
  } catch {
    if (controller.signal.aborted) return failure(504, "UPSTREAM_TIMEOUT", "Authentication is taking too long. Try again.", correlationId);
    return failure(503, "UPSTREAM_UNAVAILABLE", "Authentication is temporarily unavailable.", correlationId);
  } finally {
    if (timeout) clearTimeout(timeout);
  }
}

export function handleAuthProxy(request: Request, segments: readonly string[], env: Environment = process.env, fetcher: typeof fetch = globalThis.fetch): Promise<Response> {
  return handleAuthProxyImpl(request, segments, env, fetcher, false);
}

/** This operation is intentionally unavailable through the public auth proxy route. */
export async function revokeNorthstarSession(request: Request, sessionId: string, env: Environment = process.env, fetcher: typeof fetch = globalThis.fetch): Promise<Response> {
  const config = configFrom(env);
  if (!config) return failure(503, "AUTH_UNAVAILABLE", "Authentication is not configured.", randomUUID());
  const internalRequest = new Request(`${config.origin}/api/auth/sessions/revoke`, {
    method: "POST",
    headers: { origin: config.origin, "sec-fetch-site": "same-origin", "content-type": "application/json", cookie: request.headers.get("cookie") ?? "" },
    body: JSON.stringify({ sessionId }),
  });
  return handleAuthProxyImpl(internalRequest, ["sessions", "revoke"], env, fetcher, true);
}

/** Account deletion is available only to the trusted protected-action route after Sentriq ALLOW. */
export async function deleteNorthstarAccount(request: Request, env: Environment = process.env, fetcher: typeof fetch = globalThis.fetch): Promise<Response> {
  const config = configFrom(env);
  if (!config) return failure(503, "AUTH_UNAVAILABLE", "Authentication is not configured.", randomUUID());
  const internalRequest = new Request(`${config.origin}/api/auth/account/delete`, {
    method: "POST",
    headers: { origin: config.origin, "sec-fetch-site": "same-origin", "content-type": "application/json", cookie: request.headers.get("cookie") ?? "" },
    body: "{}",
  });
  return handleAuthProxyImpl(internalRequest, ["account", "delete"], env, fetcher, true);
}

/** Passkey removal is hidden from the public auth proxy and consumes its action-bound grant in the API transaction. */
export async function revokeNorthstarPasskey(request: Request, credentialId: string, stepUpGrantId: string, env: Environment = process.env, fetcher: typeof fetch = globalThis.fetch): Promise<Response> {
  const config = configFrom(env);
  if (!config) return failure(503, "AUTH_UNAVAILABLE", "Authentication is not configured.", randomUUID());
  const internalRequest = new Request(`${config.origin}/api/auth/credentials/revoke`, {
    method: "POST",
    headers: { origin: config.origin, "sec-fetch-site": "same-origin", "content-type": "application/json", cookie: request.headers.get("cookie") ?? "" },
    body: JSON.stringify({ credentialId, stepUpGrantId }),
  });
  return handleAuthProxyImpl(internalRequest, ["credentials", "revoke"], env, fetcher, true);
}
