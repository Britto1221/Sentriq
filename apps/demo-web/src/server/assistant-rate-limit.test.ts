import { describe, expect, it } from "vitest";
import { assistantClientKey, AssistantRateLimiter } from "./assistant-rate-limit";

describe("Sentriq Assistant rate and cost limits", () => {
  it("limits one client to eight requests per minute", () => {
    const limiter = new AssistantRateLimiter();
    for (let i = 0; i < 8; i++) expect(limiter.acquire("client", false, 1000).ok).toBe(true);
    expect(limiter.acquire("client", false, 1000)).toMatchObject({ ok: false, reason: "rate" });
    expect(limiter.acquire("client", false, 61_000).ok).toBe(true);
  });

  it("caps live provider requests per hour and limits concurrent work", () => {
    const limiter = new AssistantRateLimiter();
    const first = limiter.acquire("one", true, 1000);
    const second = limiter.acquire("two", true, 1000);
    expect(first.ok).toBe(true);
    expect(second.ok).toBe(true);
    expect(limiter.acquire("three", true, 1000)).toMatchObject({ ok: false, reason: "busy" });
    if (first.ok) first.release();
    if (second.ok) second.release();
    for (let i = 2; i < 20; i++) {
      const next = limiter.acquire(`client-${i}`, true, 1000);
      expect(next.ok).toBe(true);
      if (next.ok) next.release();
    }
    expect(limiter.acquire("budget-exhausted", true, 1000)).toMatchObject({ ok: false, reason: "budget" });
  });

  it("uses only the proxy-added final forwarded address and never logs it", () => {
    const headers = new Headers({ "x-forwarded-for": "spoofed, 203.0.113.8" });
    expect(assistantClientKey(headers)).toBe("203.0.113.8");
    expect(assistantClientKey(new Headers())).toBe("shared-unknown-client");
  });
});
