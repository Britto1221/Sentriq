import { describe, expect, expectTypeOf, it } from "vitest";
import type { ActionIdentifier, EvaluationDecision, SecurityEvent } from "@sentriq/shared";
import type {
  EvaluateProtectedActionInput,
  EvaluationResult,
  SentriqClient,
  SentriqClientOptions,
} from "./index";

describe("initial SDK integration contracts", () => {
  it("requires an application, user, session and registered action", () => {
    expectTypeOf<EvaluateProtectedActionInput>().toEqualTypeOf<{
      applicationId: string;
      userId: string;
      sessionId: string;
      actionId: ActionIdentifier;
      resourceId: string;
      stepUpGrantId?: string;
    }>();
    expectTypeOf<EvaluationResult["decision"]>().toEqualTypeOf<EvaluationDecision>();
    expectTypeOf<SentriqClient["evaluate"]>().returns.toEqualTypeOf<Promise<EvaluationResult>>();
    expectTypeOf<SentriqClient["listEvents"]>().returns.toEqualTypeOf<Promise<SecurityEvent[]>>();
    expectTypeOf<SentriqClientOptions>().toEqualTypeOf<{
      baseUrl: string;
      applicationId: string;
      apiKey: string;
      timeoutMs?: number;
    }>();
  });

  it("does not admit an unregistered action identifier", () => {
    const invalidInput: EvaluateProtectedActionInput = {
      applicationId: "northstar",
      userId: "alice",
      sessionId: "sample-session",
      // @ts-expect-error Future SDK callers must use a registered protected action.
      actionId: "user.transfer",
      resourceId: "profile:alice",
    };
    expect(invalidInput.actionId).toBe("user.transfer");
  });
});
