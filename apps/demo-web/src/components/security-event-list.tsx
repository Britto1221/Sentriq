import type { SecurityEvent } from "@sentriq/shared";

const titles: Partial<Record<SecurityEvent["type"], string>> = {
  AUTH_REGISTRATION_COMPLETED: "Account registered",
  AUTH_EMAIL_VERIFICATION_SENT: "Email verification requested",
  AUTH_EMAIL_VERIFICATION_COMPLETED: "Email verified",
  AUTH_EMAIL_VERIFICATION_FAILED: "Email verification failed",
  AUTH_LOGIN_SUCCEEDED: "Sign-in succeeded",
  AUTH_LOGIN_FAILED: "Sign-in failed",
  AUTH_STEP_UP_REQUIRED: "Fresh verification required",
  AUTH_STEP_UP_SUCCEEDED: "Fresh verification succeeded",
  AUTH_STEP_UP_FAILED: "Fresh verification failed",
  AUTH_POLICY_DENIED: "Protected action denied",
  AUTH_RECOVERY_STARTED: "Account recovery started",
  AUTH_RECOVERY_CODE_VERIFIED: "Recovery code accepted",
  AUTH_RECOVERY_FAILED: "Account recovery failed",
  AUTH_RECOVERY_COMPLETED: "Passkey recovery completed",
  AUTH_DEVICE_LINK_REQUESTED: "New-device approval requested",
  AUTH_DEVICE_LINK_APPROVED: "New-device request approved",
  AUTH_DEVICE_LINK_REJECTED: "New-device request rejected",
  AUTH_DEVICE_LINK_COMPLETED: "New passkey registered",
  AUTH_SESSION_REVOKED: "Session revoked",
  AUTH_PASSKEY_ADDED: "Passkey added",
  AUTH_PASSKEY_REMOVED: "Passkey removed",
  ACTION_EVALUATED: "Protected action evaluated",
  DATA_EXPORT_CREATED: "Account data exported",
  ACCOUNT_DELETION_COMPLETED: "Account deleted",
};

export function SecurityEventList({ events, limit, full = false }: { events: SecurityEvent[]; limit?: number; full?: boolean }) {
  const visible = limit === undefined ? events : events.slice(0, limit);
  if (!visible.length) return <p className="empty-state">No security events have been recorded for this account.</p>;

  return <ol className={`activity-list${full ? " activity-list-full" : ""}`}>
    {visible.map((event) => <li className="activity-item" key={event.id}>
      <span className="activity-marker activity-marker-security" aria-hidden="true" />
      <div className="activity-item-copy">
        <strong>{titles[event.type] ?? event.type.toLowerCase().replaceAll("_", " ")}</strong>
        <span>{event.actionId ? `${event.actionId} · ` : ""}{event.reasonCode.replaceAll("_", " ")}{event.decision ? ` · ${event.decision}` : ""}{event.policyVersion ? ` · policy v${event.policyVersion}` : ""}</span>
      </div>
      <time dateTime={event.occurredAt}>{new Intl.DateTimeFormat(undefined, { dateStyle: "medium", timeStyle: "short" }).format(new Date(event.occurredAt))}</time>
    </li>)}
  </ol>;
}
