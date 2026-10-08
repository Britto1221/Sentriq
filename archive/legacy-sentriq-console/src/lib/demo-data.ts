import {
  ACTION_IDENTIFIERS,
  type ActionIdentifier,
  type PolicyMode,
  type PolicySuggestion,
  type SecurityEvent,
  type SessionSummary,
} from "@sentriq/shared";

export const REQUIRED_ACTIONS = [
  "account.delete",
  "data.export",
  "admin.invite",
  "email.change",
  "password.change",
  "session.revoke",
] as const satisfies readonly ActionIdentifier[];

export const ACTION_LABELS: Record<ActionIdentifier, string> = {
  "account.delete": "Delete account",
  "data.export": "Export data",
  "admin.invite": "Invite administrator",
  "email.change": "Change email",
  "password.change": "Change password",
  "session.revoke": "Revoke session",
  "passkey.add": "Add passkey",
  "passkey.remove": "Remove passkey",
  "security.settings.change": "Change security settings",
};

export interface DemoApplication {
  id: string;
  name: string;
  origins: string[];
  createdAt: string;
  status: "Ready" | "Setup";
}

export interface DemoApiKey {
  id: string;
  applicationId: string;
  name: string;
  scopes: string[];
  createdAt: string;
  lastUsedAt: string | null;
  status: "active" | "revoked";
  sampleShown: boolean;
}

export interface DemoSession extends SessionSummary {
  email: string;
  applicationName: string;
  browser: string;
  network: string;
  riskScore: number;
  signals: string[];
}

export interface DemoEvent extends SecurityEvent {
  applicationName: string;
  subjectEmail: string;
  summary: string;
}

export interface DemoPolicy {
  id: string;
  applicationId: string;
  actionId: ActionIdentifier;
  mode: PolicyMode;
  version: number;
  enabled: boolean;
  updatedAt: string;
}

export interface DemoSuggestion extends Omit<PolicySuggestion, "status"> {
  status: "draft" | "confirmed" | "dismissed";
  proposedMode: PolicyMode;
}

export interface DemoSettings {
  organizationName: string;
  notifyPolicyChanges: boolean;
  requireSampleConfirmation: boolean;
}

export interface ConsoleDemoState {
  applications: DemoApplication[];
  apiKeys: DemoApiKey[];
  sessions: DemoSession[];
  events: DemoEvent[];
  policies: DemoPolicy[];
  protectedActions: Record<ActionIdentifier, { enabled: boolean; description: string }>;
  suggestions: DemoSuggestion[];
  settings: DemoSettings;
}

const createdAt = "2026-10-08T09:20:00.000Z";

