import type { PasskeySummary, ReclaimRegistrationOptionsResult, ReclaimRegistrationVerifyResult, ReclaimVerifyResult, SecurityEvent, SessionSummary, StepUpOptionsResult } from "@sentriq/shared";

export interface AuthenticatedUser {
  id: string;
  email?: string | null;
  displayName: string;
  role: "user" | "developer" | "admin";
  applicationId: string;
  passkeyEnrollmentRequired: boolean;
}

export interface AuthSession {
  user: AuthenticatedUser;
  session: { id: string; expiresAt: string };
}

export interface AuthFailure {
  error: { code: string; message: string; correlationId?: string };
}

export interface DeviceLinkRequest {
  requestId: string;
  comparisonCode: string;
  createdAt: string;
  expiresAt: string;
  status: "PENDING";
}

export class NorthstarAuthError extends Error {
  constructor(readonly status: number, readonly code: string, message: string, readonly correlationId?: string) {
    super(message);
    this.name = "NorthstarAuthError";
  }
}

async function jsonRequest<T>(url: string, init: RequestInit = {}): Promise<T> {
  let response: Response;
  try {
    response = await fetch(url, {
      ...init,
      credentials: "same-origin",
      cache: "no-store",
      headers: new Headers({ ...(init.body === undefined ? {} : { "content-type": "application/json" }), ...(init.headers instanceof Headers ? Object.fromEntries(init.headers) : init.headers as Record<string, string> | undefined) }),
    });
  } catch {
    throw new NorthstarAuthError(503, "NETWORK_UNAVAILABLE", "Authentication is temporarily unavailable. Check your connection and try again.");
  }

  let payload: unknown;
  try { payload = await response.json(); } catch { throw new NorthstarAuthError(503, "INVALID_RESPONSE", "Authentication is temporarily unavailable."); }
  if (!response.ok) {
    const error = typeof payload === "object" && payload !== null && "error" in payload ? (payload as AuthFailure).error : undefined;
    const safeMessage = typeof error?.message === "string" ? error.message : "Authentication could not be completed.";
    const code = typeof error?.code === "string" ? error.code : "AUTHENTICATION_FAILED";
    throw new NorthstarAuthError(response.status, code, safeMessage, error?.correlationId);
  }
  return payload as T;
}

function authRequest<T>(path: string, init: RequestInit = {}): Promise<T> {
  return jsonRequest<T>(`/api/auth/${path}`, init);
}

