import { sql } from "drizzle-orm";
import { bigint, boolean, check, foreignKey, index, integer, jsonb, pgTable, text, timestamp, unique, type PgColumn } from "drizzle-orm/pg-core";

const time = (name: string) => timestamp(name, { withTimezone: true, mode: "date" });
const created = () => time("created_at").notNull().defaultNow();
const scope = () => ({ tenantId: text("tenant_id").notNull(), applicationId: text("application_id").notNull() });
const appReference = (t: { tenantId: PgColumn; applicationId: PgColumn }) => foreignKey({ columns: [t.tenantId, t.applicationId], foreignColumns: [applications.tenantId, applications.id] });
const userReference = (t: { tenantId: PgColumn; applicationId: PgColumn; userId: PgColumn }) => foreignKey({ columns: [t.tenantId, t.applicationId, t.userId], foreignColumns: [users.tenantId, users.applicationId, users.id] });

export const tenants = pgTable("tenants", {
  id: text("id").primaryKey(), name: text("name").notNull(), createdAt: created(),
}, (t) => [check("tenant_name_length", sql`length(${t.name}) BETWEEN 1 AND 100`)]);

export const applications = pgTable("applications", {
  id: text("id").primaryKey(), tenantId: text("tenant_id").notNull().references(() => tenants.id),
  name: text("name").notNull(), origins: jsonb("origins").$type<string[]>().notNull(), rpId: text("rp_id").notNull(), createdAt: created(),
}, (t) => [unique().on(t.tenantId, t.id), check("application_name_length", sql`length(${t.name}) BETWEEN 1 AND 80`)]);

export const applicationApiKeys = pgTable("application_api_keys", {
  id: text("id").primaryKey(), ...scope(), digest: text("digest").notNull().unique(),
  createdAt: created(), expiresAt: time("expires_at"), revokedAt: time("revoked_at"),
}, (t) => [appReference(t), check("api_key_digest_format", sql`${t.digest} ~ '^[a-f0-9]{64}$'`)]);

export const users = pgTable("users", {
  id: text("id").primaryKey(), ...scope(), email: text("email"), displayName: text("display_name").notNull(),
  role: text("role").$type<"user" | "developer" | "admin">().notNull().default("user"), createdAt: created(), deletedAt: time("deleted_at"),
  passkeyEnrollmentRequired: boolean("passkey_enrollment_required").notNull().default(false),
}, (t) => [appReference(t), unique().on(t.tenantId, t.applicationId, t.id), unique().on(t.tenantId, t.applicationId, t.email),
  check("email_normalized", sql`${t.email} = lower(trim(${t.email})) AND length(${t.email}) BETWEEN 3 AND 254`),
  check("display_name_length", sql`length(${t.displayName}) BETWEEN 1 AND 100`), check("user_role", sql`${t.role} IN ('user','developer','admin')`)]);

export const webauthnCredentials = pgTable("webauthn_credentials", {
  id: text("id").primaryKey(), ...scope(), userId: text("user_id").notNull(), credentialId: text("credential_id").notNull(), publicKey: text("public_key").notNull(),
  counter: bigint("counter", { mode: "number" }).notNull().default(0), transports: jsonb("transports").$type<string[]>().notNull().default([]),
  deviceType: text("device_type").notNull(), backedUp: boolean("backed_up").notNull().default(false), displayName: text("display_name").notNull().default("Passkey"), createdAt: created(),
}, (t) => [userReference(t), unique().on(t.tenantId, t.applicationId, t.credentialId), check("credential_counter", sql`${t.counter} >= 0`),
  check("credential_display_name", sql`length(trim(${t.displayName})) BETWEEN 1 AND 60`)]);

export const sessions = pgTable("sessions", {
  id: text("id").primaryKey(), ...scope(), userId: text("user_id").notNull(), tokenDigest: text("token_digest").notNull().unique(), createdAt: created(),
  lastSeenAt: time("last_seen_at"), expiresAt: time("expires_at").notNull(), revokedAt: time("revoked_at"), deviceLabel: text("device_label"),
}, (t) => [userReference(t), unique().on(t.tenantId, t.applicationId, t.userId, t.id), unique().on(t.tenantId, t.applicationId, t.id),
  check("session_token_digest", sql`${t.tokenDigest} ~ '^[a-f0-9]{64}$'`), check("session_expiry", sql`${t.expiresAt} > ${t.createdAt}`),
  index("sessions_owner_idx").on(t.tenantId, t.applicationId, t.userId)]);

