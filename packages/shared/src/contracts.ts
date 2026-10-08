import { z } from "zod";
import { actionIdentifierSchema } from "./action-identifiers";

const opaqueIdSchema = z.string().trim().min(1).max(128);
const timestampSchema = z.iso.datetime({ offset: true });

export const deviceLinkRequestSummarySchema = z.object({
  requestId: z.uuid(),
  comparisonCode: z.string().regex(/^[A-Z2-9]{6}$/),
  createdAt: timestampSchema,
  expiresAt: timestampSchema,
  status: z.literal("PENDING"),
}).strict();
export type DeviceLinkRequestSummary = z.infer<typeof deviceLinkRequestSummarySchema>;

export const passkeySummarySchema = z.object({
  id: z.uuid(),
  displayName: z.string().trim().min(1).max(60),
  createdAt: timestampSchema,
  deviceType: z.enum(["singleDevice", "multiDevice"]),
  backedUp: z.boolean(),
}).strict();
export type PasskeySummary = z.infer<typeof passkeySummarySchema>;

export const evaluationDecisionSchema = z.enum(["ALLOW", "STEP_UP", "DENY"]);
export type EvaluationDecision = z.infer<typeof evaluationDecisionSchema>;

export const policyModeSchema = z.enum(["ALLOW", "STEP_UP", "DENY"]);
export type PolicyMode = z.infer<typeof policyModeSchema>;

export const applicationInputSchema = z.object({
  name: z.string().trim().min(1).max(80),
  origins: z.array(z.url().refine(isSafeOrigin, "Use an HTTPS origin or localhost HTTP origin without a path")).min(1).max(10),
}).strict().superRefine((value, ctx) => {
  if (new Set(value.origins).size !== value.origins.length) {
    ctx.addIssue({ code: "custom", message: "Origins must be unique", path: ["origins"] });
  }
});

function isSafeOrigin(value: string): boolean {
  try {
    const parsed = new URL(value);
    const isLocalHttp = parsed.protocol === "http:" && ["localhost", "127.0.0.1", "[::1]"].includes(parsed.hostname);
    const isHttps = parsed.protocol === "https:";
    return (isLocalHttp || isHttps)
      && parsed.username === ""
      && parsed.password === ""
      && parsed.pathname === "/"
      && parsed.search === ""
      && parsed.hash === ""
      && value === parsed.origin;
  } catch {
    return false;
  }
}

export type ApplicationInput = z.infer<typeof applicationInputSchema>;

export const protectedActionSchema = z.object({
  actionId: actionIdentifierSchema,
  mode: policyModeSchema,
  description: z.string().trim().max(240).optional(),
  enabled: z.boolean().default(true),
}).strict();
export type ProtectedAction = z.infer<typeof protectedActionSchema>;

export const policySchema = z.object({
  id: opaqueIdSchema,
  tenantId: opaqueIdSchema,
  applicationId: opaqueIdSchema,
  actionId: actionIdentifierSchema,
  mode: policyModeSchema,
  version: z.number().int().positive(),
  enabled: z.boolean(),
  updatedAt: timestampSchema,
}).strict();
export type Policy = z.infer<typeof policySchema>;

export const evaluationRequestSchema = z.object({
  applicationId: opaqueIdSchema,
  userId: opaqueIdSchema,
  sessionId: opaqueIdSchema,
  actionId: actionIdentifierSchema,
  resourceId: opaqueIdSchema,
  stepUpGrantId: opaqueIdSchema.optional(),
}).strict();
export type EvaluationRequest = z.infer<typeof evaluationRequestSchema>;

export const evaluationResultSchema = z.object({
  decision: evaluationDecisionSchema,
  reasonCode: z.string().regex(/^[a-z0-9_]{1,80}$/),
  policyVersion: z.number().int().positive(),
  correlationId: opaqueIdSchema,
  stepUpChallengeId: opaqueIdSchema.optional(),
}).strict();
export type EvaluationResult = z.infer<typeof evaluationResultSchema>;

const webauthnBytes = z.string().regex(/^[A-Za-z0-9_-]+$/).min(1).max(12_000);
export const stepUpOptionsInputSchema = z.object({ challengeId: z.uuid(), origin: z.url().max(300).refine(isSafeOrigin) }).strict();
export const stepUpAssertionSchema = z.object({ id: webauthnBytes, rawId: webauthnBytes, type: z.literal("public-key"),
  response: z.object({ clientDataJSON: webauthnBytes, authenticatorData: webauthnBytes, signature: webauthnBytes, userHandle: webauthnBytes }).strict(),
  clientExtensionResults: z.record(z.string(), z.unknown()), authenticatorAttachment: z.enum(["platform", "cross-platform"]).optional() }).strict();
