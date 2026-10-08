import { randomBytes, randomUUID } from "node:crypto";
import { describe, expect, it, vi } from "vitest";
import { SentriqClient } from "./index";
const key = randomBytes(32).toString("base64url"); const session = randomBytes(32).toString("base64url");
const input = { applicationId: "app", userId: "u", sessionId: "s", actionId: "data.export" as const, resourceId: "r" };
describe("step-up SDK boundary", () => {
  it("validates requests and configured timeout bounds before any network call", async () => {
    const fetcher = vi.fn<typeof fetch>(async () => new Response("{}"));
    const client = new SentriqClient({ baseUrl: "http://localhost:4000", applicationId: "app", apiKey: key }, fetcher);
    await expect(client.evaluate({ ...input, userId: "" }, session)).rejects.toMatchObject({ code: "INVALID_REQUEST" });
    expect(fetcher.mock.calls.length).toBe(0);
    expect(() => new SentriqClient({ baseUrl: "http://localhost:4000", applicationId: "app", apiKey: key, timeoutMs: Infinity })).toThrow();
  });
  it("exposes scoped step-up methods and rejects malformed or unknown responses without retries", async () => {
    const fetcher = vi.fn<typeof fetch>(async () => new Response(JSON.stringify({ verified: true })));
    const client = new SentriqClient({ baseUrl: "http://localhost:4000", applicationId: "app", apiKey: key }, fetcher);
    expect(typeof (client as unknown as Record<string, unknown>).stepUpOptions).toBe("function");
    await expect(client.stepUpOptions({ challengeId: "550e8400-e29b-41d4-a716-446655440000", origin: "http://localhost:3001" }, session)).rejects.toMatchObject({ code: "INVALID_UPSTREAM_RESPONSE" });
    expect(fetcher.mock.calls.length).toBe(1);
    const headers = new Headers(fetcher.mock.calls[0]![1]?.headers);
    expect(headers.get("x-sentriq-api-key") === key).toBe(true); expect(headers.get("x-sentriq-session-token") === session).toBe(true);
    const invalid = new SentriqClient({ baseUrl: "http://localhost:4000", applicationId: "app", apiKey: key }, async () => new Response(JSON.stringify({ decision: "UNKNOWN", reasonCode: "synthetic_outcome", policyVersion: 1, correlationId: randomUUID() })));
    await expect(invalid.evaluate(input, session)).rejects.toMatchObject({ code: "INVALID_UPSTREAM_RESPONSE" });
  });
  it("bounds elapsed time even when a fetch implementation ignores cancellation, without retrying", async () => {
    const fetcher = vi.fn<typeof fetch>(() => new Promise(() => {}));
    const client = new SentriqClient({ baseUrl: "http://localhost:4000", applicationId: "app", apiKey: key, timeoutMs: 5 }, fetcher);
    await expect(client.evaluate(input, session)).rejects.toMatchObject({ code: "UPSTREAM_TIMEOUT" });
    expect(fetcher.mock.calls.length).toBe(1);
  }, 300);
  it("rejects invalid credential header values before allocating a request or deadline", async () => {
    const fetcher = vi.fn<typeof fetch>(async () => new Response("{}"));
    const client = new SentriqClient({ baseUrl: "http://localhost:4000", applicationId: "app", apiKey: key, timeoutMs: 5 }, fetcher);
    await expect(client.evaluate(input, "\n")).rejects.toMatchObject({ code: "INVALID_REQUEST" });
    expect(fetcher.mock.calls.length).toBe(0);
    expect(() => new SentriqClient({ baseUrl: "http://localhost:4000", applicationId: "app", apiKey: `${key}\n` })).toThrow();
  });
});