export const protectedActions = pgTable("protected_actions", {
  id: text("id").primaryKey(), ...scope(), actionId: text("action_id").notNull(), description: text("description").notNull().default(""), enabled: boolean("enabled").notNull().default(true),
}, (t) => [appReference(t), unique().on(t.tenantId, t.applicationId, t.actionId)]);

export const policies = pgTable("policies", {
  id: text("id").primaryKey(), ...scope(), actionId: text("action_id").notNull(), mode: text("mode").$type<"ALLOW" | "STEP_UP" | "DENY">().notNull(),
  version: integer("version").notNull(), enabled: boolean("enabled").notNull().default(true), updatedAt: time("updated_at").notNull().defaultNow(),
}, (t) => [unique().on(t.tenantId, t.applicationId, t.actionId, t.version),
  foreignKey({ columns: [t.tenantId, t.applicationId, t.actionId], foreignColumns: [protectedActions.tenantId, protectedActions.applicationId, protectedActions.actionId] }),
  check("policy_mode", sql`${t.mode} IN ('ALLOW','STEP_UP','DENY')`), check("policy_version", sql`${t.version} > 0`)]);

export const userResources = pgTable("user_resources", {
  id: text("id").primaryKey(), ...scope(), userId: text("user_id").notNull(), kind: text("kind").notNull(), data: jsonb("data").$type<Record<string, unknown>>().notNull().default({}), createdAt: created(),
}, (t) => [userReference(t), unique().on(t.tenantId, t.applicationId, t.userId, t.id)]);

export const webauthnChallenges = pgTable("webauthn_challenges", {
  id: text("id").primaryKey(), ...scope(), userId: text("user_id"), sessionId: text("session_id"), purpose: text("purpose").$type<"registration" | "authentication" | "step_up" | "recovery_registration">().notNull(),
  challenge: text("challenge").notNull().unique(), actionId: text("action_id"), resourceId: text("resource_id"), createdAt: created(), expiresAt: time("expires_at").notNull(), consumedAt: time("consumed_at"),
  expectedOrigin: text("expected_origin"), expectedRpId: text("expected_rp_id"),
  policyVersion: integer("policy_version"), accountDigest: text("account_digest"),
}, (t) => [appReference(t), userReference(t),
  foreignKey({ columns: [t.tenantId, t.applicationId, t.userId, t.sessionId], foreignColumns: [sessions.tenantId, sessions.applicationId, sessions.userId, sessions.id] }),
  foreignKey({ columns: [t.tenantId, t.applicationId, t.actionId], foreignColumns: [protectedActions.tenantId, protectedActions.applicationId, protectedActions.actionId] }),
  foreignKey({ columns: [t.tenantId, t.applicationId, t.userId, t.resourceId], foreignColumns: [userResources.tenantId, userResources.applicationId, userResources.userId, userResources.id] }),
  unique().on(t.tenantId, t.applicationId, t.userId, t.sessionId, t.actionId, t.resourceId, t.id),
  check("challenge_purpose", sql`${t.purpose} IN ('registration','authentication','step_up','recovery_registration')`), check("challenge_expiry", sql`${t.expiresAt} > ${t.createdAt}`),
  check("challenge_policy_version", sql`${t.policyVersion} > 0`),
  check("challenge_account_digest", sql`${t.accountDigest} IS NULL OR ${t.accountDigest} ~ '^[a-f0-9]{64}$'`),
  check("challenge_session_owner", sql`${t.sessionId} IS NULL OR ${t.userId} IS NOT NULL`),
  check("recovery_registration_context", sql`${t.purpose} != 'recovery_registration' OR (${t.userId} IS NOT NULL AND ${t.sessionId} IS NULL AND ${t.actionId} IS NULL AND ${t.resourceId} IS NULL)`),
  check("step_up_context", sql`${t.purpose} != 'step_up' OR (${t.userId} IS NOT NULL AND ${t.sessionId} IS NOT NULL AND ${t.actionId} IS NOT NULL AND ${t.resourceId} IS NOT NULL)`),
  check("challenge_action_resource", sql`(${t.actionId} IS NULL) = (${t.resourceId} IS NULL)`),
  index("challenges_expiry_idx").on(t.expiresAt).where(sql`${t.consumedAt} IS NULL`)]);

