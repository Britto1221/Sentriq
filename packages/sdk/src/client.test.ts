import { describe, expect, it, vi } from "vitest";
import { SentriqApiError, SentriqClient } from "./index";

const validInput = {
  applicationId: "northstar-untrusted-client-value",
  userId: "alice-01",
  sessionId: "session-01",
  actionId: "data.export" as const,
  resourceId: "profile:alice-01",
};

const validResult = {
  decision: "STEP_UP" as const,
  reasonCode: "sensitive_action_requires_fresh_verification",
  policyVersion: 4,
  correlationId: "corr-01",
  stepUpChallengeId: "stepup-01",
};

describe("Sentriq server SDK", () => {
  it("pins requests to its server-side application identity and validates the result", async () => {
    const fetcher = vi.fn<typeof fetch>(async () => new Response(JSON.stringify(validResult), { status: 200 }));
    const client = new SentriqClient({
      baseUrl: "http://localhost:4100/",
      applicationId: "northstar",
      apiKey: "test-secret-that-is-never-logged-123",
      timeoutMs: 100,
    }, fetcher);

    await expect(client.evaluate(validInput, "session-cookie-secret")).resolves.toEqual(validResult);
    expect(fetcher).toHaveBeenCalledTimes(1);
    const [url, init] = fetcher.mock.calls[0] as [string, RequestInit];
    expect(url).toBe("http://localhost:4100/v1/evaluations");
    expect(JSON.parse(String(init.body))).toMatchObject({ applicationId: "northstar", actionId: "data.export" });
    const headers = new Headers(init.headers);
    expect(headers.get("x-sentriq-api-key")).toBe("test-secret-that-is-never-logged-123");
    expect(headers.get("x-sentriq-session-token")).toBe("session-cookie-secret");
    expect(headers.get("x-correlation-id")).toBeTruthy();
  });

  it("rejects non-HTTPS endpoints outside localhost", () => {
    expect(() => new SentriqClient({
      baseUrl: "http://sentriq.example",
      applicationId: "northstar",
      apiKey: "test-secret-that-is-never-logged-123",
    })).toThrow("HTTPS outside localhost");
  });

  it("does not retry or reflect arbitrary upstream response data", async () => {
    const secret = "internal-api-key-never-return-this";
    const fetcher = vi.fn<typeof fetch>(async () => new Response(JSON.stringify({ secret }), { status: 500 }));
    const client = new SentriqClient({
      baseUrl: "http://localhost:4100",
      applicationId: "northstar",
      apiKey: "test-secret-that-is-never-logged-123",
      timeoutMs: 100,
    }, fetcher);

    const error = await client.evaluate(validInput).catch((caught: unknown) => caught);
    expect(fetcher).toHaveBeenCalledTimes(1);
    expect(error).toBeInstanceOf(SentriqApiError);
    expect((error as Error).message.includes(secret)).toBe(false);
  });

  it("converts an aborted request into a bounded timeout error", async () => {
    const fetcher: typeof fetch = (_input, init) => new Promise((_resolve, reject) => {
      init?.signal?.addEventListener("abort", () => reject(new DOMException("aborted", "AbortError")), { once: true });
    });
    const client = new SentriqClient({
      baseUrl: "http://localhost:4100",
      applicationId: "northstar",
      apiKey: "test-secret-that-is-never-logged-123",
      timeoutMs: 1,
    }, fetcher);

    await expect(client.evaluate(validInput)).rejects.toMatchObject({ code: "UPSTREAM_TIMEOUT", status: 504 });
  });

  it("lists only safe, session-scoped security events", async () => {
    const events = [{ id: "evt-01", tenantId: "tenant-1", applicationId: "northstar", occurredAt: "2026-10-08T10:00:00.000Z",
      type: "AUTH_LOGIN_SUCCEEDED", outcome: "SUCCESS", subjectId: "user-1", correlationId: "corr-1", reasonCode: "authenticated" }];
    const fetcher = vi.fn<typeof fetch>(async () => new Response(JSON.stringify(events), { status: 200 }));
    const client = new SentriqClient({ baseUrl: "http://localhost:4100", applicationId: "northstar", apiKey: "test-secret-that-is-never-logged-123" }, fetcher);
    await expect(client.listEvents("session-cookie-secret")).resolves.toEqual(events);
    expect(String(fetcher.mock.calls[0]?.[0])).toBe("http://localhost:4100/v1/auth/events");
    expect(new Headers(fetcher.mock.calls[0]?.[1]?.headers).get("x-sentriq-session-token")).toBe("session-cookie-secret");
  });

  it("uses typed Reclaim routes without forwarding a user session or exposing server credentials to browser code", async () => {
    const transaction = "t".repeat(43);
    const fetcher = vi.fn<typeof fetch>(async (url) => {
      const path = new URL(String(url)).pathname;
      if (path.endsWith("/reclaim/start")) return new Response(JSON.stringify({ status: "accepted", transaction, expiresIn: 600 }), { status: 200 });
      if (path.endsWith("/reclaim/verify")) return new Response(JSON.stringify({ status: "verified", expiresIn: 600 }), { status: 200 });
      if (path.endsWith("/reclaim/passkey/options")) return new Response(JSON.stringify({
        challengeId: "66b01ab4-236f-498f-8dde-dc1df5be96c4",
        options: { challenge: "challenge-value", rp: { name: "Northstar", id: "localhost" }, user: { id: "YWxpY2U", name: "alice@example.test", displayName: "Alice" },
          pubKeyCredParams: [{ type: "public-key", alg: -7 }], authenticatorSelection: { residentKey: "required", userVerification: "required" } },
      }), { status: 200 });
      return new Response(JSON.stringify({ status: "completed", recoveryCodes: Array.from({ length: 6 }, (_, index) => String(index).padStart(32, "a")) }), { status: 200 });
    });
    const client = new SentriqClient({ baseUrl: "http://localhost:4100", applicationId: "northstar", apiKey: "test-secret-that-is-never-logged-123" }, fetcher);

    await expect(client.reclaimStart({ accountId: "alice-account" })).resolves.toMatchObject({ status: "accepted", transaction });
    await expect(client.reclaimVerify({ accountId: "alice-account", transaction, recoveryCode: "A".repeat(32) })).resolves.toEqual({ status: "verified", expiresIn: 600 });
    await expect(client.reclaimRegistrationOptions({ transaction, origin: "http://localhost:3000" })).resolves.toMatchObject({ challengeId: "66b01ab4-236f-498f-8dde-dc1df5be96c4" });
    const [, optionsInit] = fetcher.mock.calls[2] as [string, RequestInit];
    expect(new Headers(optionsInit.headers).get("x-sentriq-session-token")).toBeNull();
    expect(JSON.parse(String(optionsInit.body))).toEqual({ transaction, origin: "http://localhost:3000" });
  });
});
