import { createHash } from "node:crypto";
import { describe, expect, it, vi } from "vitest";
import { deleteNorthstarAccount, handleAuthProxy } from "./auth-proxy";

const env = {
  SENTRIQ_API_BASE_URL: "http://127.0.0.1:4000",
  SENTRIQ_APPLICATION_ID: "app_northstar",
  SENTRIQ_APPLICATION_KEY: "x".repeat(48),
  NORTHSTAR_PUBLIC_ORIGIN: "http://localhost:3001",
};
const cookieName = `sentriq_${createHash("sha256").update(env.SENTRIQ_APPLICATION_ID).digest("hex").slice(0, 12)}`;
const cookie = `${cookieName}=${"s".repeat(43)}`;
const request = (path: string, init: RequestInit = {}) => new Request(`http://localhost:3001/api/auth/${path}`, {
  ...init,
  headers: new Headers({ origin: "http://localhost:3001", "content-type": "application/json", ...(init.headers as Record<string, string> | undefined) }),
});
const fetchOk = (body: unknown, headers: HeadersInit = {}, status = 200): typeof fetch => vi.fn(async () => new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json", ...Object.fromEntries(new Headers(headers)) } })) as typeof fetch;

describe("Northstar trusted auth proxy", () => {
  it("rejects cross-origin mutations before contacting Sentriq", async () => {
    const fetcher = fetchOk({ user: { id: "u1" } });
    const response = await handleAuthProxy(request("webauthn/login/options", { method: "POST", headers: { origin: "https://attacker.invalid" }, body: "{}" }), ["webauthn", "login", "options"], env, fetcher);
    expect(response.status).toBe(403);
    expect(fetcher).toHaveBeenCalledTimes(0);
  });

  it("fails closed when server credentials are missing", async () => {
    const fetcher = fetchOk({ user: { id: "u1" } });
    const response = await handleAuthProxy(request("webauthn/login/options", { method: "POST", body: "{}" }), ["webauthn", "login", "options"], { ...env, SENTRIQ_APPLICATION_KEY: "" }, fetcher);
    expect(response.status).toBe(503);
    expect(fetcher).toHaveBeenCalledTimes(0);
  });

  it("allows only known auth routes and methods", async () => {
    const fetcher = fetchOk({ ok: true });
    const wrongMethod = await handleAuthProxy(request("logout", { method: "GET" }), ["logout"], env, fetcher);
    const unknown = await handleAuthProxy(request("admin", { method: "POST", body: "{}" }), ["admin"], env, fetcher);
    expect(wrongMethod.status).toBe(404);
    expect(unknown.status).toBe(404);
    expect(fetcher).toHaveBeenCalledTimes(0);
  });

  it("keeps passkey revocation behind the protected-action route and validates public credential summaries", async () => {
    const fetcher = fetchOk({ status: "revoked" });
    const directRevoke = await handleAuthProxy(request("credentials/revoke", { method: "POST", headers: { cookie }, body: JSON.stringify({ credentialId: "a".repeat(36), stepUpGrantId: "g".repeat(43) }) }), ["credentials", "revoke"], env, fetcher);
    expect(directRevoke.status).toBe(404);
    expect(vi.mocked(fetcher).mock.calls.length > 0).toBe(false);

    const summary = { id: "f7589ec7-7874-4815-99ac-cc7c7900c7e0", displayName: "Phone", createdAt: "2026-10-08T10:00:00.000Z", deviceType: "multiDevice", backedUp: true };
    const list = await handleAuthProxy(request("credentials", { headers: { cookie } }), ["credentials"], env, fetchOk([summary]));
    expect(list.status).toBe(200);
    expect(await list.json()).toEqual([summary]);

    const unsafe = await handleAuthProxy(request("credentials", { headers: { cookie } }), ["credentials"], env,
      fetchOk([{ ...summary, publicKey: "must-not-cross-the-proxy" }]));
    expect(unsafe.status).toBe(502);
  });

  it("forwards Reclaim as a bounded credential-free flow and replaces client origin with the configured origin", async () => {
    const transaction = "t".repeat(43);
    const options = { challengeId: "c1", options: { challenge: "a-valid-challenge" } };
    const fetcher = fetchOk(options);
    const cookieHeader = { cookie: `sentriq_reclaim=${transaction}` };
    const injectedOrigin = await handleAuthProxy(request("reclaim/passkey/options", { method: "POST", headers: cookieHeader, body: JSON.stringify({ transaction, origin: "https://attacker.invalid" }) }), ["reclaim", "passkey", "options"], env, fetcher);
    expect(injectedOrigin.status).toBe(400);
    expect(fetcher).toHaveBeenCalledTimes(0);

    const response = await handleAuthProxy(request("reclaim/passkey/options", { method: "POST", headers: cookieHeader, body: "{}" }), ["reclaim", "passkey", "options"], env, fetcher);
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual(options);
    const [, init] = vi.mocked(fetcher).mock.calls[0]!;
    const headers = new Headers(init?.headers);
    expect(headers.get("x-sentriq-api-key")).toBe(env.SENTRIQ_APPLICATION_KEY);
    expect(headers.get("x-sentriq-session-token")).toBeNull();
    expect(JSON.parse(String(init?.body))).toEqual({ transaction, origin: env.NORTHSTAR_PUBLIC_ORIGIN });
  });

  it("keeps account deletion private to the policy-checked server action", async () => {
    const clearCookie = `${cookieName}=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0`;
    const fetcher = fetchOk({ status: "deleted" }, { "set-cookie": clearCookie });
    const publicCall = await handleAuthProxy(request("account/delete", { method: "POST", body: "{}", headers: { cookie } }), ["account", "delete"], env, fetcher);
    expect(publicCall.status).toBe(404);
    expect(fetcher).toHaveBeenCalledTimes(0);

    const result = await deleteNorthstarAccount(request("account/delete", { method: "POST", body: "{}", headers: { cookie } }), env, fetcher);
    expect(result.status).toBe(200);
    expect(result.headers.get("set-cookie")).toBe(clearCookie);
    const [url, init] = vi.mocked(fetcher).mock.calls[0]!;
    expect(String(url)).toBe("http://127.0.0.1:4000/v1/auth/account/delete");
    expect(init?.method).toBe("POST");
    expect(JSON.parse(String(init?.body))).toEqual({});
    expect(new Headers(init?.headers).get("x-sentriq-session-token")).toBe("s".repeat(43));
  });

  it("adds app credentials only on the server and does not trust caller origin for ceremonies", async () => {
    const fetcher = fetchOk({ challengeId: "c1", options: { challenge: "abc" } });
    const response = await handleAuthProxy(request("webauthn/login/options", { method: "POST", body: JSON.stringify({ origin: "https://attacker.invalid" }) }), ["webauthn", "login", "options"], env, fetcher);
    expect(response.status).toBe(400);
    expect(fetcher).toHaveBeenCalledTimes(0);

    const good = await handleAuthProxy(request("webauthn/login/options", { method: "POST", body: "{}" }), ["webauthn", "login", "options"], env, fetcher);
    expect(good.status).toBe(200);
    const [, init] = vi.mocked(fetcher).mock.calls[0]!;
    const headers = new Headers(init?.headers);
    expect(headers.get("x-sentriq-api-key")).toBe(env.SENTRIQ_APPLICATION_KEY);
    expect(headers.get("x-sentriq-application-id")).toBe(env.SENTRIQ_APPLICATION_ID);
    expect(JSON.parse(String(init?.body))).toEqual({ origin: env.NORTHSTAR_PUBLIC_ORIGIN });
    expect((await good.text()).includes(env.SENTRIQ_APPLICATION_KEY)).toBe(false);
  });

  it("forwards only the server cookie as a session header on authenticated routes", async () => {
    const fetcher = fetchOk({ user: { id: "u1" }, session: { id: "s1" } });
    const response = await handleAuthProxy(request("session", { method: "GET", headers: { cookie } }), ["session"], env, fetcher);
    expect(response.status).toBe(200);
    const [, init] = vi.mocked(fetcher).mock.calls[0]!;
    const headers = new Headers(init?.headers);
    expect(headers.get("x-sentriq-session-token")).toBe("s".repeat(43));
    expect(headers.get("cookie")).toBeNull();
  });

  it("accepts only schema-valid session lists from the authenticated upstream route", async () => {
    const session = {
      id: "session-1", userId: "user-1", applicationId: "app_northstar",
      createdAt: "2026-10-08T10:00:00.000Z", expiresAt: "2026-10-08T22:00:00.000Z",
      status: "active", current: true,
    };
    const good = await handleAuthProxy(request("sessions", { method: "GET", headers: { cookie } }), ["sessions"], env, fetchOk([session]));
    expect(good.status).toBe(200);
    expect(await good.json()).toEqual([session]);

    const malformed = await handleAuthProxy(request("sessions", { method: "GET", headers: { cookie } }), ["sessions"], env, fetchOk([{ ...session, token: "must not be forwarded" }]));
    expect(malformed.status).toBe(502);
  });

  it("accepts only safe current-user event records from the authenticated upstream route", async () => {
    const event = { id: "evt-01", tenantId: "tenant-1", applicationId: "app_northstar", occurredAt: "2026-10-08T10:00:00.000Z",
      type: "AUTH_LOGIN_SUCCEEDED", outcome: "SUCCESS", subjectId: "user-1", correlationId: "corr-1", reasonCode: "authenticated" };
    const good = await handleAuthProxy(request("events", { method: "GET", headers: { cookie } }), ["events"], env, fetchOk([event]));
    expect(good.status).toBe(200);
    expect(await good.json()).toEqual([event]);

    const malformed = await handleAuthProxy(request("events", { method: "GET", headers: { cookie } }), ["events"], env, fetchOk([{ ...event, riskScore: 90 }]));
    expect(malformed.status).toBe(502);
  });

  it("does not call upstream when a session cookie is absent", async () => {
    const fetcher = fetchOk({ status: "ok" });
    const response = await handleAuthProxy(request("logout", { method: "POST", body: "{}" }), ["logout"], env, fetcher);
    expect(response.status).toBe(401);
    expect(fetcher).toHaveBeenCalledTimes(0);
  });

  it("bounds an upstream request even when the fetch implementation ignores abort", async () => {
    vi.useFakeTimers();
    try {
      const fetcher: typeof fetch = vi.fn(() => new Promise<Response>(() => undefined)) as typeof fetch;
      const pending = handleAuthProxy(request("webauthn/login/options", { method: "POST", body: "{}" }), ["webauthn", "login", "options"], env, fetcher);
      await vi.advanceTimersByTimeAsync(5_001);
      const response = await pending;
      expect(response.status).toBe(504);
      expect(fetcher).toHaveBeenCalledTimes(1);
    } finally {
      vi.useRealTimers();
    }
  });

  it("relays an HttpOnly session cookie only from a successful passkey login response", async () => {
    const setCookie = `${cookieName}=${"s".repeat(43)}; Path=/; HttpOnly; SameSite=Lax; Max-Age=43200`;
    const fetcher = fetchOk({ user: { id: "u1" } }, { "set-cookie": setCookie });
    const response = await handleAuthProxy(request("webauthn/login/verify", { method: "POST", body: JSON.stringify({ challengeId: "c1", response: {} }) }), ["webauthn", "login", "verify"], env, fetcher);
    expect(response.status).toBe(200);
    expect(response.headers.get("set-cookie")).toBe(setCookie);
    expect(response.headers.get("cache-control")).toBe("no-store");
    expect((await response.text()).includes(setCookie.split("=")[1]!.split(";")[0]!)).toBe(false);
  });

  it("moves a host-owned enrollment grant to an HttpOnly cookie", async () => {
    const registrationToken = "r".repeat(43);
    const fetcher = fetchOk({ status: "accepted", accountId: "account-1", registrationToken, expiresIn: 600 });
    const response = await handleAuthProxy(request("registration/start", { method: "POST", body: JSON.stringify({ displayName: "Alice" }) }), ["registration", "start"], env, fetcher);
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ status: "accepted", accountId: "account-1", expiresIn: 600 });
    expect(response.headers.get("set-cookie")).toContain("sentriq_enrollment=");
    expect(response.headers.get("set-cookie")).toContain("HttpOnly");
    const optionsFetcher = fetchOk({ challengeId: "c1", options: { challenge: "abc" } });
    const options = await handleAuthProxy(request("webauthn/register/options", { method: "POST", headers: { cookie: "sentriq_enrollment=" + registrationToken }, body: "{}" }), ["webauthn", "register", "options"], env, optionsFetcher);
    expect(options.status).toBe(200);
    expect(new Headers(vi.mocked(optionsFetcher).mock.calls[0]![1]?.headers).get("x-sentriq-registration-token")).toBe(registrationToken);
  });

  it("keeps the restricted Reclaim transaction in an HttpOnly cookie throughout recovery", async () => {
    const transaction = "r".repeat(43);
    const start = await handleAuthProxy(request("reclaim/start", { method: "POST", body: JSON.stringify({ accountId: "account-1" }) }), ["reclaim", "start"], env,
      fetchOk({ status: "accepted", transaction, expiresIn: 600 }));
    expect(start.status).toBe(200);
    expect(await start.json()).toEqual({ status: "accepted", expiresIn: 600 });
    expect(start.headers.get("set-cookie")).toContain("sentriq_reclaim=");
    expect(start.headers.get("set-cookie")).toContain("HttpOnly");
    expect(start.headers.get("set-cookie")).toContain("SameSite=Strict");

    const verifyFetcher = fetchOk({ status: "verified", expiresIn: 600 });
    const verify = await handleAuthProxy(request("reclaim/verify", { method: "POST", headers: { cookie: `sentriq_reclaim=${transaction}` }, body: JSON.stringify({ accountId: "account-1", recoveryCode: "c".repeat(32) }) }), ["reclaim", "verify"], env, verifyFetcher);
    expect(verify.status).toBe(200);
    expect(JSON.parse(String(vi.mocked(verifyFetcher).mock.calls[0]![1]?.body))).toEqual({ accountId: "account-1", recoveryCode: "c".repeat(32), transaction });
    expect((await verify.text()).includes(transaction)).toBe(false);

    const optionsFetcher = fetchOk({ challengeId: "challenge", options: { challenge: "fresh" } });
    const options = await handleAuthProxy(request("reclaim/passkey/options", { method: "POST", headers: { cookie: `sentriq_reclaim=${transaction}` }, body: "{}" }), ["reclaim", "passkey", "options"], env, optionsFetcher);
    expect(options.status).toBe(200);
    expect(JSON.parse(String(vi.mocked(optionsFetcher).mock.calls[0]![1]?.body))).toEqual({ transaction, origin: env.NORTHSTAR_PUBLIC_ORIGIN });

    const completeFetcher = fetchOk({ status: "completed", recoveryCodes: ["x".repeat(32)] });
    const challengeId = "ad40f2a6-8801-4c02-b7ef-6c6260446c95";
    const complete = await handleAuthProxy(request("reclaim/passkey/verify", { method: "POST", headers: { cookie: `sentriq_reclaim=${transaction}` }, body: JSON.stringify({ challengeId, response: { id: "credential" } }) }), ["reclaim", "passkey", "verify"], env, completeFetcher);
    expect(complete.status).toBe(200);
    expect(JSON.parse(String(vi.mocked(completeFetcher).mock.calls[0]![1]?.body))).toMatchObject({ transaction, challengeId });
    expect(complete.headers.get("set-cookie")).toContain("sentriq_reclaim=");
    expect(complete.headers.get("set-cookie")).toContain("Max-Age=0");
  });

  it("binds a new-device request token to an HttpOnly browser cookie and strips it from the response", async () => {
    const transaction = "d".repeat(43);
    const fetcher = fetchOk({ status: "accepted", requestId: "d4688a50-a1c4-47bd-a073-82fb08646a46", comparisonCode: "ABC234", transaction, expiresIn: 600 });
    const response = await handleAuthProxy(request("device-links/start", { method: "POST", body: JSON.stringify({ accountId: "account-1" }) }), ["device-links", "start"], env, fetcher);
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ status: "accepted", requestId: "d4688a50-a1c4-47bd-a073-82fb08646a46", comparisonCode: "ABC234", expiresIn: 600 });
    expect(response.headers.get("set-cookie")).toContain("sentriq_device_link=");
    expect(response.headers.get("set-cookie")).toContain("HttpOnly");

    const statusFetcher = fetchOk({ status: "PENDING" });
    await handleAuthProxy(request("device-links/status", { method: "POST", body: JSON.stringify({ requestId: "d4688a50-a1c4-47bd-a073-82fb08646a46" }), headers: { cookie: `sentriq_device_link=${transaction}` } }), ["device-links", "status"], env, statusFetcher);
    expect(new Headers(vi.mocked(statusFetcher).mock.calls[0]![1]?.headers).get("x-sentriq-device-link-token")).toBe(transaction);
  });

  it("validates and relays only safe device-link inbox summaries", async () => {
    const summary = {
      requestId: "d4688a50-a1c4-47bd-a073-82fb08646a46",
      comparisonCode: "ABC234",
      createdAt: "2026-10-08T10:00:00.000Z",
      expiresAt: "2026-10-08T10:10:00.000Z",
      status: "PENDING",
    };
    const response = await handleAuthProxy(request("device-links/inbox", { headers: { cookie } }), ["device-links", "inbox"], env, fetchOk([summary]));
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual([summary]);

    const unsafe = await handleAuthProxy(request("device-links/inbox", { headers: { cookie } }), ["device-links", "inbox"], env,
      fetchOk([{ ...summary, transaction: "sensitive" }]));
    expect(unsafe.status).toBe(502);
  });

  it("returns safe generic upstream errors and does not leak exception text", async () => {
    const fetcher: typeof fetch = vi.fn(async () => new Response(JSON.stringify({ error: { code: "INTERNAL", message: "secret database detail", correlationId: "c1" } }), { status: 500, headers: { "content-type": "application/json" } })) as typeof fetch;
    const response = await handleAuthProxy(request("webauthn/login/options", { method: "POST", body: "{}" }), ["webauthn", "login", "options"], env, fetcher);
    const result = await response.text();
    expect(response.status).toBe(500);
    expect(result.includes("secret database detail")).toBe(false);
  });

  it("rejects oversized or invalid JSON request bodies before contacting Sentriq", async () => {
    const fetcher = fetchOk({ ok: true });
    const oversized = await handleAuthProxy(request("registration/start", { method: "POST", body: JSON.stringify({ email: "a".repeat(20_000) }) }), ["registration", "start"], env, fetcher);
    const invalid = await handleAuthProxy(request("registration/start", { method: "POST", body: "not-json" }), ["registration", "start"], env, fetcher);
    expect(oversized.status).toBe(413);
    expect(invalid.status).toBe(400);
    expect(fetcher).toHaveBeenCalledTimes(0);
  });
});