export const stepUpVerifyInputSchema = z.object({ challengeId: z.uuid(), response: stepUpAssertionSchema }).strict();
export const stepUpOptionsResultSchema = z.object({ challengeId: z.uuid(), options: z.object({
  challenge: webauthnBytes, rpId: z.string().min(1).max(253), timeout: z.number().int().positive().max(120_000), userVerification: z.literal("required"),
  allowCredentials: z.array(z.object({ id: webauthnBytes, type: z.literal("public-key"), transports: z.array(z.string().max(30)).max(10).optional() }).strict()).max(100),
}).strict() }).strict();
export const stepUpVerifyResultSchema = z.object({ stepUpGrantId: z.string().regex(/^[A-Za-z0-9_-]{43}$/), expiresAt: timestampSchema }).strict();
export type StepUpOptionsInput = z.infer<typeof stepUpOptionsInputSchema>;
export type StepUpVerifyInput = z.infer<typeof stepUpVerifyInputSchema>;
export type StepUpOptionsResult = z.infer<typeof stepUpOptionsResultSchema>;
export type StepUpVerifyResult = z.infer<typeof stepUpVerifyResultSchema>;

export const reclaimTransactionTokenSchema = z.string().regex(/^[A-Za-z0-9_-]{43}$/);
export const reclaimStartInputSchema = z.object({ email: z.email().trim().toLowerCase().max(254) }).strict();
export const reclaimStartResultSchema = z.object({ status: z.literal("accepted"), transaction: reclaimTransactionTokenSchema, expiresIn: z.literal(600) }).strict();
export const reclaimVerifyInputSchema = z.object({
  email: z.email().trim().toLowerCase().max(254),
  transaction: reclaimTransactionTokenSchema,
  recoveryCode: z.string().regex(/^[A-Za-z0-9_-]{32}$/),
}).strict();
export const reclaimVerifyResultSchema = z.object({ status: z.literal("verified"), expiresIn: z.literal(600) }).strict();
export const registrationResponseSchema = z.object({
  id: webauthnBytes, rawId: webauthnBytes, type: z.literal("public-key"),
  response: z.object({ clientDataJSON: webauthnBytes, attestationObject: webauthnBytes,
    authenticatorData: webauthnBytes.optional(), transports: z.array(z.string().max(30)).max(10).optional(),
    publicKeyAlgorithm: z.number().int().optional(), publicKey: webauthnBytes.optional() }).strict(),
  clientExtensionResults: z.record(z.string(), z.unknown()), authenticatorAttachment: z.enum(["platform", "cross-platform"]).optional(),
}).strict();
const webauthnCreationOptionsSchema = z.looseObject({
  challenge: webauthnBytes,
  rp: z.looseObject({ name: z.string().min(1).max(80), id: z.string().min(1).max(253).optional() }),
  user: z.looseObject({ id: webauthnBytes, name: z.string().min(1).max(254), displayName: z.string().min(1).max(100) }),
  pubKeyCredParams: z.array(z.looseObject({ type: z.literal("public-key"), alg: z.number().int() })).min(1).max(16),
  timeout: z.number().int().positive().max(300_000).optional(),
  excludeCredentials: z.array(z.looseObject({ id: webauthnBytes, type: z.literal("public-key"), transports: z.array(z.string().max(30)).max(10).optional() })).max(100).optional(),
  authenticatorSelection: z.looseObject({ residentKey: z.string().optional(), userVerification: z.literal("required") }).optional(),
});
export const reclaimRegistrationOptionsInputSchema = z.object({ transaction: reclaimTransactionTokenSchema, origin: z.url().max(300).refine(isSafeOrigin) }).strict();
export const reclaimRegistrationOptionsResultSchema = z.object({ challengeId: z.uuid(), options: webauthnCreationOptionsSchema }).strict();
export const reclaimRegistrationVerifyInputSchema = z.object({ transaction: reclaimTransactionTokenSchema, challengeId: z.uuid(), response: registrationResponseSchema }).strict();
export const reclaimRegistrationVerifyResultSchema = z.object({ status: z.literal("completed"), recoveryCodes: z.array(z.string().regex(/^[A-Za-z0-9_-]{32}$/)).length(6) }).strict();
export const reclaimCancelInputSchema = z.object({ transaction: reclaimTransactionTokenSchema }).strict();
export const reclaimCancelResultSchema = z.object({ status: z.literal("cancelled") }).strict();
export type ReclaimTransactionToken = z.infer<typeof reclaimTransactionTokenSchema>;
export type ReclaimStartInput = z.infer<typeof reclaimStartInputSchema>;
export type ReclaimStartResult = z.infer<typeof reclaimStartResultSchema>;
export type ReclaimVerifyInput = z.infer<typeof reclaimVerifyInputSchema>;
export type ReclaimVerifyResult = z.infer<typeof reclaimVerifyResultSchema>;
export type ReclaimRegistrationOptionsInput = z.infer<typeof reclaimRegistrationOptionsInputSchema>;
export type ReclaimRegistrationOptionsResult = z.infer<typeof reclaimRegistrationOptionsResultSchema>;
export type ReclaimRegistrationVerifyInput = z.infer<typeof reclaimRegistrationVerifyInputSchema>;
export type ReclaimRegistrationVerifyResult = z.infer<typeof reclaimRegistrationVerifyResultSchema>;
export type ReclaimCancelInput = z.infer<typeof reclaimCancelInputSchema>;
export type ReclaimCancelResult = z.infer<typeof reclaimCancelResultSchema>;

