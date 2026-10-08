import type { EvaluationDecision, PolicyMode } from "@sentriq/shared";

/** A policy's persisted mode is the complete deterministic decision. Unknown values fail closed. */
export function decide(mode: PolicyMode): { decision: EvaluationDecision; reasonCode: string } {
  if (mode === "DENY") return { decision: "DENY", reasonCode: "policy_denied" };
  if (mode === "STEP_UP") return { decision: "STEP_UP", reasonCode: "policy_step_up" };
  if (mode === "ALLOW") return { decision: "ALLOW", reasonCode: "policy_allowed" };
  return { decision: "DENY", reasonCode: "unknown_policy_outcome" };
}
