import { describe, expect, it } from "vitest";
import {
  ACTION_IDENTIFIERS,
  applicationInputSchema,
  deviceLinkRequestSummarySchema,
  evaluationDecisionSchema,
  protectedActionSchema,
  registrationResponseSchema,
  securityEventSchema,
  sessionSummarySchema,
  stepUpChallengeSchema,
} from "./index";

describe("shared Sentriq contracts", () => {
  it("validates Device Link inbox summaries without permitting enrollment secrets", () => {
    const request = {
      requestId: "d4688a50-a1c4-47bd-a073-82fb08646a46",
      comparisonCode: "ABC234",
      createdAt: "2026-10-08T10:00:00.000Z",
      expiresAt: "2026-10-08T10:10:00.000Z",
      status: "PENDING",
    };
    expect(deviceLinkRequestSummarySchema.safeParse(request).success).toBe(true);
    expect(deviceLinkRequestSummarySchema.safeParse({ ...request, transaction: "secret" }).success).toBe(false);
  });

  it("accepts optional WebAuthn 14 registration response fields and rejects unknown fields", () => {
    const response = {
      id: "Y3JlZGVudGlhbA",
      rawId: "Y3JlZGVudGlhbA",
      type: "public-key",
      response: {
        clientDataJSON: "Y2xpZW50LWRhdGE",
        attestationObject: "YXR0ZXN0YXRpb24",
        authenticatorData: "YXV0aGVudGljYXRvci1kYXRh",
        transports: ["internal"],
        publicKeyAlgorithm: -7,
        publicKey: "cHVibGljLWtleQ",
      },
      clientExtensionResults: {},
      authenticatorAttachment: "platform",
    };
    expect(registrationResponseSchema.safeParse(response).success).toBe(true);
    expect(registrationResponseSchema.safeParse({ ...response, response: { ...response.response, unknownField: "value" } }).success).toBe(false);
  });

  it("exports only the registered protected action identifiers", () => {
    expect(ACTION_IDENTIFIERS).toEqual([
      "account.delete",
      "data.export",
      "admin.invite",
      "email.change",
      "session.revoke",
      "passkey.add",
      "passkey.remove",
      "security.settings.change",
    ]);
    expect(protectedActionSchema.safeParse({ actionId: "data.export", mode: "STEP_UP" }).success).toBe(true);
    expect(protectedActionSchema.safeParse({ actionId: "user.transfer", mode: "STEP_UP" }).success).toBe(false);
  });

  it("accepts HTTPS origins and localhost HTTP origins only", () => {
    const valid = applicationInputSchema.safeParse({
      name: "Northstar Workspace",
      origins: ["https://northstar.example", "http://localhost:3001"],
    });
    expect(valid.success).toBe(true);

    for (const input of [
      { name: " ", origins: ["https://northstar.example"] },
      { name: "Northstar", origins: [] },
      { name: "Northstar", origins: ["http://example.com"] },
      { name: "Northstar", origins: ["https://northstar.example/path"] },
    ]) {
      expect(applicationInputSchema.safeParse(input).success).toBe(false);
    }
  });

  it("limits policy decisions to deterministic engine outcomes", () => {
    expect(evaluationDecisionSchema.parse("ALLOW")).toBe("ALLOW");
    expect(evaluationDecisionSchema.parse("STEP_UP")).toBe("STEP_UP");
    expect(evaluationDecisionSchema.parse("DENY")).toBe("DENY");
    expect(evaluationDecisionSchema.safeParse("CHALLENGE").success).toBe(false);
  });

  it("keeps security events bounded to safe, typed audit data", () => {
    const event = {
      id: "evt-01",
      tenantId: "tenant-sentriq",
      applicationId: "northstar",
      occurredAt: "2026-10-08T10:00:00.000Z",
      type: "AUTH_STEP_UP_REQUIRED",
      outcome: "REQUIRED",
      actionId: "data.export",
      policyVersion: 3,
      correlationId: "req-123",
      reasonCode: "sensitive_action_requires_fresh_verification",
    };
    expect(securityEventSchema.safeParse(event).success).toBe(true);
    expect(securityEventSchema.safeParse({ ...event, type: "AUTH_DEVICE_LINK_APPROVED" }).success).toBe(true);
    expect(securityEventSchema.safeParse({ ...event, type: "AUTH_EMAIL_VERIFICATION_COMPLETED" }).success).toBe(true);
    expect(securityEventSchema.safeParse({ ...event, recoveryCode: "secret" }).success).toBe(false);
  });

  it("requires session summaries to expose no authentication material", () => {
    const session = {
      id: "session-01",
      userId: "alice",
      applicationId: "northstar",
      createdAt: "2026-10-08T10:00:00.000Z",
      expiresAt: "2026-10-09T10:00:00.000Z",
      status: "active",
    };
    expect(sessionSummarySchema.safeParse(session).success).toBe(true);
    expect(sessionSummarySchema.safeParse({ ...session, token: "secret" }).success).toBe(false);
  });

  it("binds step-up challenges to one user, session, action and resource", () => {
    expect(stepUpChallengeSchema.safeParse({
      id: "challenge-01",
      tenantId: "tenant-sentriq",
      applicationId: "northstar",
      userId: "alice",
      sessionId: "session-01",
      actionId: "data.export",
      resourceId: "profile:alice",
      expiresAt: "2026-10-08T10:05:00.000Z",
      status: "pending",
    }).success).toBe(true);
    expect(stepUpChallengeSchema.safeParse({
      id: "challenge-01",
      tenantId: "tenant-sentriq",
      applicationId: "northstar",
      userId: "alice",
      sessionId: "session-01",
      actionId: "data.export",
      expiresAt: "2026-10-08T10:05:00.000Z",
      status: "pending",
    }).success).toBe(false);
  });
});