export const northstarAuth = {
  registrationStart(input: { displayName: string; email?: string }) {
    return authRequest<{ status: "accepted"; accountId: string }>("registration/start", { method: "POST", body: JSON.stringify(input) });
  },
  session() {
    return authRequest<AuthSession>("session", { method: "GET" });
  },
  sessions() {
    return authRequest<SessionSummary[]>("sessions", { method: "GET" });
  },
  credentials() {
    return authRequest<PasskeySummary[]>("credentials", { method: "GET" });
  },
  renameCredential(input: { credentialId: string; displayName: string }) {
    return authRequest<PasskeySummary>("credentials/rename", { method: "POST", body: JSON.stringify(input) });
  },
  events() {
    return authRequest<SecurityEvent[]>("events", { method: "GET" });
  },
  logout() {
    return authRequest<{ status: "ok" }>("logout", { method: "POST", body: "{}" });
  },
  authenticationOptions(accountId?: string) {
    return authRequest<{ challengeId: string; options: unknown }>("webauthn/login/options", { method: "POST", body: JSON.stringify(accountId ? { accountId } : {}) });
  },
  async authenticationVerify(input: { challengeId: string; response: unknown }) {
    return authRequest<{ user: AuthenticatedUser }>("webauthn/login/verify", { method: "POST", body: JSON.stringify(input) });
  },
  registrationOptions() {
    return authRequest<{ challengeId: string; options: unknown }>("webauthn/register/options", { method: "POST", body: "{}" });
  },
  registrationVerify(input: { challengeId: string; response: unknown }) {
    return authRequest<{ verified: true; user: AuthenticatedUser; recoveryCodes: string[] }>("webauthn/register/verify", { method: "POST", body: JSON.stringify(input) });
  },
  reclaimStart(input: { accountId: string }) {
    return authRequest<{ status: "accepted"; expiresIn: number }>("reclaim/start", { method: "POST", body: JSON.stringify(input) });
  },
  reclaimVerify(input: { accountId: string; recoveryCode: string }) {
    return authRequest<ReclaimVerifyResult>("reclaim/verify", { method: "POST", body: JSON.stringify(input) });
  },
  reclaimRegistrationOptions() {
    return authRequest<ReclaimRegistrationOptionsResult>("reclaim/passkey/options", { method: "POST", body: "{}" });
  },
  reclaimRegistrationVerify(input: { challengeId: string; response: unknown }) {
    return authRequest<ReclaimRegistrationVerifyResult>("reclaim/passkey/verify", { method: "POST", body: JSON.stringify(input) });
  },
  reclaimCancel() {
    return authRequest<{ status: "cancelled" }>("reclaim/cancel", { method: "POST", body: "{}" });
  },
  startDeviceLink(input: { accountId: string }) {
    return authRequest<{ status: "accepted"; requestId: string; comparisonCode: string; expiresIn: number }>("device-links/start", { method: "POST", body: JSON.stringify(input) });
  },
  deviceLinkStatus(requestId: string) {
    return authRequest<{ status: "PENDING" | "APPROVED" | "REJECTED" | "COMPLETED" | "EXPIRED" | "CANCELLED" }>("device-links/status", { method: "POST", body: JSON.stringify({ requestId }) });
  },
  deviceLinkInbox() {
    return authRequest<DeviceLinkRequest[]>("device-links/inbox", { method: "GET" });
  },
  deviceLinkApprovalOptions(requestId: string) {
    return authRequest<{ challengeId: string; options: unknown }>("device-links/approval/options", { method: "POST", body: JSON.stringify({ requestId }) });
  },
  deviceLinkApprove(input: { requestId: string; challengeId: string; response: unknown }) {
    return authRequest<{ status: "APPROVED" }>("device-links/approval/verify", { method: "POST", body: JSON.stringify(input) });
  },
  deviceLinkReject(requestId: string) {
    return authRequest<{ status: "REJECTED" }>("device-links/reject", { method: "POST", body: JSON.stringify({ requestId }) });
  },
  deviceLinkRegistrationOptions(requestId: string) {
    return authRequest<{ challengeId: string; options: unknown }>("device-links/registration/options", { method: "POST", body: JSON.stringify({ requestId }) });
  },
  deviceLinkRegistrationVerify(input: { requestId: string; challengeId: string; response: unknown }) {
    return authRequest<{ user: AuthenticatedUser }>("device-links/registration/verify", { method: "POST", body: JSON.stringify(input) });
  },
  cancelDeviceLink(requestId: string) {
    return authRequest<{ status: "CANCELLED" }>("device-links/cancel", { method: "POST", body: JSON.stringify({ requestId }) });
  },
};