export const sessionSummarySchema = z.object({
  id: opaqueIdSchema,
  userId: opaqueIdSchema,
  applicationId: opaqueIdSchema,
  createdAt: timestampSchema,
  lastSeenAt: timestampSchema.optional(),
  expiresAt: timestampSchema,
  revokedAt: timestampSchema.optional(),
  status: z.enum(["active", "revoked", "expired"]),
  deviceLabel: z.string().max(120).optional(),
  current: z.boolean().optional(),
}).strict();
export type SessionSummary = z.infer<typeof sessionSummarySchema>;

export const SECURITY_EVENT_TYPES = [
  "AUTH_REGISTRATION_STARTED",
  "AUTH_REGISTRATION_COMPLETED",
  "AUTH_EMAIL_VERIFICATION_SENT",
  "AUTH_EMAIL_VERIFICATION_COMPLETED",
  "AUTH_EMAIL_VERIFICATION_FAILED",
  "AUTH_LOGIN_SUCCEEDED",
  "AUTH_LOGIN_FAILED",
  "AUTH_STEP_UP_REQUIRED",
  "AUTH_STEP_UP_SUCCEEDED",
  "AUTH_STEP_UP_FAILED",
  "AUTH_POLICY_DENIED",
  "AUTH_RECOVERY_STARTED",
  "AUTH_RECOVERY_CODE_VERIFIED",
  "AUTH_RECOVERY_FAILED",
  "AUTH_RECOVERY_COMPLETED",
  "AUTH_DEVICE_LINK_REQUESTED",
  "AUTH_DEVICE_LINK_APPROVED",
  "AUTH_DEVICE_LINK_REJECTED",
  "AUTH_DEVICE_LINK_COMPLETED",
  "AUTH_SESSION_REVOKED",
  "AUTH_PASSKEY_ADDED",
  "AUTH_PASSKEY_RENAMED",
  "AUTH_PASSKEY_REMOVED",
  "ACTION_EVALUATED",
  "DATA_EXPORT_CREATED",
  "ACCOUNT_DELETION_COMPLETED",
  "POLICY_UPDATED",
] as const;
export const securityEventTypeSchema = z.enum(SECURITY_EVENT_TYPES);
export type SecurityEventType = z.infer<typeof securityEventTypeSchema>;

export const securityEventSchema = z.object({
  id: opaqueIdSchema,
  tenantId: opaqueIdSchema,
  applicationId: opaqueIdSchema,
  occurredAt: timestampSchema,
  type: securityEventTypeSchema,
  outcome: z.enum(["SUCCESS", "FAILURE", "REQUIRED", "DENIED", "REVOKED", "INFO"]),
  subjectId: opaqueIdSchema.optional(),
  sessionId: opaqueIdSchema.optional(),
  actionId: actionIdentifierSchema.optional(),
  resourceId: opaqueIdSchema.optional(),
  decision: evaluationDecisionSchema.optional(),
  policyVersion: z.number().int().positive().optional(),
  correlationId: opaqueIdSchema,
  reasonCode: z.string().regex(/^[a-z0-9_]{1,80}$/),
}).strict();
export type SecurityEvent = z.infer<typeof securityEventSchema>;

export const stepUpChallengeSchema = z.object({
  id: opaqueIdSchema,
  tenantId: opaqueIdSchema,
  applicationId: opaqueIdSchema,
  userId: opaqueIdSchema,
  sessionId: opaqueIdSchema,
  actionId: actionIdentifierSchema,
  resourceId: opaqueIdSchema,
  expiresAt: timestampSchema,
  status: z.enum(["pending", "verified", "expired", "consumed"]),
}).strict();
export type StepUpChallenge = z.infer<typeof stepUpChallengeSchema>;

export const userSummarySchema = z.object({
  id: opaqueIdSchema,
  email: z.email().max(254),
  displayName: z.string().trim().min(1).max(100),
  role: z.enum(["user", "developer", "admin"]),
  applicationId: opaqueIdSchema,
}).strict();
export type UserSummary = z.infer<typeof userSummarySchema>;

export const errorResponseSchema = z.object({
  error: z.object({
    code: z.string().regex(/^[A-Z0-9_]{1,80}$/),
    message: z.string().trim().min(1).max(240),
    correlationId: opaqueIdSchema,
  }).strict(),
}).strict();
export type ErrorResponse = z.infer<typeof errorResponseSchema>;