export const INITIAL_DEMO_STATE: ConsoleDemoState = {
  applications: [
    {
      id: "app_northstar",
      name: "Northstar Workspace",
      origins: ["http://localhost:3001"],
      createdAt: "2026-10-02T11:30:00.000Z",
      status: "Ready",
    },
    {
      id: "app_harbor",
      name: "Harbor Admin",
      origins: ["https://admin.harbor-demo.test"],
      createdAt: "2026-10-04T15:10:00.000Z",
      status: "Setup",
    },
  ],
  apiKeys: [
    {
      id: "key_northstar_sample",
      applicationId: "app_northstar",
      name: "Northstar development",
      scopes: ["events:read", "evaluations:write"],
      createdAt: "2026-10-02T11:34:00.000Z",
      lastUsedAt: "2026-10-08T13:42:00.000Z",
      status: "active",
      sampleShown: false,
    },
  ],
  sessions: [
    {
      id: "ses_alice_current",
      userId: "usr_alice_sample",
      applicationId: "app_northstar",
      createdAt: "2026-10-08T13:11:00.000Z",
      lastSeenAt: "2026-10-08T13:42:00.000Z",
      expiresAt: "2026-10-09T13:11:00.000Z",
      status: "active",
      current: true,
      deviceLabel: "MacBook Pro · Chrome",
      email: "alice@northstar.test",
      applicationName: "Northstar Workspace",
      browser: "Chrome 128 · macOS",
      network: "Sample network · Bengaluru, IN",
      riskScore: 12,
      signals: ["Known device", "Recent activity"],
    },
    {
      id: "ses_alice_review",
      userId: "usr_alice_sample",
      applicationId: "app_northstar",
      createdAt: "2026-10-08T12:54:00.000Z",
      lastSeenAt: "2026-10-08T13:28:00.000Z",
      expiresAt: "2026-10-09T12:54:00.000Z",
      status: "active",
      current: false,
      deviceLabel: "Windows device · Edge",
      email: "alice@northstar.test",
      applicationName: "Northstar Workspace",
      browser: "Edge 127 · Windows",
      network: "Sample network · Singapore, SG",
      riskScore: 68,
      signals: ["New device", "Location differs from recent sample"],
    },
    {
      id: "ses_bob_current",
      userId: "usr_bob_sample",
      applicationId: "app_northstar",
      createdAt: "2026-10-08T10:05:00.000Z",
      lastSeenAt: "2026-10-08T13:06:00.000Z",
      expiresAt: "2026-10-09T10:05:00.000Z",
      status: "active",
      current: false,
      deviceLabel: "ThinkPad · Firefox",
      email: "bob@northstar.test",
      applicationName: "Northstar Workspace",
      browser: "Firefox 130 · Linux",
      network: "Sample network · Pune, IN",
      riskScore: 19,
      signals: ["Known device"],
    },
    {
      id: "ses_harbor_expired",
      userId: "usr_demo_admin",
      applicationId: "app_harbor",
      createdAt: "2026-10-06T08:15:00.000Z",
      lastSeenAt: "2026-10-06T10:22:00.000Z",
      expiresAt: "2026-10-07T08:15:00.000Z",
      status: "expired",
      current: false,
      deviceLabel: "Sample administrator · Safari",
      email: "admin@harbor-demo.test",
      applicationName: "Harbor Admin",
      browser: "Safari 18 · macOS",
      network: "Sample network · Chennai, IN",
      riskScore: 8,
      signals: ["Expired by sample schedule"],
    },
  ],
  events: [
    {
      id: "evt_7814",
      tenantId: "tenant_sample",
      applicationId: "app_northstar",
      applicationName: "Northstar Workspace",
      occurredAt: "2026-10-08T13:29:00.000Z",
      type: "DEMO_SUSPICIOUS_SESSION_SIMULATED",
      outcome: "INFO",
      subjectId: "usr_alice_sample",
      subjectEmail: "alice@northstar.test",
      sessionId: "ses_alice_review",
      riskScore: 68,
      signalCodes: ["new_device", "unusual_request_volume"],
      correlationId: "corr_sample_7814",
      reasonCode: "sample_signal_recorded",
      simulated: true,
      summary: "New device signal recorded for a sample session.",
    },
    {
      id: "evt_7815",
      tenantId: "tenant_sample",
      applicationId: "app_northstar",
      applicationName: "Northstar Workspace",
      occurredAt: "2026-10-08T13:29:04.000Z",
      type: "ACTION_EVALUATED",
      outcome: "REQUIRED",
      subjectId: "usr_alice_sample",
      subjectEmail: "alice@northstar.test",
      sessionId: "ses_alice_review",
      actionId: "data.export",
      policyVersion: 3,
      riskScore: 68,
      signalCodes: ["new_device", "unusual_request_volume"],
      correlationId: "corr_sample_7815",
      reasonCode: "step_up_required",
      simulated: true,
      summary: "Sample policy required fresh verification before data export.",
    },
    {
      id: "evt_7816",
      tenantId: "tenant_sample",
      applicationId: "app_northstar",
      applicationName: "Northstar Workspace",
      occurredAt: "2026-10-08T13:31:18.000Z",
      type: "AUTH_STEP_UP_FAILED",
      outcome: "FAILURE",
      subjectId: "usr_alice_sample",
      subjectEmail: "alice@northstar.test",
      sessionId: "ses_alice_review",
      actionId: "data.export",
      policyVersion: 3,
      riskScore: 68,
      signalCodes: ["verification_not_completed"],
      correlationId: "corr_sample_7816",
      reasonCode: "sample_verification_not_completed",
      simulated: true,
      summary: "Sample verification was not completed; no export was authorized.",
    },
    {
      id: "evt_7730",
      tenantId: "tenant_sample",
      applicationId: "app_northstar",
      applicationName: "Northstar Workspace",
      occurredAt: "2026-10-08T13:11:02.000Z",
      type: "AUTH_LOGIN_SUCCEEDED",
      outcome: "SUCCESS",
      subjectId: "usr_alice_sample",
      subjectEmail: "alice@northstar.test",
      sessionId: "ses_alice_current",
      riskScore: 12,
      signalCodes: ["known_device"],
      correlationId: "corr_sample_7730",
      reasonCode: "sample_login_succeeded",
      simulated: true,
      summary: "Sample session started on a known device.",
    },
    {
      id: "evt_7719",
      tenantId: "tenant_sample",
      applicationId: "app_northstar",
      applicationName: "Northstar Workspace",
      occurredAt: "2026-10-08T12:48:00.000Z",
      type: "ACTION_EVALUATED",
      outcome: "SUCCESS",
      subjectId: "usr_alice_sample",
      subjectEmail: "alice@northstar.test",
      sessionId: "ses_alice_current",
      actionId: "email.change",
      policyVersion: 3,
      riskScore: 12,
      signalCodes: ["known_device"],
      correlationId: "corr_sample_7719",
      reasonCode: "sample_action_allowed",
      simulated: true,
      summary: "Sample email-change evaluation allowed under the stored rule.",
    },
    {
      id: "evt_7702",
      tenantId: "tenant_sample",
      applicationId: "app_harbor",
      applicationName: "Harbor Admin",
      occurredAt: "2026-10-06T10:20:00.000Z",
      type: "ACTION_EVALUATED",
      outcome: "DENIED",
      subjectId: "usr_demo_admin",
      subjectEmail: "admin@harbor-demo.test",
      sessionId: "ses_harbor_expired",
      actionId: "admin.invite",
      policyVersion: 2,
      riskScore: 82,
      signalCodes: ["aged_session"],
      correlationId: "corr_sample_7702",
      reasonCode: "sample_session_expired",
      simulated: true,
      summary: "Sample invite evaluation denied for an expired session.",
    },
  ],
  policies: REQUIRED_ACTIONS.map((actionId) => ({
    id: `policy_${actionId.replaceAll(".", "_")}`,
    applicationId: "app_northstar",
    actionId,
    mode: actionId === "data.export" || actionId === "account.delete" ? "STEP_UP" : "CONTEXTUAL_RISK",
    version: 3,
    enabled: true,
    updatedAt: createdAt,
  })),
  protectedActions: Object.fromEntries(
    REQUIRED_ACTIONS.map((actionId) => [
      actionId,
      {
        enabled: true,
        description: `${ACTION_LABELS[actionId]} in the Northstar sample application.`,
      },
    ]),
  ) as ConsoleDemoState["protectedActions"],
  suggestions: [
    {
      id: "suggestion_sample_1",
      applicationId: "app_northstar",
      actionId: "data.export",
      title: "Ask for fresh verification on a new device",
      rationale: "The selected sample events show a new-device signal followed by an incomplete verification flow for data export.",
      citedEventIds: ["evt_7814", "evt_7815", "evt_7816"],
      status: "draft",
      proposedMode: "STEP_UP",
    },
  ],
  settings: {
    organizationName: "Sentriq sample workspace",
    notifyPolicyChanges: true,
    requireSampleConfirmation: true,
  },
};

export function newSampleId(prefix: string): string {
  const suffix = Math.random().toString(16).slice(2, 8);
  return `${prefix}_${suffix || "000001"}`;
}
