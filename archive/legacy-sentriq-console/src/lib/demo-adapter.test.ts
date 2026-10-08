import { describe, expect, it } from "vitest";
import { INITIAL_DEMO_STATE } from "./demo-data";
import { createLocalDemoAdapter } from "./demo-adapter";

describe("local demo adapter", () => {
  it("adds a validated sample application without creating credentials", () => {
    const adapter = createLocalDemoAdapter();
    const result = adapter.createApplication(INITIAL_DEMO_STATE, {
      name: "Example integration",
      origins: ["http://localhost:4000"],
    });

    expect(result.application.name).toBe("Example integration");
    expect(result.application.origins).toEqual(["http://localhost:4000"]);
    expect(result.state.applications).toContainEqual(result.application);
    expect("apiKey" in result.application).toBe(false);
  });

  it("shows and revokes only a fake API-key display record", () => {
    const adapter = createLocalDemoAdapter();
    const created = adapter.createApiKey(INITIAL_DEMO_STATE, {
      applicationId: "app_northstar",
      name: "Read events sample",
      scopes: ["events:read"],
    });
    const key = created.apiKeys[0]!;
    const revealed = adapter.revealApiKey(created, key.id);
    const revoked = adapter.revokeApiKey(revealed, key.id);

    expect(key.status).toBe("active");
    expect(key.sampleShown).toBe(false);
    expect("value" in key).toBe(false);
    expect(revealed.apiKeys[0]?.sampleShown).toBe(true);
    expect(revoked.apiKeys[0]?.status).toBe("revoked");
    expect(revoked.events).toEqual(INITIAL_DEMO_STATE.events);
  });

  it("saves a policy edit as a new local rule version without rewriting prior outcomes", () => {
    const adapter = createLocalDemoAdapter();
    const previousOutcome = INITIAL_DEMO_STATE.events.find((event) => event.id === "evt_7815")?.outcome;
    const next = adapter.savePolicy(INITIAL_DEMO_STATE, { actionId: "admin.invite", mode: "DENY", enabled: true });

    expect(next.policies.find((policy) => policy.actionId === "admin.invite")?.mode).toBe("DENY");
    expect(next.policies.find((policy) => policy.actionId === "admin.invite")?.version).toBe(4);
    expect(next.events.find((event) => event.id === "evt_7815")?.outcome).toBe(previousOutcome);
    expect(next.events[0]?.reasonCode).toBe("sample_policy_changed");
  });
});