export const northstarProtected = {
  stepUpOptions(challengeId: string) {
    return jsonRequest<StepUpOptionsResult>("/api/protected/step-up/options", {
      method: "POST", body: JSON.stringify({ challengeId }),
    });
  },
  verifyStepUp(input: { actionId: "data.export" | "account.delete" | "session.revoke" | "passkey.remove"; challengeId: string; response: unknown }) {
    return jsonRequest<{ verified: true; expiresAt: string }>("/api/protected/step-up/verify", {
      method: "POST", body: JSON.stringify(input),
    });
  },
  async exportData(format: "json" | "csv"): Promise<{ kind: "step-up"; challengeId: string } | { kind: "complete"; file: Blob }> {
    let response: Response;
    try {
      response = await fetch("/api/protected/export", {
        method: "POST", credentials: "same-origin", cache: "no-store",
        headers: { "content-type": "application/json" }, body: JSON.stringify({ format }),
      });
    } catch {
      throw new NorthstarAuthError(503, "NETWORK_UNAVAILABLE", "The security service is temporarily unavailable.");
    }
    if (response.status === 428) {
      const value: unknown = await response.json().catch(() => undefined);
      const challengeId = value && typeof value === "object" ? (value as { challengeId?: unknown }).challengeId : undefined;
      if (typeof challengeId === "string" && /^[0-9a-f-]{36}$/i.test(challengeId)) return { kind: "step-up", challengeId };
      throw new NorthstarAuthError(503, "SECURITY_UNAVAILABLE", "Verification is temporarily unavailable.");
    }
    if (!response.ok) {
      const status = response.status;
      const code = status === 429 ? "RATE_LIMITED" : status === 401 ? "UNAUTHORIZED" : status === 403 ? "POLICY_DENIED" : "SECURITY_UNAVAILABLE";
      throw new NorthstarAuthError(status, code, "The protected export could not be completed.");
    }
    return { kind: "complete", file: await response.blob() };
  },
  async revokeSession(sessionId: string): Promise<{ kind: "step-up"; challengeId: string } | { kind: "complete" }> {
    let response: Response;
    try {
      response = await fetch("/api/protected/sessions/revoke", {
        method: "POST", credentials: "same-origin", cache: "no-store",
        headers: { "content-type": "application/json" }, body: JSON.stringify({ sessionId }),
      });
    } catch {
      throw new NorthstarAuthError(503, "NETWORK_UNAVAILABLE", "The security service is temporarily unavailable.");
    }
    if (response.status === 428) {
      const value: unknown = await response.json().catch(() => undefined);
      const challengeId = value && typeof value === "object" ? (value as { challengeId?: unknown }).challengeId : undefined;
      if (typeof challengeId === "string" && /^[0-9a-f-]{36}$/i.test(challengeId)) return { kind: "step-up", challengeId };
      throw new NorthstarAuthError(503, "SECURITY_UNAVAILABLE", "Verification is temporarily unavailable.");
    }
    if (!response.ok) {
      const status = response.status;
      const code = status === 429 ? "RATE_LIMITED" : status === 401 ? "UNAUTHORIZED" : status === 403 ? "POLICY_DENIED" : "SECURITY_UNAVAILABLE";
      throw new NorthstarAuthError(status, code, "The session could not be revoked.");
    }
    return { kind: "complete" };
  },
  async deleteAccount(): Promise<{ kind: "step-up"; challengeId: string } | { kind: "complete" }> {
    let response: Response;
    try {
      response = await fetch("/api/protected/account/delete", {
        method: "POST", credentials: "same-origin", cache: "no-store",
        headers: { "content-type": "application/json" }, body: "{}",
      });
    } catch {
      throw new NorthstarAuthError(503, "NETWORK_UNAVAILABLE", "The security service is temporarily unavailable.");
    }
    if (response.status === 428) {
      const value: unknown = await response.json().catch(() => undefined);
      const challengeId = value && typeof value === "object" ? (value as { challengeId?: unknown }).challengeId : undefined;
      if (typeof challengeId === "string" && /^[0-9a-f-]{36}$/i.test(challengeId)) return { kind: "step-up", challengeId };
      throw new NorthstarAuthError(503, "SECURITY_UNAVAILABLE", "Verification is temporarily unavailable.");
    }
    if (!response.ok) {
      const status = response.status;
      const code = status === 429 ? "RATE_LIMITED" : status === 401 ? "UNAUTHORIZED" : status === 403 ? "POLICY_DENIED" : "SECURITY_UNAVAILABLE";
      throw new NorthstarAuthError(status, code, "The account could not be deleted.");
    }
    return { kind: "complete" };
  },
  async revokePasskey(credentialId: string): Promise<{ kind: "step-up"; challengeId: string } | { kind: "complete" }> {
    let response: Response;
    try {
      response = await fetch("/api/protected/passkeys/revoke", {
        method: "POST", credentials: "same-origin", cache: "no-store",
        headers: { "content-type": "application/json" }, body: JSON.stringify({ credentialId }),
      });
    } catch {
      throw new NorthstarAuthError(503, "NETWORK_UNAVAILABLE", "The security service is temporarily unavailable.");
    }
    if (response.status === 428) {
      const value: unknown = await response.json().catch(() => undefined);
      const challengeId = value && typeof value === "object" ? (value as { challengeId?: unknown }).challengeId : undefined;
      if (typeof challengeId === "string" && /^[0-9a-f-]{36}$/i.test(challengeId)) return { kind: "step-up", challengeId };
      throw new NorthstarAuthError(503, "SECURITY_UNAVAILABLE", "Verification is temporarily unavailable.");
    }
    if (!response.ok) {
      const status = response.status;
      const code = status === 429 ? "RATE_LIMITED" : status === 401 ? "UNAUTHORIZED" : status === 403 ? "POLICY_DENIED" : "SECURITY_UNAVAILABLE";
      throw new NorthstarAuthError(status, code, "The passkey could not be removed.");
    }
    return { kind: "complete" };
  },
};