export const passkeyEnrollmentTransactions = pgTable("passkey_enrollment_transactions", {
  id: text("id").primaryKey(), ...scope(), userId: text("user_id").notNull(), tokenDigest: text("token_digest").notNull().unique(),
  state: text("state").$type<"PENDING" | "COMPLETED" | "EXPIRED" | "CANCELLED">().notNull().default("PENDING"),
  createdAt: created(), expiresAt: time("expires_at").notNull(), completedAt: time("completed_at"),
}, (t) => [appReference(t), userReference(t), check("passkey_enrollment_digest", sql`${t.tokenDigest} ~ '^[a-f0-9]{64}$'`),
  check("passkey_enrollment_state", sql`${t.state} IN ('PENDING','COMPLETED','EXPIRED','CANCELLED')`),
  check("passkey_enrollment_expiry", sql`${t.expiresAt} > ${t.createdAt}`),
  check("passkey_enrollment_completed", sql`(${t.state}='COMPLETED') = (${t.completedAt} IS NOT NULL)`),
  index("passkey_enrollment_expiry_idx").on(t.expiresAt).where(sql`${t.state}='PENDING'`)]);

export const deviceLinkRequests = pgTable("device_link_requests", {
  id: text("id").primaryKey(), ...scope(), userId: text("user_id"), accountDigest: text("account_digest").notNull(), tokenDigest: text("token_digest").notNull().unique(),
  comparisonCode: text("comparison_code").notNull(), state: text("state").$type<"PENDING" | "APPROVED" | "REJECTED" | "COMPLETED" | "EXPIRED" | "CANCELLED">().notNull().default("PENDING"),
  createdAt: created(), expiresAt: time("expires_at").notNull(), approvedAt: time("approved_at"), approvalSessionId: text("approval_session_id"),
  approvalChallengeId: text("approval_challenge_id"), approvalChallenge: text("approval_challenge"), approvalExpectedOrigin: text("approval_expected_origin"),
  approvalExpectedRpId: text("approval_expected_rp_id"), approvalExpiresAt: time("approval_expires_at"), registrationChallengeId: text("registration_challenge_id"),
  registrationChallenge: text("registration_challenge"), registrationExpectedOrigin: text("registration_expected_origin"), registrationExpectedRpId: text("registration_expected_rp_id"),
  registrationExpiresAt: time("registration_expires_at"), completedAt: time("completed_at"),
}, (t) => [appReference(t), userReference(t),
  foreignKey({ columns: [t.tenantId, t.applicationId, t.userId, t.approvalSessionId], foreignColumns: [sessions.tenantId, sessions.applicationId, sessions.userId, sessions.id] }),
  check("device_link_account_digest", sql`${t.accountDigest} ~ '^[a-f0-9]{64}$'`), check("device_link_token_digest", sql`${t.tokenDigest} ~ '^[a-f0-9]{64}$'`),
  check("device_link_comparison_code", sql`${t.comparisonCode} ~ '^[A-Z2-9]{6}$'`),
  check("device_link_state", sql`${t.state} IN ('PENDING','APPROVED','REJECTED','COMPLETED','EXPIRED','CANCELLED')`),
  check("device_link_expiry", sql`${t.expiresAt} > ${t.createdAt}`),
  check("device_link_approval_state", sql`(${t.approvalSessionId} IS NULL) = (${t.approvalChallengeId} IS NULL) AND (${t.approvalChallengeId} IS NULL) = (${t.approvalChallenge} IS NULL) AND (${t.approvalChallenge} IS NULL) = (${t.approvalExpectedOrigin} IS NULL) AND (${t.approvalExpectedOrigin} IS NULL) = (${t.approvalExpectedRpId} IS NULL) AND (${t.approvalChallenge} IS NULL) = (${t.approvalExpiresAt} IS NULL)`),
  check("device_link_registration_state", sql`(${t.registrationChallengeId} IS NULL) = (${t.registrationChallenge} IS NULL) AND (${t.registrationChallenge} IS NULL) = (${t.registrationExpectedOrigin} IS NULL) AND (${t.registrationExpectedOrigin} IS NULL) = (${t.registrationExpectedRpId} IS NULL) AND (${t.registrationChallenge} IS NULL) = (${t.registrationExpiresAt} IS NULL)`),
  check("device_link_completed", sql`(${t.state} = 'COMPLETED') = (${t.completedAt} IS NOT NULL)`),
  check("device_link_approved_user", sql`${t.state} NOT IN ('APPROVED','COMPLETED') OR (${t.userId} IS NOT NULL AND ${t.approvedAt} IS NOT NULL)`),
  index("device_link_pending_user_idx").on(t.tenantId, t.applicationId, t.userId, t.createdAt).where(sql`${t.state} = 'PENDING' AND ${t.userId} IS NOT NULL`),
  index("device_link_expiry_idx").on(t.expiresAt).where(sql`${t.state} IN ('PENDING','APPROVED')`)]);

