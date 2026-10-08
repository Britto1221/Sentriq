import {
  ACTION_IDENTIFIERS,
  applicationInputSchema,
  protectedActionSchema,
  type ActionIdentifier,
  type ApplicationInput,
  type PolicyMode,
} from "@sentriq/shared";
import {
  INITIAL_DEMO_STATE,
  REQUIRED_ACTIONS,
  newSampleId,
  type ConsoleDemoState,
  type DemoApplication,
  type DemoEvent,
  type DemoSuggestion,
} from "./demo-data";

const STORAGE_KEY = "sentriq-console-development-sample-v1";

export interface LocalDemoAdapter {
  load(): ConsoleDemoState;
  save(state: ConsoleDemoState): void;
  reset(): ConsoleDemoState;
  createApplication(state: ConsoleDemoState, input: ApplicationInput): { state: ConsoleDemoState; application: DemoApplication };
  createApiKey(state: ConsoleDemoState, input: { applicationId: string; name: string; scopes: string[] }): ConsoleDemoState;
  revealApiKey(state: ConsoleDemoState, keyId: string): ConsoleDemoState;
  revokeApiKey(state: ConsoleDemoState, keyId: string): ConsoleDemoState;
  setProtectedAction(state: ConsoleDemoState, input: { actionId: ActionIdentifier; enabled: boolean; description: string }): ConsoleDemoState;
  savePolicy(state: ConsoleDemoState, input: { actionId: ActionIdentifier; mode: PolicyMode; enabled: boolean }): ConsoleDemoState;
  revokeSession(state: ConsoleDemoState, sessionId: string): ConsoleDemoState;
  createSuggestion(state: ConsoleDemoState, input: { actionId: ActionIdentifier; citedEventIds: string[] }): ConsoleDemoState;
  confirmSuggestion(state: ConsoleDemoState, suggestionId: string): ConsoleDemoState;
  dismissSuggestion(state: ConsoleDemoState, suggestionId: string): ConsoleDemoState;
  saveSettings(state: ConsoleDemoState, settings: ConsoleDemoState["settings"]): ConsoleDemoState;
}

function addEvent(
  state: ConsoleDemoState,
  event: Pick<DemoEvent, "type" | "outcome" | "summary" | "actionId" | "sessionId" | "subjectEmail" | "applicationId" | "applicationName" | "reasonCode">,
): ConsoleDemoState {
  const now = new Date().toISOString();
  const added: DemoEvent = {
    id: newSampleId("evt_sample"),
    tenantId: "tenant_sample",
    occurredAt: now,
    type: event.type,
    outcome: event.outcome,
    subjectId: "developer_sample",
    applicationId: event.applicationId,
    applicationName: event.applicationName,
    subjectEmail: event.subjectEmail,
    sessionId: event.sessionId,
    actionId: event.actionId,
    policyVersion: 4,
    riskScore: 22,
    signalCodes: ["local_demo_change"],
    correlationId: newSampleId("corr_sample"),
    reasonCode: event.reasonCode,
    simulated: true,
    summary: event.summary,
  };
  return { ...state, events: [added, ...state.events] };
}

function getApp(state: ConsoleDemoState, applicationId: string): DemoApplication {
  return state.applications.find((application) => application.id === applicationId) ?? state.applications[0];
}

