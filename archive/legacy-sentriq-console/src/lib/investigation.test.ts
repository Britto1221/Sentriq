import { describe, expect, it } from "vitest";
import { INITIAL_DEMO_STATE } from "./demo-data";
import { createLocalDemoAdapter } from "./demo-adapter";
import { createMockInvestigationAnswer } from "./investigation";

describe("sample investigation adapter", () => {
  it("limits facts and citations to the selected stored event IDs", () => {
    const selected = INITIAL_DEMO_STATE.events.filter((event) => event.sessionId === "ses_alice_review");
    const answer = createMockInvestigationAnswer(selected, "Why was verification required?");
    const selectedIds = new Set(selected.map((event) => event.id));

    expect(answer.recordedFacts.length).toBeGreaterThan(0);
    expect(answer.recordedFacts.every((fact) => selectedIds.has(fact.eventId))).toBe(true);
    expect(answer.citedEventIds.every((eventId) => selectedIds.has(eventId))).toBe(true);
    expect(new Set(answer.citedEventIds)).toEqual(new Set(answer.recordedFacts.map((fact) => fact.eventId)));
  });

  it("keeps identity questions in the inference lane without claiming to identify a person", () => {
    const selected = INITIAL_DEMO_STATE.events.filter((event) => event.sessionId === "ses_alice_review");
    const answer = createMockInvestigationAnswer(selected, "Who was using this device?");

    expect(answer.inferences[0]).toContain("do not establish who");
    expect(answer.recordedFacts.every((fact) => fact.eventId.startsWith("evt_"))).toBe(true);
    expect(answer.missingEvidence.length).toBeGreaterThan(0);
    expect(answer.nextSteps.length).toBeGreaterThan(0);
  });

  it("simulates revocation for one session while leaving other sample sessions intact", () => {
    const adapter = createLocalDemoAdapter();
    const next = adapter.revokeSession(INITIAL_DEMO_STATE, "ses_alice_review");

    expect(next.sessions.find((session) => session.id === "ses_alice_review")?.status).toBe("revoked");
    expect(next.sessions.find((session) => session.id === "ses_alice_current")?.status).toBe("active");
    expect(next.events[0]?.reasonCode).toBe("sample_session_revoked");
    expect(next.events[0]?.simulated).toBe(true);
  });

  it("keeps a policy suggestion in draft until a developer confirms it", () => {
    const adapter = createLocalDemoAdapter();
    const originalOutcome = INITIAL_DEMO_STATE.events.find((event) => event.id === "evt_7815")?.outcome;
    const previousMode = INITIAL_DEMO_STATE.policies.find((policy) => policy.actionId === "admin.invite")?.mode;
    const draftState = adapter.createSuggestion(INITIAL_DEMO_STATE, {
      actionId: "admin.invite",
      citedEventIds: ["evt_7814", "evt_missing"],
    });

    expect(draftState.suggestions[0]?.status).toBe("draft");
    expect(draftState.suggestions[0]?.citedEventIds).toEqual(["evt_7814"]);
    expect(draftState.policies.find((policy) => policy.actionId === "admin.invite")?.mode).toBe(previousMode);

    const confirmed = adapter.confirmSuggestion(draftState, draftState.suggestions[0]!.id);
    expect(confirmed.suggestions[0]?.status).toBe("confirmed");
    expect(confirmed.policies.find((policy) => policy.actionId === "admin.invite")?.mode).toBe("STEP_UP");
    expect(confirmed.events.find((event) => event.id === "evt_7815")?.outcome).toBe(originalOutcome);
  });
});
