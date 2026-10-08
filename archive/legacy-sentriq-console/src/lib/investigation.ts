import { investigationAnswerSchema, type InvestigationAnswer } from "@sentriq/shared";
import type { DemoEvent } from "./demo-data";

export function createMockInvestigationAnswer(events: readonly DemoEvent[], question: string): InvestigationAnswer {
  const selected = events.slice(0, 8);
  const recordedFacts = selected.slice(0, 4).map((event) => ({
    eventId: event.id,
    text: `${event.type.replaceAll("_", " ")} was recorded with outcome ${event.outcome}${event.actionId ? ` for ${event.actionId}` : ""}${event.riskScore !== undefined ? ` and sample risk score ${event.riskScore}/100` : ""}.`,
  }));
  const normalizedQuestion = question.toLowerCase();
  const inference = normalizedQuestion.match(/who|person|identity|attacker|user/)
    ? "The selected records do not establish who used this session. A new-device signal is a review cue, not a person identifier."
    : normalizedQuestion.match(/why|decision|export|policy|challenge/)
      ? "The selected records are consistent with a fresh-verification requirement after a new-device signal. This is an inference from the sample event sequence, not an additional recorded decision."
      : "The selected event sequence shows a sample signal followed by a policy evaluation. The relationship is suggestive and does not identify a person or prove intent.";

  return investigationAnswerSchema.parse({
    recordedFacts,
    inferences: [inference],
    missingEvidence: [
      "No independently verified identity or device ownership is present in these sample records.",
      "The sample data does not include trusted backend logs or a live network assessment.",
    ],
    nextSteps: [
      "Compare the cited sample events with the protected service's own trusted logs.",
      "Confirm session ownership through your established support process before taking account action.",
    ],
    citedEventIds: recordedFacts.map((fact) => fact.eventId),
  });
}