export function createLocalDemoAdapter(): LocalDemoAdapter {
  return {
    load() {
      if (typeof window === "undefined") return INITIAL_DEMO_STATE;
      try {
        const saved = window.localStorage.getItem(STORAGE_KEY);
        if (!saved) return INITIAL_DEMO_STATE;
        const parsed: unknown = JSON.parse(saved);
        if (
          typeof parsed === "object" && parsed !== null &&
          "applications" in parsed && Array.isArray(parsed.applications) &&
          "events" in parsed && Array.isArray(parsed.events) &&
          "sessions" in parsed && Array.isArray(parsed.sessions) &&
          "policies" in parsed && Array.isArray(parsed.policies) &&
          "apiKeys" in parsed && Array.isArray(parsed.apiKeys) &&
          "suggestions" in parsed && Array.isArray(parsed.suggestions)
        ) return parsed as ConsoleDemoState;
      } catch {
        return INITIAL_DEMO_STATE;
      }
      return INITIAL_DEMO_STATE;
    },
    save(state) {
      if (typeof window === "undefined") return;
      try {
        window.localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
      } catch {
        // The application remains usable when local browser storage is unavailable.
      }
    },
    reset() {
      if (typeof window !== "undefined") {
        try {
          window.localStorage.removeItem(STORAGE_KEY);
        } catch {
          // Reset still returns the in-memory fixture state.
        }
      }
      return INITIAL_DEMO_STATE;
    },
    createApplication(state, input) {
      const parsed = applicationInputSchema.parse(input);
      const application: DemoApplication = {
        id: newSampleId("app_sample"),
        name: parsed.name,
        origins: parsed.origins,
        createdAt: new Date().toISOString(),
        status: "Setup",
      };
      return { application, state: { ...state, applications: [application, ...state.applications] } };
    },
    createApiKey(state, input) {
      const application = getApp(state, input.applicationId);
      const key = {
        id: newSampleId("key_sample"),
        applicationId: application.id,
        name: input.name.trim(),
        scopes: [...input.scopes],
        createdAt: new Date().toISOString(),
        lastUsedAt: null,
        status: "active" as const,
        sampleShown: false,
      };
      return { ...state, apiKeys: [key, ...state.apiKeys] };
    },
    revealApiKey(state, keyId) {
      return {
        ...state,
        apiKeys: state.apiKeys.map((key) => key.id === keyId ? { ...key, sampleShown: true } : key),
      };
    },
    revokeApiKey(state, keyId) {
      const key = state.apiKeys.find((candidate) => candidate.id === keyId);
      if (!key || key.status === "revoked") return state;
      return {
        ...state,
        apiKeys: state.apiKeys.map((candidate) => candidate.id === keyId ? { ...candidate, status: "revoked" as const } : candidate),
      };
    },
    setProtectedAction(state, input) {
      const parsed = protectedActionSchema.parse({
        actionId: input.actionId,
        enabled: input.enabled,
        description: input.description,
        mode: state.policies.find((policy) => policy.actionId === input.actionId)?.mode ?? "CONTEXTUAL_RISK",
      });
      return {
        ...state,
        protectedActions: {
          ...state.protectedActions,
          [parsed.actionId]: { enabled: parsed.enabled, description: parsed.description ?? "" },
        },
      };
    },
    savePolicy(state, input) {
      const parsed = protectedActionSchema.parse({ actionId: input.actionId, mode: input.mode, enabled: input.enabled });
      const existing = state.policies.find((policy) => policy.actionId === parsed.actionId);
      const policy = {
        id: existing?.id ?? `policy_${parsed.actionId.replaceAll(".", "_")}`,
        applicationId: existing?.applicationId ?? state.applications[0]?.id ?? "app_northstar",
        actionId: parsed.actionId,
        mode: parsed.mode,
        version: (existing?.version ?? 0) + 1,
        enabled: parsed.enabled,
        updatedAt: new Date().toISOString(),
      };
      const policies = [policy, ...state.policies.filter((item) => item.actionId !== policy.actionId)];
      const app = getApp(state, policy.applicationId);
      return addEvent({ ...state, policies }, {
        type: "POLICY_UPDATED",
        outcome: "SUCCESS",
        actionId: policy.actionId,
        summary: `Sample rule configuration for ${policy.actionId} changed to ${policy.mode}. Past event decisions were not recalculated.`,
        applicationId: app.id,
        applicationName: app.name,
        subjectEmail: "developer@sentriq.test",
        reasonCode: "sample_policy_changed",
      });
    },
    revokeSession(state, sessionId) {
      const session = state.sessions.find((candidate) => candidate.id === sessionId);
      if (!session || session.status !== "active") return state;
      const app = getApp(state, session.applicationId);
      const next = {
        ...state,
        sessions: state.sessions.map((candidate) => candidate.id === sessionId ? { ...candidate, status: "revoked" as const } : candidate),
      };
      return addEvent(next, {
        type: "AUTH_SESSION_REVOKED",
        outcome: "REVOKED",
        sessionId,
        summary: `Sample session ${sessionId} was marked revoked in this browser preview.`,
        applicationId: app.id,
        applicationName: app.name,
        subjectEmail: session.email,
        reasonCode: "sample_session_revoked",
      });
    },
    createSuggestion(state, input) {
      const citedEventIds = input.citedEventIds.filter((id) => state.events.some((event) => event.id === id));
      const suggestion: DemoSuggestion = {
        id: newSampleId("suggestion_sample"),
        applicationId: state.events.find((event) => citedEventIds.includes(event.id))?.applicationId ?? state.applications[0]?.id ?? "app_northstar",
        actionId: input.actionId,
        title: `Review stronger verification for ${input.actionId}`,
        rationale: "This draft is based on the selected sample events. It does not change past outcomes or make policy decisions.",
        citedEventIds,
        status: "draft",
        proposedMode: "STEP_UP",
      };
      return { ...state, suggestions: [suggestion, ...state.suggestions] };
    },
    confirmSuggestion(state, suggestionId) {
      const suggestion = state.suggestions.find((item) => item.id === suggestionId);
      if (!suggestion || suggestion.status !== "draft") return state;
      const next = this.savePolicy(state, {
        actionId: suggestion.actionId,
        mode: suggestion.proposedMode,
        enabled: true,
      });
      return {
        ...next,
        suggestions: next.suggestions.map((item) => item.id === suggestionId ? { ...item, status: "confirmed" as const } : item),
      };
    },
    dismissSuggestion(state, suggestionId) {
      return {
        ...state,
        suggestions: state.suggestions.map((item) => item.id === suggestionId ? { ...item, status: "dismissed" as const } : item),
      };
    },
    saveSettings(state, settings) {
      return { ...state, settings: { ...settings } };
    },
  };
}

export const demoActionIds: readonly ActionIdentifier[] = ACTION_IDENTIFIERS;
export const supportedActionIds: readonly ActionIdentifier[] = REQUIRED_ACTIONS;