export const stepUpGrants = pgTable("step_up_grants", {
  id: text("id").primaryKey(), ...scope(), userId: text("user_id").notNull(), sessionId: text("session_id").notNull(), challengeId: text("challenge_id").notNull().unique(),
  actionId: text("action_id").notNull(), resourceId: text("resource_id").notNull(), createdAt: created(), expiresAt: time("expires_at").notNull(), consumedAt: time("consumed_at"),
  grantDigest: text("grant_digest").unique(), policyVersion: integer("policy_version"),
}, (t) => [foreignKey({ columns: [t.tenantId, t.applicationId, t.userId, t.sessionId, t.actionId, t.resourceId, t.challengeId],
  foreignColumns: [webauthnChallenges.tenantId, webauthnChallenges.applicationId, webauthnChallenges.userId, webauthnChallenges.sessionId, webauthnChallenges.actionId, webauthnChallenges.resourceId, webauthnChallenges.id] }),
  check("grant_digest", sql`${t.grantDigest} ~ '^[a-f0-9]{64}$'`), check("grant_policy_version", sql`${t.policyVersion} > 0`),
  check("grant_proof_context", sql`(${t.grantDigest} IS NULL) = (${t.policyVersion} IS NULL)`),
  check("grant_expiry", sql`${t.expiresAt} > ${t.createdAt}`), index("grants_expiry_idx").on(t.expiresAt).where(sql`${t.consumedAt} IS NULL`)]);

export const recoveryCodes = pgTable("recovery_codes", {
  id: text("id").primaryKey(), ...scope(), userId: text("user_id").notNull(), verifier: text("verifier").notNull(), createdAt: created(), consumedAt: time("consumed_at"),
}, (t) => [userReference(t), unique("recovery_code_identity").on(t.tenantId, t.applicationId, t.userId, t.id)]);

