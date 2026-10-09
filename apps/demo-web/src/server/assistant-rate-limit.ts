type Bucket = { startedAt: number; count: number };
export type AssistantLimitReason = "rate" | "budget" | "busy";

const perMinute = 8;
const providerRequestsPerHour = 20;
const maximumConcurrentRequests = 2;

export class AssistantRateLimiter {
  private readonly clients = new Map<string, Bucket>();
  private providerBucket: Bucket | null = null;
  private active = 0;

  acquire(clientKey: string, providerEnabled: boolean, now = Date.now()): { ok: true; release(): void } | { ok: false; reason: AssistantLimitReason } {
    const client = this.clients.get(clientKey);
    if (!client || now - client.startedAt >= 60_000) this.clients.set(clientKey, { startedAt: now, count: 0 });
    const current = this.clients.get(clientKey)!;
    if (current.count >= perMinute) return { ok: false, reason: "rate" };
    if (providerEnabled) {
      if (!this.providerBucket || now - this.providerBucket.startedAt >= 3_600_000) this.providerBucket = { startedAt: now, count: 0 };
      if (this.providerBucket.count >= providerRequestsPerHour) return { ok: false, reason: "budget" };
      if (this.active >= maximumConcurrentRequests) return { ok: false, reason: "busy" };
      this.providerBucket.count += 1;
      this.active += 1;
    }
    current.count += 1;

    // Keep attacker-controlled address keys from growing this in-memory map without bound.
    if (this.clients.size > 2_000) {
      for (const [key, bucket] of this.clients) if (now - bucket.startedAt >= 60_000) this.clients.delete(key);
      if (this.clients.size > 2_000) this.clients.delete(this.clients.keys().next().value as string);
    }

    let released = false;
    return {
      ok: true,
      release: () => {
        if (released) return;
        released = true;
        if (providerEnabled) this.active = Math.max(0, this.active - 1);
      },
    };
  }
}

export function assistantClientKey(headers: Headers): string {
  // Railway's proxy appends the connecting client as the final entry; never trust an arbitrary prefix.
  const forwarded = headers.get("x-forwarded-for")?.split(",").map((part) => part.trim()).at(-1);
  return forwarded && /^[0-9a-f:.]{3,64}$/i.test(forwarded) ? forwarded : "shared-unknown-client";
}