export const reclaimTransactions = pgTable("reclaim_transactions", {
  id: text("id").primaryKey(), ...scope(), userId: text("user_id"), accountDigest: text("account_digest").notNull(), tokenDigest: text("token_digest").notNull().unique(),
  recoveryCodeId: text("recovery_code_id"), state: text("state").$type<"NOT_STARTED" | "CODE_VERIFIED" | "ENROLLMENT_PENDING" | "COMPLETED" | "EXPIRED" | "CANCELLED">().notNull().default("NOT_STARTED"),
  failedAttempts: integer("failed_attempts").notNull().default(0), createdAt: created(), expiresAt: time("expires_at").notNull(), completedAt: time("completed_at"),
}, (t) => [appReference(t), userReference(t),
  foreignKey({ columns: [t.tenantId, t.applicationId, t.userId, t.recoveryCodeId], foreignColumns: [recoveryCodes.tenantId, recoveryCodes.applicationId, recoveryCodes.userId, recoveryCodes.id] }),
  check("reclaim_account_digest", sql`${t.accountDigest} ~ '^[a-f0-9]{64}$'`), check("reclaim_token_digest", sql`${t.tokenDigest} ~ '^[a-f0-9]{64}$'`),
  check("reclaim_state", sql`${t.state} IN ('NOT_STARTED','CODE_VERIFIED','ENROLLMENT_PENDING','COMPLETED','EXPIRED','CANCELLED')`),
  check("reclaim_failed_attempts", sql`${t.failedAttempts} BETWEEN 0 AND 5`), check("reclaim_expiry", sql`${t.expiresAt} > ${t.createdAt}`),
  check("reclaim_code_state", sql`${t.state} NOT IN ('CODE_VERIFIED','ENROLLMENT_PENDING','COMPLETED') OR (${t.userId} IS NOT NULL AND ${t.recoveryCodeId} IS NOT NULL)`),
  check("reclaim_code_reference", sql`${t.state} != 'NOT_STARTED' OR ${t.recoveryCodeId} IS NULL`),
  check("reclaim_completion", sql`(${t.state} = 'COMPLETED') = (${t.completedAt} IS NOT NULL)`),
  index("reclaim_transactions_expiry_idx").on(t.expiresAt).where(sql`${t.state} IN ('NOT_STARTED','CODE_VERIFIED','ENROLLMENT_PENDING')`),
  index("reclaim_transactions_user_idx").on(t.tenantId, t.applicationId, t.userId, t.createdAt).where(sql`${t.userId} IS NOT NULL`)]);

export const auditEvents = pgTable("audit_events", {
  id: text("id").primaryKey(), ...scope(), subjectId: text("subject_id"), sessionId: text("session_id"), type: text("type").notNull(),
  outcome: text("outcome").$type<"SUCCESS" | "FAILURE" | "REQUIRED" | "DENIED" | "REVOKED" | "INFO">().notNull(),
  actionId: text("action_id"), policyVersion: integer("policy_version"), riskScore: integer("risk_score"), signalCodes: jsonb("signal_codes").$type<string[]>().notNull().default([]),
  decision: text("decision").$type<"ALLOW" | "STEP_UP" | "DENY">(), resourceId: text("resource_id"),
  reasonCode: text("reason_code").notNull(), correlationId: text("correlation_id").notNull(), simulated: boolean("simulated").notNull().default(false), occurredAt: time("occurred_at").notNull().defaultNow(),
}, (t) => [appReference(t), foreignKey({ columns: [t.tenantId, t.applicationId, t.subjectId], foreignColumns: [users.tenantId, users.applicationId, users.id] }),
  foreignKey({ columns: [t.tenantId, t.applicationId, t.subjectId, t.sessionId], foreignColumns: [sessions.tenantId, sessions.applicationId, sessions.userId, sessions.id] }),
  foreignKey({ columns: [t.tenantId, t.applicationId, t.subjectId, t.resourceId], foreignColumns: [userResources.tenantId, userResources.applicationId, userResources.userId, userResources.id] }),
  check("audit_resource_subject", sql`${t.resourceId} IS NULL OR ${t.subjectId} IS NOT NULL`), check("audit_decision", sql`${t.decision} IN ('ALLOW','STEP_UP','DENY')`),
  check("audit_subject_session", sql`${t.sessionId} IS NULL OR ${t.subjectId} IS NOT NULL`), check("audit_outcome", sql`${t.outcome} IN ('SUCCESS','FAILURE','REQUIRED','DENIED','REVOKED','INFO')`),
  check("audit_policy_version", sql`${t.policyVersion} > 0`), check("audit_risk_score", sql`${t.riskScore} BETWEEN 0 AND 100`), check("audit_reason_code", sql`${t.reasonCode} ~ '^[a-z0-9_]{1,80}$'`),
  index("audit_scope_time_idx").on(t.tenantId, t.applicationId, t.occurredAt)]);
