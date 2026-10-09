import { randomBytes, randomUUID, timingSafeEqual } from "node:crypto";
import { generateAuthenticationOptions, generateRegistrationOptions, verifyAuthenticationResponse, verifyRegistrationResponse,
  type AuthenticationResponseJSON, type RegistrationResponseJSON, type AuthenticatorTransport } from "@simplewebauthn/server";
import type { PGlite, Transaction } from "@electric-sql/pglite";
import { securityEventSchema } from "@sentriq/shared";
import { digestToken, type Database } from "../db/index";
import type { ApplicationScope } from "../app";
import type { ApiConfig } from "../config";

type QueryClient = Pick<PGlite | Transaction, "query">;
interface UserRow { id: string; email: string | null; display_name: string; role: "user" | "developer" | "admin"; passkey_enrollment_required: boolean }
interface SessionRow extends UserRow { session_id: string; expires_at: Date }
interface CredentialRow { id: string; user_id: string; credential_id: string; public_key: string; counter: number; transports: AuthenticatorTransport[] }
interface ChallengeRow { id: string; challenge: string; user_id: string | null; session_id: string | null; expected_origin: string | null; expected_rp_id: string | null; account_digest: string | null }
interface PasskeySummaryRow { id: string; display_name: string; created_at: Date; device_type: "singleDevice" | "multiDevice"; backed_up: boolean }
export class AuthenticationError extends Error { constructor() { super("Authentication failed"); } }
class ReclaimCommitError extends Error { constructor() { super("Recovery transaction could not be committed"); } }
const fail = (): never => { throw new AuthenticationError(); };
const token = () => randomBytes(32).toString("base64url");
const comparisonAlphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
const newComparisonCode = () => [...randomBytes(6)].map((value) => comparisonAlphabet[value & 31]).join("");
const newRecoveryCodes = () => Array.from({ length: 6 }, () => randomBytes(24).toString("base64url"));
const recoveryCodeVerifier = (code: string) => {
  const salt = randomBytes(16).toString("hex");
  return `${salt}:${digestToken(`${salt}:${code}`)}`;
};
function matchesRecoveryCode(code: string, stored: string): boolean {
  const [salt, verifier] = stored.split(":");
  if (!salt || !verifier || !/^[a-f0-9]{64}$/.test(verifier)) return false;
  return timingSafeEqual(Buffer.from(digestToken(`${salt}:${code}`), "hex"), Buffer.from(verifier, "hex"));
}
const publicUser = (row: UserRow, applicationId: string) => ({ id: row.id, email: row.email, displayName: row.display_name, role: row.role,
  applicationId, passkeyEnrollmentRequired: row.passkey_enrollment_required });
const scopeValues = (scope: ApplicationScope) => [scope.tenantId, scope.applicationId];

// This product supports top-level ceremonies only. Cryptographic checks stay with SimpleWebAuthn.
export function requireTopLevelClientData(encoded: string): void {
  const bytes = Buffer.from(encoded, "base64url");
  if (bytes.toString("base64url") !== encoded) return fail();
  const parsed: unknown = JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(bytes));
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return fail();
  const data = parsed as Record<string, unknown>;
  if (typeof data.type !== "string" || typeof data.challenge !== "string" || typeof data.origin !== "string"
    || (data.crossOrigin !== undefined && data.crossOrigin !== false) || Object.hasOwn(data, "topOrigin")) return fail();
}

async function audit(tx: QueryClient, scope: ApplicationScope, correlationId: string, type: string, outcome: string, userId?: string, sessionId?: string) {
  await tx.query("INSERT INTO audit_events(id,tenant_id,application_id,subject_id,session_id,type,outcome,reason_code,correlation_id) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)",
    [randomUUID(), ...scopeValues(scope), userId ?? null, sessionId ?? null, type, outcome, outcome === "FAILURE" ? "invalid_credentials" : "authenticated", correlationId]);
}

export function cookieName(applicationId: string, production: boolean): string {
  return `${production ? "__Host-" : ""}sentriq_${digestToken(applicationId).slice(0, 12)}`;
}
export function sessionCookie(applicationId: string, config: ApiConfig, value: string, clear = false): string {
  return `${cookieName(applicationId, config.nodeEnv === "production")}=${clear ? "" : value}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${clear ? 0 : 43200}${config.nodeEnv === "production" ? "; Secure" : ""}`;
}

export async function createAuthService(database: Database, config: ApiConfig) {
  const lookupUserById = async (tx: QueryClient, scope: ApplicationScope, userId: string) => (await tx.query<UserRow>(
    "SELECT id,email,display_name,role,passkey_enrollment_required FROM users WHERE tenant_id=$1 AND application_id=$2 AND id=$3 AND deleted_at IS NULL", [...scopeValues(scope), userId],
  )).rows[0];
  const getSession = async (tx: QueryClient, scope: ApplicationScope, opaque: string | undefined): Promise<SessionRow | undefined> => {
    if (!opaque || !/^[A-Za-z0-9_-]{43}$/.test(opaque)) return undefined;
    return (await tx.query<SessionRow>(
    "SELECT u.id,u.email,u.display_name,u.role,u.passkey_enrollment_required,s.id AS session_id,s.expires_at FROM sessions s JOIN users u ON u.id=s.user_id AND u.tenant_id=s.tenant_id AND u.application_id=s.application_id WHERE s.tenant_id=$1 AND s.application_id=$2 AND s.token_digest=$3 AND s.revoked_at IS NULL AND s.expires_at>now() AND u.deleted_at IS NULL", [...scopeValues(scope), digestToken(opaque)],
    )).rows[0];
  };
  const requireSession = async (tx: QueryClient, scope: ApplicationScope, opaque: string | undefined) => (await getSession(tx, scope, opaque)) ?? fail();
  const newSession = async (tx: QueryClient, scope: ApplicationScope, user: UserRow, correlationId: string, previous?: string) => {
    if (previous) await tx.query("UPDATE sessions SET revoked_at=now() WHERE tenant_id=$1 AND application_id=$2 AND user_id=$3 AND token_digest=$4 AND revoked_at IS NULL", [...scopeValues(scope), user.id, digestToken(previous)]);
    const opaque = token(); const id = randomUUID();
    await tx.query("INSERT INTO sessions(id,tenant_id,application_id,user_id,token_digest,expires_at) VALUES ($1,$2,$3,$4,$5,now()+interval '12 hours')", [id, ...scopeValues(scope), user.id, digestToken(opaque)]);
    await audit(tx, scope, correlationId, "AUTH_LOGIN_SUCCEEDED", "SUCCESS", user.id, id);
    return { opaque, user: publicUser(user, scope.applicationId) };
  };
  const application = async (tx: QueryClient, scope: ApplicationScope, origin: string) => {
    const app = (await tx.query<{ name: string; origins: string[]; rp_id: string }>("SELECT name,origins,rp_id FROM applications WHERE tenant_id=$1 AND id=$2", scopeValues(scope))).rows[0];
    if (!app || !app.origins.includes(origin)) return fail();
    const parsed = new URL(origin);
    const local = ["localhost", "127.0.0.1", "[::1]"].includes(parsed.hostname);
    if (origin !== parsed.origin || parsed.username || parsed.password || (parsed.protocol !== "https:" && !(config.nodeEnv !== "production" && local && parsed.protocol === "http:"))) return fail();
    if (parsed.hostname !== app.rp_id && !parsed.hostname.endsWith(`.${app.rp_id}`)) return fail();
    return app;
  };
  const storeChallenge = async (tx: QueryClient, scope: ApplicationScope, purpose: "registration" | "authentication", challenge: string, origin: string, rpId: string, session?: SessionRow, userId?: string, accountDigest?: string) => {
    const id = randomUUID();
    await tx.query("INSERT INTO webauthn_challenges(id,tenant_id,application_id,user_id,session_id,purpose,challenge,expected_origin,expected_rp_id,account_digest,expires_at) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,now()+interval '5 minutes')",
      [id, ...scopeValues(scope), session?.id ?? userId ?? null, session?.session_id ?? null, purpose, challenge, origin, rpId, accountDigest ?? null]);
    return id;
  };
  const consumeChallenge = async (tx: QueryClient, scope: ApplicationScope, id: string, purpose: string, session?: SessionRow, userId?: string) => (await tx.query<ChallengeRow>(
    "UPDATE webauthn_challenges SET consumed_at=now() WHERE id=$1 AND tenant_id=$2 AND application_id=$3 AND purpose=$4 AND consumed_at IS NULL AND expires_at>now() AND user_id IS NOT DISTINCT FROM $5 AND session_id IS NOT DISTINCT FROM $6 RETURNING id,challenge,user_id,session_id,expected_origin,expected_rp_id,account_digest",
    [id, ...scopeValues(scope), purpose, session?.id ?? userId ?? null, session?.session_id ?? null],
  )).rows[0];

  return {
    async registrationStart(scope: ApplicationScope, displayName: string, email: string | undefined, correlationId: string) {
      const userId = randomUUID();
      const registrationToken = token();
      const user = await database.client.transaction(async (tx) => {
        const inserted = await tx.query<UserRow>("INSERT INTO users(id,tenant_id,application_id,email,display_name) VALUES ($1,$2,$3,$4,$5) RETURNING id,email,display_name,role,passkey_enrollment_required",
          [userId, ...scopeValues(scope), email?.trim().toLowerCase() ?? null, displayName]);
        const createdUser = inserted.rows[0];
        if (!createdUser) return fail();
        await tx.query("INSERT INTO passkey_enrollment_transactions(id,tenant_id,application_id,user_id,token_digest,expires_at) VALUES ($1,$2,$3,$4,$5,now()+interval '10 minutes')",
          [randomUUID(), ...scopeValues(scope), userId, digestToken(registrationToken)]);
        await tx.query("INSERT INTO user_resources(id,tenant_id,application_id,user_id,kind,data) VALUES ($1,$2,$3,$4,'account',$5)",
          [`account-${userId}`, ...scopeValues(scope), userId, JSON.stringify({ displayName })]);
        await audit(tx, scope, correlationId, "AUTH_REGISTRATION_STARTED", "INFO", userId);
        return createdUser;
      });
      return { status: "accepted" as const, accountId: user.id, registrationToken, expiresIn: 600 };
    },
    async session(scope: ApplicationScope, opaque?: string) {
      const row = await requireSession(database.client, scope, opaque);
      return { user: publicUser(row, scope.applicationId), session: { id: row.session_id, expiresAt: row.expires_at.toISOString() } };
    },
    async sessions(scope: ApplicationScope, opaque?: string) {
      const owner = await requireSession(database.client, scope, opaque);
      const rows = (await database.client.query<{ id: string; created_at: Date; last_seen_at: Date | null; expires_at: Date; revoked_at: Date | null }>(
        "SELECT id,created_at,last_seen_at,expires_at,revoked_at FROM sessions WHERE tenant_id=$1 AND application_id=$2 AND user_id=$3 ORDER BY created_at DESC LIMIT 50",
        [...scopeValues(scope), owner.id],
      )).rows;
      return rows.map((row) => ({
        id: row.id, userId: owner.id, applicationId: scope.applicationId,
        createdAt: row.created_at.toISOString(), ...(row.last_seen_at ? { lastSeenAt: row.last_seen_at.toISOString() } : {}),
        expiresAt: row.expires_at.toISOString(), ...(row.revoked_at ? { revokedAt: row.revoked_at.toISOString() } : {}),
        status: row.revoked_at ? "revoked" as const : row.expires_at <= new Date() ? "expired" as const : "active" as const,
        current: row.id === owner.session_id,
      }));
    },
    async credentials(scope: ApplicationScope, opaque?: string) {
      const owner = await requireSession(database.client, scope, opaque);
      const rows = (await database.client.query<PasskeySummaryRow>(
        "SELECT id,display_name,created_at,device_type,backed_up FROM webauthn_credentials WHERE tenant_id=$1 AND application_id=$2 AND user_id=$3 ORDER BY created_at,id LIMIT 50",
        [...scopeValues(scope), owner.id],
      )).rows;
      return rows.map((row) => ({ id: row.id, displayName: row.display_name, createdAt: row.created_at.toISOString(), deviceType: row.device_type, backedUp: row.backed_up }));
    },
    async renameCredential(scope: ApplicationScope, opaque: string | undefined, credentialId: string, displayName: string, correlationId: string) {
      return database.client.transaction(async (tx) => {
        const owner = await requireSession(tx, scope, opaque);
        const updated = await tx.query<{ id: string; display_name: string; created_at: Date; device_type: "singleDevice" | "multiDevice"; backed_up: boolean }>(
          "UPDATE webauthn_credentials SET display_name=$1 WHERE id=$2 AND tenant_id=$3 AND application_id=$4 AND user_id=$5 RETURNING id,display_name,created_at,device_type,backed_up",
          [displayName, credentialId, ...scopeValues(scope), owner.id],
        );
        const row = updated.rows[0];
        if (!row) return fail();
        await audit(tx, scope, correlationId, "AUTH_PASSKEY_RENAMED", "SUCCESS", owner.id, owner.session_id);
        return { id: row.id, displayName: row.display_name, createdAt: row.created_at.toISOString(), deviceType: row.device_type, backedUp: row.backed_up };
      });
    },
    async revokeCredential(scope: ApplicationScope, opaque: string | undefined, credentialId: string, stepUpGrantId: string | undefined, correlationId: string) {
      if (!stepUpGrantId || !/^[A-Za-z0-9_-]{43}$/.test(stepUpGrantId)) return fail();
      await database.client.transaction(async (tx) => {
        const owner = await requireSession(tx, scope, opaque);
        // Serialize all removals for this account so two simultaneous requests cannot remove its last passkeys.
        const lockedOwner = (await tx.query<{ id: string }>(
          "SELECT id FROM users WHERE tenant_id=$1 AND application_id=$2 AND id=$3 AND deleted_at IS NULL FOR UPDATE",
          [...scopeValues(scope), owner.id],
        )).rows[0];
        if (!lockedOwner) return fail();
        const target = (await tx.query<{ id: string }>(
          "SELECT id FROM webauthn_credentials WHERE id=$1 AND tenant_id=$2 AND application_id=$3 AND user_id=$4 FOR UPDATE",
          [credentialId, ...scopeValues(scope), owner.id],
        )).rows[0];
        if (!target) return fail();
        const count = (await tx.query<{ count: number }>(
          "SELECT count(*)::int AS count FROM webauthn_credentials WHERE tenant_id=$1 AND application_id=$2 AND user_id=$3",
          [...scopeValues(scope), owner.id],
        )).rows[0]?.count ?? 0;
        if (count <= 1) return fail();

        const current = (await tx.query<{ mode: string; version: number }>(
          "SELECT p.mode,p.version FROM policies p JOIN protected_actions a ON a.tenant_id=p.tenant_id AND a.application_id=p.application_id AND a.action_id=p.action_id WHERE p.tenant_id=$1 AND p.application_id=$2 AND p.action_id='passkey.remove' AND p.enabled=true AND a.enabled=true ORDER BY p.version DESC LIMIT 1",
          scopeValues(scope),
        )).rows[0];
        if (current?.mode !== "STEP_UP" || !Number.isSafeInteger(current.version) || current.version < 1) return fail();
        const resourceId = `passkey-${target.id}`;
        const resource = (await tx.query("SELECT id FROM user_resources WHERE tenant_id=$1 AND application_id=$2 AND user_id=$3 AND id=$4 AND kind='passkey' AND data->>'revoked'='false'",
          [...scopeValues(scope), owner.id, resourceId])).rows[0];
        if (!resource) return fail();
        const grant = (await tx.query("UPDATE step_up_grants SET consumed_at=now() WHERE grant_digest=$1 AND tenant_id=$2 AND application_id=$3 AND user_id=$4 AND session_id=$5 AND action_id='passkey.remove' AND resource_id=$6 AND policy_version=$7 AND expires_at>now() AND consumed_at IS NULL RETURNING id",
          [digestToken(stepUpGrantId), ...scopeValues(scope), owner.id, owner.session_id, resourceId, current.version])).rows[0];
        if (!grant) return fail();
        const deleted = (await tx.query("DELETE FROM webauthn_credentials WHERE id=$1 AND tenant_id=$2 AND application_id=$3 AND user_id=$4 RETURNING id",
          [target.id, ...scopeValues(scope), owner.id])).rows[0];
        if (!deleted) return fail();
        await tx.query("UPDATE user_resources SET data=data || '{\"revoked\":true}'::jsonb WHERE tenant_id=$1 AND application_id=$2 AND user_id=$3 AND id=$4", [...scopeValues(scope), owner.id, resourceId]);
        await tx.query("INSERT INTO audit_events(id,tenant_id,application_id,subject_id,session_id,type,outcome,action_id,resource_id,decision,policy_version,reason_code,correlation_id) VALUES ($1,$2,$3,$4,$5,'AUTH_PASSKEY_REMOVED','REVOKED','passkey.remove',$6,'ALLOW',$7,'credential_revoked',$8)",
          [randomUUID(), ...scopeValues(scope), owner.id, owner.session_id, resourceId, current.version, correlationId]);
      });
      return { status: "revoked" as const };
    },
    async events(scope: ApplicationScope, opaque?: string) {
      const owner = await requireSession(database.client, scope, opaque);
      const rows = (await database.client.query<{
        id: string; occurred_at: Date; type: string; outcome: string; subject_id: string | null; session_id: string | null;
        action_id: string | null; resource_id: string | null; decision: string | null; policy_version: number | null; correlation_id: string; reason_code: string;
      }>("SELECT id,occurred_at,type,outcome,subject_id,session_id,action_id,resource_id,decision,policy_version,correlation_id,reason_code FROM audit_events WHERE tenant_id=$1 AND application_id=$2 AND subject_id=$3 AND type<>'DEMO_SUSPICIOUS_SESSION_SIMULATED' ORDER BY occurred_at DESC,id DESC LIMIT 50",
        [...scopeValues(scope), owner.id])).rows;
      return rows.flatMap((row) => {
        const parsed = securityEventSchema.safeParse({
          id: row.id, tenantId: scope.tenantId, applicationId: scope.applicationId, occurredAt: row.occurred_at.toISOString(),
          type: row.type, outcome: row.outcome, ...(row.subject_id ? { subjectId: row.subject_id } : {}),
          ...(row.session_id ? { sessionId: row.session_id } : {}), ...(row.action_id ? { actionId: row.action_id } : {}),
          ...(row.resource_id ? { resourceId: row.resource_id } : {}), ...(row.decision ? { decision: row.decision } : {}),
          ...(row.policy_version ? { policyVersion: row.policy_version } : {}), correlationId: row.correlation_id, reasonCode: row.reason_code,
        });
        return parsed.success ? [parsed.data] : [];
      });
    },
    async revokeSession(scope: ApplicationScope, opaque: string | undefined, targetSessionId: string, correlationId: string) {
      await database.client.transaction(async (tx) => {
        const owner = await requireSession(tx, scope, opaque);
        if (targetSessionId === owner.session_id) return fail();
        const target = (await tx.query<{ id: string }>("UPDATE sessions SET revoked_at=now() WHERE id=$1 AND tenant_id=$2 AND application_id=$3 AND user_id=$4 AND revoked_at IS NULL AND expires_at>now() RETURNING id", [targetSessionId, ...scopeValues(scope), owner.id])).rows[0];
        if (!target) return fail();
        await audit(tx, scope, correlationId, "AUTH_SESSION_REVOKED", "REVOKED", owner.id, target.id);
      });
      return { status: "revoked" as const };
    },
    async logout(scope: ApplicationScope, opaque: string | undefined, correlationId: string) {
      await database.client.transaction(async (tx) => {
        const row = await requireSession(tx, scope, opaque);
        await tx.query("UPDATE sessions SET revoked_at=now() WHERE id=$1 AND tenant_id=$2 AND application_id=$3", [row.session_id, ...scopeValues(scope)]);
        await audit(tx, scope, correlationId, "AUTH_SESSION_REVOKED", "REVOKED", row.id, row.session_id);
      }); return { status: "ok" };
    },
    async deleteAccount(scope: ApplicationScope, opaque: string | undefined, correlationId: string) {
      await database.client.transaction(async (tx) => {
        const owner = await requireSession(tx, scope, opaque);
        const deleted = await tx.query<{ id: string }>(
          "UPDATE users SET email=NULL,display_name='Deleted account',deleted_at=now(),passkey_enrollment_required=true WHERE id=$1 AND tenant_id=$2 AND application_id=$3 AND deleted_at IS NULL RETURNING id",
          [owner.id, ...scopeValues(scope)],
        );
        if (!deleted.rows.length) return fail();
        await tx.query("DELETE FROM webauthn_credentials WHERE tenant_id=$1 AND application_id=$2 AND user_id=$3", [...scopeValues(scope), owner.id]);
        await tx.query("UPDATE recovery_codes SET consumed_at=now() WHERE tenant_id=$1 AND application_id=$2 AND user_id=$3 AND consumed_at IS NULL", [...scopeValues(scope), owner.id]);
        await tx.query("UPDATE sessions SET revoked_at=now() WHERE tenant_id=$1 AND application_id=$2 AND user_id=$3 AND revoked_at IS NULL", [...scopeValues(scope), owner.id]);
        await tx.query("UPDATE webauthn_challenges SET consumed_at=now() WHERE tenant_id=$1 AND application_id=$2 AND user_id=$3 AND consumed_at IS NULL", [...scopeValues(scope), owner.id]);
        await tx.query("UPDATE user_resources SET data='{}'::jsonb WHERE tenant_id=$1 AND application_id=$2 AND user_id=$3", [...scopeValues(scope), owner.id]);
        await tx.query("INSERT INTO audit_events(id,tenant_id,application_id,subject_id,session_id,type,outcome,action_id,resource_id,reason_code,correlation_id) VALUES ($1,$2,$3,$4,$5,'ACCOUNT_DELETION_COMPLETED','SUCCESS','account.delete',$6,'account_deleted',$7)",
          [randomUUID(), ...scopeValues(scope), owner.id, owner.session_id, `account-${owner.id}`, correlationId]);
      });
      return { status: "deleted" as const };
    },
    async registrationOptions(scope: ApplicationScope, origin: string, opaque?: string, registrationToken?: string) {
      return database.client.transaction(async (tx) => {
        if (opaque || !registrationToken || !/^[A-Za-z0-9_-]{43}$/.test(registrationToken)) return fail();
        const registration = (await tx.query<{ id: string; user_id: string; state: string; expires_at: Date }>(
          "SELECT id,user_id,state,expires_at FROM passkey_enrollment_transactions WHERE token_digest=$1 AND tenant_id=$2 AND application_id=$3 FOR UPDATE",
          [digestToken(registrationToken), ...scopeValues(scope)])).rows[0];
        if (!registration || registration.state !== "PENDING" || registration.expires_at <= new Date()) return fail();
        const user = (await tx.query<UserRow>("SELECT id,email,display_name,role,passkey_enrollment_required FROM users WHERE tenant_id=$1 AND application_id=$2 AND id=$3 AND deleted_at IS NULL", [...scopeValues(scope), registration.user_id])).rows[0];
        if (!user) return fail();
        const credentials = (await tx.query<CredentialRow>("SELECT credential_id,transports FROM webauthn_credentials WHERE tenant_id=$1 AND application_id=$2 AND user_id=$3", [...scopeValues(scope), user.id])).rows;
        if (credentials.length) return fail();
        const app = await application(tx, scope, origin);
        const options = await generateRegistrationOptions({ rpName: app.name, rpID: app.rp_id, userName: user.id, userID: new Uint8Array(Buffer.from(user.id)), userDisplayName: user.display_name,
          timeout: 300_000, attestationType: "none", supportedAlgorithmIDs: [-7, -257], authenticatorSelection: { residentKey: "required", userVerification: "required" },
          excludeCredentials: credentials.map((credential) => ({ id: credential.credential_id, transports: credential.transports })) });
        const challengeId = await storeChallenge(tx, scope, "registration", options.challenge, origin, app.rp_id, undefined, user.id, digestToken(registrationToken));
        return { challengeId, options };
      });
    },
    async registrationVerify(scope: ApplicationScope, id: string, response: RegistrationResponseJSON, opaque: string | undefined, registrationToken: string | undefined, correlationId: string) {
      if (opaque || !registrationToken || !/^[A-Za-z0-9_-]{43}$/.test(registrationToken)) return fail();
      const completed = await database.client.transaction(async (tx) => {
        const registration = (await tx.query<{ id: string; user_id: string; state: string; expires_at: Date }>(
          "SELECT id,user_id,state,expires_at FROM passkey_enrollment_transactions WHERE token_digest=$1 AND tenant_id=$2 AND application_id=$3 FOR UPDATE",
          [digestToken(registrationToken), ...scopeValues(scope)])).rows[0];
        if (!registration || registration.state !== "PENDING" || registration.expires_at <= new Date()) return null;
        const user = (await tx.query<UserRow>("SELECT id,email,display_name,role,passkey_enrollment_required FROM users WHERE tenant_id=$1 AND application_id=$2 AND id=$3 AND deleted_at IS NULL", [...scopeValues(scope), registration.user_id])).rows[0];
        if (!user) return null;
        const challenge = await consumeChallenge(tx, scope, id, "registration", undefined, user.id);
        if (!challenge?.expected_origin || !challenge.expected_rp_id || challenge.account_digest !== digestToken(registrationToken)) return false;
        try {
          requireTopLevelClientData(response.response.clientDataJSON);
          const currentApplication = await application(tx, scope, challenge.expected_origin);
          if (currentApplication.rp_id !== challenge.expected_rp_id) return false;
          const verified = await verifyRegistrationResponse({ response, expectedChallenge: challenge.challenge, expectedOrigin: challenge.expected_origin, expectedRPID: challenge.expected_rp_id, requireUserVerification: true, requireUserPresence: true, supportedAlgorithmIDs: [-7, -257] });
          if (!verified.verified) return false;
          const info = verified.registrationInfo;
          const inserted = await tx.query<{ id: string }>("INSERT INTO webauthn_credentials(id,tenant_id,application_id,user_id,credential_id,public_key,counter,transports,device_type,backed_up) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10) ON CONFLICT (tenant_id,application_id,credential_id) DO NOTHING RETURNING id",
            [randomUUID(), ...scopeValues(scope), user.id, info.credential.id, Buffer.from(info.credential.publicKey).toString("base64url"), info.credential.counter, JSON.stringify(info.credential.transports ?? []), info.credentialDeviceType, info.credentialBackedUp]);
          if (!inserted.rows.length) return null;
          await tx.query("INSERT INTO user_resources(id,tenant_id,application_id,user_id,kind,data) VALUES ($1,$2,$3,$4,'passkey',$5)",
            [`passkey-${inserted.rows[0]!.id}`, ...scopeValues(scope), user.id, JSON.stringify({ credentialRecordId: inserted.rows[0]!.id, revoked: false })]);
          const codes = newRecoveryCodes();
          for (const code of codes) await tx.query("INSERT INTO recovery_codes(id,tenant_id,application_id,user_id,verifier) VALUES ($1,$2,$3,$4,$5)", [randomUUID(), ...scopeValues(scope), user.id, recoveryCodeVerifier(code)]);
          const marked = await tx.query("UPDATE passkey_enrollment_transactions SET state='COMPLETED',completed_at=now() WHERE id=$1 AND tenant_id=$2 AND application_id=$3 AND user_id=$4 AND state='PENDING' AND expires_at>now() RETURNING id", [registration.id, ...scopeValues(scope), user.id]);
          if (!marked.rows.length) return null;
          await tx.query("UPDATE users SET passkey_enrollment_required=false WHERE id=$1 AND tenant_id=$2 AND application_id=$3", [user.id, ...scopeValues(scope)]);
          await audit(tx, scope, correlationId, "AUTH_PASSKEY_ADDED", "SUCCESS", user.id);
          await audit(tx, scope, correlationId, "AUTH_REGISTRATION_COMPLETED", "SUCCESS", user.id);
          const session = await newSession(tx, scope, user, correlationId);
          return { ...session, recoveryCodes: codes };
        } catch { await audit(tx, scope, correlationId, "AUTH_LOGIN_FAILED", "FAILURE", user.id); return null; }
      });
      if (!completed) return fail(); return { verified: true, ...completed };
    },
    async authenticationOptions(scope: ApplicationScope, origin: string, accountId?: string) {
      return database.client.transaction(async (tx) => {
        const app = await application(tx, scope, origin);
        // Discoverable login avoids disclosing account/credential availability.
        const options = await generateAuthenticationOptions({ rpID: app.rp_id, timeout: 300_000, userVerification: "required" });
        const challengeId = await storeChallenge(tx, scope, "authentication", options.challenge, origin, app.rp_id, undefined, undefined, accountId ? digestToken(accountId) : undefined);
        return { challengeId, options };
      });
    },
    async authenticationVerify(scope: ApplicationScope, id: string, response: AuthenticationResponseJSON, correlationId: string, previous?: string) {
      const result = await database.client.transaction(async (tx) => {
        const challenge = await consumeChallenge(tx, scope, id, "authentication");
        if (!challenge?.expected_origin || !challenge.expected_rp_id) return null;
        const credential = (await tx.query<CredentialRow>("SELECT id,user_id,credential_id,public_key,counter,transports FROM webauthn_credentials WHERE tenant_id=$1 AND application_id=$2 AND credential_id=$3", [...scopeValues(scope), response.id])).rows[0];
        const user = credential ? (await tx.query<UserRow>("SELECT id,email,display_name,role,passkey_enrollment_required FROM users WHERE tenant_id=$1 AND application_id=$2 AND id=$3 AND deleted_at IS NULL", [...scopeValues(scope), credential.user_id])).rows[0] : undefined;
        if (!credential || !user || response.response.userHandle !== Buffer.from(user.id).toString("base64url")) return null;
        if (challenge.account_digest && digestToken(user.id) !== challenge.account_digest) return null;
        try {
          requireTopLevelClientData(response.response.clientDataJSON);
          const currentApplication = await application(tx, scope, challenge.expected_origin);
          if (currentApplication.rp_id !== challenge.expected_rp_id) return null;
          const verified = await verifyAuthenticationResponse({ response, expectedChallenge: challenge.challenge, expectedOrigin: challenge.expected_origin, expectedRPID: challenge.expected_rp_id,
            requireUserVerification: true, credential: { id: credential.credential_id, publicKey: new Uint8Array(Buffer.from(credential.public_key, "base64url")), counter: credential.counter, transports: credential.transports } });
          if (!verified.verified) return null;
          await tx.query("UPDATE webauthn_credentials SET counter=$1,device_type=$2,backed_up=$3 WHERE id=$4 AND tenant_id=$5 AND application_id=$6", [verified.authenticationInfo.newCounter, verified.authenticationInfo.credentialDeviceType, verified.authenticationInfo.credentialBackedUp, credential.id, ...scopeValues(scope)]);
          return newSession(tx, scope, user, correlationId, previous);
        } catch { await audit(tx, scope, correlationId, "AUTH_LOGIN_FAILED", "FAILURE", user.id); return null; }
      }); return result ?? fail();
    },
    async deviceLinkStart(scope: ApplicationScope, accountId: string, correlationId: string) {
      const transaction = token(); const requestId = randomUUID(); const comparisonCode = newComparisonCode();
      const existing = await lookupUserById(database.client, scope, accountId);
      const credentials = existing
        ? await database.client.query("SELECT id FROM webauthn_credentials WHERE tenant_id=$1 AND application_id=$2 AND user_id=$3 LIMIT 1", [...scopeValues(scope), existing.id])
        : { rows: [] };
      const userId = credentials.rows.length ? existing?.id ?? null : null;
      await database.client.transaction(async (tx) => {
        await tx.query("INSERT INTO device_link_requests(id,tenant_id,application_id,user_id,account_digest,token_digest,comparison_code,state,expires_at) VALUES ($1,$2,$3,$4,$5,$6,$7,'PENDING',now()+interval '10 minutes')",
          [requestId, ...scopeValues(scope), userId, digestToken(accountId), digestToken(transaction), comparisonCode]);
        await audit(tx, scope, correlationId, "AUTH_DEVICE_LINK_REQUESTED", "INFO", userId ?? undefined);
      });
      return { status: "accepted" as const, requestId, comparisonCode, transaction, expiresIn: 600 };
    },
    async deviceLinkInbox(scope: ApplicationScope, opaque?: string) {
      const owner = await requireSession(database.client, scope, opaque);
      await database.client.query("UPDATE device_link_requests SET state='EXPIRED',approval_session_id=NULL,approval_challenge_id=NULL,approval_challenge=NULL,approval_expected_origin=NULL,approval_expected_rp_id=NULL,approval_expires_at=NULL,registration_challenge_id=NULL,registration_challenge=NULL,registration_expected_origin=NULL,registration_expected_rp_id=NULL,registration_expires_at=NULL WHERE tenant_id=$1 AND application_id=$2 AND user_id=$3 AND state IN ('PENDING','APPROVED') AND expires_at<=now()", [...scopeValues(scope), owner.id]);
      const requests = await database.client.query<{ id: string; comparison_code: string; created_at: Date; expires_at: Date }>(
        "SELECT id,comparison_code,created_at,expires_at FROM device_link_requests WHERE tenant_id=$1 AND application_id=$2 AND user_id=$3 AND state='PENDING' AND expires_at>now() ORDER BY created_at DESC LIMIT 10",
        [...scopeValues(scope), owner.id]);
      return requests.rows.map((item) => ({ requestId: item.id, comparisonCode: item.comparison_code, createdAt: item.created_at.toISOString(), expiresAt: item.expires_at.toISOString(), status: "PENDING" as const }));
    },
    async deviceLinkStatus(scope: ApplicationScope, requestId: string, transaction: string) {
      if (!/^[A-Za-z0-9_-]{43}$/.test(transaction)) return fail();
      const row = (await database.client.query<{ state: string; expires_at: Date }>(
        "SELECT state,expires_at FROM device_link_requests WHERE id=$1 AND tenant_id=$2 AND application_id=$3 AND token_digest=$4",
        [requestId, ...scopeValues(scope), digestToken(transaction)])).rows[0];
      if (!row) return fail();
      if (["PENDING", "APPROVED"].includes(row.state) && row.expires_at <= new Date()) {
        await database.client.query("UPDATE device_link_requests SET state='EXPIRED',approval_session_id=NULL,approval_challenge_id=NULL,approval_challenge=NULL,approval_expected_origin=NULL,approval_expected_rp_id=NULL,approval_expires_at=NULL,registration_challenge_id=NULL,registration_challenge=NULL,registration_expected_origin=NULL,registration_expected_rp_id=NULL,registration_expires_at=NULL WHERE id=$1 AND tenant_id=$2 AND application_id=$3 AND state IN ('PENDING','APPROVED') AND expires_at<=now()", [requestId, ...scopeValues(scope)]);
        return { status: "EXPIRED" as const };
      }
      return { status: row.state as "PENDING" | "APPROVED" | "REJECTED" | "COMPLETED" | "EXPIRED" | "CANCELLED" };
    },
    async deviceLinkApprovalOptions(scope: ApplicationScope, requestId: string, origin: string, opaque?: string) {
      return database.client.transaction(async (tx) => {
        const session = await requireSession(tx, scope, opaque); const app = await application(tx, scope, origin);
        const row = (await tx.query<{ id: string; user_id: string | null; state: string; expires_at: Date }>(
          "SELECT id,user_id,state,expires_at FROM device_link_requests WHERE id=$1 AND tenant_id=$2 AND application_id=$3 FOR UPDATE",
          [requestId, ...scopeValues(scope)])).rows[0];
        if (!row || row.state !== "PENDING" || row.expires_at <= new Date() || row.user_id !== session.id) return fail();
        const credentials = (await tx.query<CredentialRow>("SELECT credential_id,transports FROM webauthn_credentials WHERE tenant_id=$1 AND application_id=$2 AND user_id=$3", [...scopeValues(scope), session.id])).rows;
        if (!credentials.length) return fail();
        const options = await generateAuthenticationOptions({ rpID: app.rp_id, timeout: 180_000, userVerification: "required",
          allowCredentials: credentials.map((credential) => ({ id: credential.credential_id, transports: credential.transports })) });
        const challengeId = randomUUID();
        const updated = await tx.query("UPDATE device_link_requests SET approval_session_id=$1,approval_challenge_id=$2,approval_challenge=$3,approval_expected_origin=$4,approval_expected_rp_id=$5,approval_expires_at=now()+interval '3 minutes' WHERE id=$6 AND tenant_id=$7 AND application_id=$8 AND user_id=$9 AND state='PENDING' AND expires_at>now() RETURNING id",
          [session.session_id, challengeId, options.challenge, origin, app.rp_id, requestId, ...scopeValues(scope), session.id]);
        if (!updated.rows.length) return fail();
        return { challengeId, options };
      });
    },
    async deviceLinkApprove(scope: ApplicationScope, requestId: string, challengeId: string, response: AuthenticationResponseJSON, opaque: string | undefined, correlationId: string) {
      const result = await database.client.transaction(async (tx) => {
        const session = await requireSession(tx, scope, opaque);
        const row = (await tx.query<{ id: string; user_id: string | null; state: string; expires_at: Date; approval_session_id: string | null; approval_challenge_id: string | null; approval_challenge: string | null; approval_expected_origin: string | null; approval_expected_rp_id: string | null; approval_expires_at: Date | null }>(
          "SELECT id,user_id,state,expires_at,approval_session_id,approval_challenge_id,approval_challenge,approval_expected_origin,approval_expected_rp_id,approval_expires_at FROM device_link_requests WHERE id=$1 AND tenant_id=$2 AND application_id=$3 FOR UPDATE",
          [requestId, ...scopeValues(scope)])).rows[0];
        if (!row || row.state !== "PENDING" || row.user_id !== session.id || row.approval_session_id !== session.session_id
          || row.approval_challenge_id !== challengeId || !row.approval_challenge || !row.approval_expected_origin || !row.approval_expected_rp_id
          || !row.approval_expires_at || row.approval_expires_at <= new Date() || row.expires_at <= new Date()) return null;
        const consumed = await tx.query("UPDATE device_link_requests SET approval_session_id=NULL,approval_challenge_id=NULL,approval_challenge=NULL,approval_expected_origin=NULL,approval_expected_rp_id=NULL,approval_expires_at=NULL WHERE id=$1 AND tenant_id=$2 AND application_id=$3 AND state='PENDING' AND approval_challenge_id=$4 AND approval_expires_at>now() RETURNING id",
          [requestId, ...scopeValues(scope), challengeId]);
        if (!consumed.rows.length) return null;
        const credential = (await tx.query<CredentialRow>("SELECT id,user_id,credential_id,public_key,counter,transports FROM webauthn_credentials WHERE tenant_id=$1 AND application_id=$2 AND user_id=$3 AND credential_id=$4",
          [...scopeValues(scope), session.id, response.id])).rows[0];
        if (!credential || response.response.userHandle !== Buffer.from(session.id).toString("base64url")) return null;
        try {
          requireTopLevelClientData(response.response.clientDataJSON);
          const currentApp = await application(tx, scope, row.approval_expected_origin);
          if (currentApp.rp_id !== row.approval_expected_rp_id) return null;
          const verified = await verifyAuthenticationResponse({ response, expectedChallenge: row.approval_challenge, expectedOrigin: row.approval_expected_origin,
            expectedRPID: row.approval_expected_rp_id, requireUserVerification: true,
            credential: { id: credential.credential_id, publicKey: new Uint8Array(Buffer.from(credential.public_key, "base64url")), counter: credential.counter, transports: credential.transports } });
          if (!verified.verified) return null;
          await tx.query("UPDATE webauthn_credentials SET counter=$1,device_type=$2,backed_up=$3 WHERE id=$4 AND tenant_id=$5 AND application_id=$6 AND user_id=$7",
            [verified.authenticationInfo.newCounter, verified.authenticationInfo.credentialDeviceType, verified.authenticationInfo.credentialBackedUp, credential.id, ...scopeValues(scope), session.id]);
          const approved = await tx.query("UPDATE device_link_requests SET state='APPROVED',approved_at=now() WHERE id=$1 AND tenant_id=$2 AND application_id=$3 AND user_id=$4 AND state='PENDING' AND expires_at>now() RETURNING id",
            [requestId, ...scopeValues(scope), session.id]);
          if (!approved.rows.length) return null;
          await audit(tx, scope, correlationId, "AUTH_DEVICE_LINK_APPROVED", "SUCCESS", session.id, session.session_id);
          return true;
        } catch { return null; }
      });
      if (!result) return fail();
      return { status: "APPROVED" as const };
    },
    async deviceLinkReject(scope: ApplicationScope, requestId: string, opaque: string | undefined, correlationId: string) {
      const result = await database.client.transaction(async (tx) => {
        const session = await requireSession(tx, scope, opaque);
        const row = await tx.query("UPDATE device_link_requests SET state='REJECTED',approval_session_id=NULL,approval_challenge_id=NULL,approval_challenge=NULL,approval_expected_origin=NULL,approval_expected_rp_id=NULL,approval_expires_at=NULL,registration_challenge_id=NULL,registration_challenge=NULL,registration_expected_origin=NULL,registration_expected_rp_id=NULL,registration_expires_at=NULL WHERE id=$1 AND tenant_id=$2 AND application_id=$3 AND user_id=$4 AND state='PENDING' AND expires_at>now() RETURNING id",
          [requestId, ...scopeValues(scope), session.id]);
        if (!row.rows.length) return false;
        await audit(tx, scope, correlationId, "AUTH_DEVICE_LINK_REJECTED", "DENIED", session.id, session.session_id);
        return true;
      });
      if (!result) return fail();
      return { status: "REJECTED" as const };
    },
    async deviceLinkRegistrationOptions(scope: ApplicationScope, requestId: string, transaction: string, origin: string) {
      if (!/^[A-Za-z0-9_-]{43}$/.test(transaction)) return fail();
      return database.client.transaction(async (tx) => {
        const row = (await tx.query<{ id: string; user_id: string | null; state: string; expires_at: Date }>(
          "SELECT id,user_id,state,expires_at FROM device_link_requests WHERE id=$1 AND tenant_id=$2 AND application_id=$3 AND token_digest=$4 FOR UPDATE",
          [requestId, ...scopeValues(scope), digestToken(transaction)])).rows[0];
        if (!row || row.state !== "APPROVED" || !row.user_id || row.expires_at <= new Date()) return fail();
        const user = (await tx.query<UserRow>("SELECT id,email,display_name,role,passkey_enrollment_required FROM users WHERE tenant_id=$1 AND application_id=$2 AND id=$3 AND deleted_at IS NULL", [...scopeValues(scope), row.user_id])).rows[0];
        if (!user) return fail();
        const app = await application(tx, scope, origin);
        const credentials = (await tx.query<CredentialRow>("SELECT credential_id,transports FROM webauthn_credentials WHERE tenant_id=$1 AND application_id=$2 AND user_id=$3", [...scopeValues(scope), user.id])).rows;
        const options = await generateRegistrationOptions({ rpName: app.name, rpID: app.rp_id, userName: user.id, userID: new Uint8Array(Buffer.from(user.id)), userDisplayName: user.display_name,
          timeout: 300_000, attestationType: "none", supportedAlgorithmIDs: [-7, -257], authenticatorSelection: { residentKey: "required", userVerification: "required" },
          excludeCredentials: credentials.map((credential) => ({ id: credential.credential_id, transports: credential.transports })) });
        const challengeId = randomUUID();
        const updated = await tx.query("UPDATE device_link_requests SET registration_challenge_id=$1,registration_challenge=$2,registration_expected_origin=$3,registration_expected_rp_id=$4,registration_expires_at=now()+interval '5 minutes' WHERE id=$5 AND tenant_id=$6 AND application_id=$7 AND state='APPROVED' AND expires_at>now() RETURNING id",
          [challengeId, options.challenge, origin, app.rp_id, requestId, ...scopeValues(scope)]);
        if (!updated.rows.length) return fail();
        return { challengeId, options };
      });
    },
    async deviceLinkRegistrationVerify(scope: ApplicationScope, requestId: string, transaction: string, challengeId: string, response: RegistrationResponseJSON, correlationId: string) {
      if (!/^[A-Za-z0-9_-]{43}$/.test(transaction)) return fail();
      const completed = await database.client.transaction(async (tx) => {
        const row = (await tx.query<{ id: string; user_id: string | null; state: string; expires_at: Date; registration_challenge_id: string | null; registration_challenge: string | null; registration_expected_origin: string | null; registration_expected_rp_id: string | null; registration_expires_at: Date | null }>(
          "SELECT id,user_id,state,expires_at,registration_challenge_id,registration_challenge,registration_expected_origin,registration_expected_rp_id,registration_expires_at FROM device_link_requests WHERE id=$1 AND tenant_id=$2 AND application_id=$3 AND token_digest=$4 FOR UPDATE",
          [requestId, ...scopeValues(scope), digestToken(transaction)])).rows[0];
        if (!row || row.state !== "APPROVED" || !row.user_id || row.expires_at <= new Date() || row.registration_challenge_id !== challengeId
          || !row.registration_challenge || !row.registration_expected_origin || !row.registration_expected_rp_id || !row.registration_expires_at || row.registration_expires_at <= new Date()) return null;
        const consumed = await tx.query("UPDATE device_link_requests SET registration_challenge_id=NULL,registration_challenge=NULL,registration_expected_origin=NULL,registration_expected_rp_id=NULL,registration_expires_at=NULL WHERE id=$1 AND tenant_id=$2 AND application_id=$3 AND state='APPROVED' AND registration_challenge_id=$4 AND registration_expires_at>now() RETURNING id",
          [requestId, ...scopeValues(scope), challengeId]);
        if (!consumed.rows.length) return null;
        const user = (await tx.query<UserRow>("SELECT id,email,display_name,role,passkey_enrollment_required FROM users WHERE tenant_id=$1 AND application_id=$2 AND id=$3 AND deleted_at IS NULL", [...scopeValues(scope), row.user_id])).rows[0];
        if (!user) return null;
        try {
          requireTopLevelClientData(response.response.clientDataJSON);
          const currentApp = await application(tx, scope, row.registration_expected_origin);
          if (currentApp.rp_id !== row.registration_expected_rp_id) return null;
          const verified = await verifyRegistrationResponse({ response, expectedChallenge: row.registration_challenge, expectedOrigin: row.registration_expected_origin,
            expectedRPID: row.registration_expected_rp_id, requireUserVerification: true, requireUserPresence: true, supportedAlgorithmIDs: [-7, -257] });
          if (!verified.verified) return null;
          const info = verified.registrationInfo;
          const inserted = await tx.query<{ id: string }>("INSERT INTO webauthn_credentials(id,tenant_id,application_id,user_id,credential_id,public_key,counter,transports,device_type,backed_up) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10) ON CONFLICT (tenant_id,application_id,credential_id) DO NOTHING RETURNING id",
            [randomUUID(), ...scopeValues(scope), user.id, info.credential.id, Buffer.from(info.credential.publicKey).toString("base64url"), info.credential.counter, JSON.stringify(info.credential.transports ?? []), info.credentialDeviceType, info.credentialBackedUp]);
          if (!inserted.rows.length) return null;
          await tx.query("INSERT INTO user_resources(id,tenant_id,application_id,user_id,kind,data) VALUES ($1,$2,$3,$4,'passkey',$5)",
            [`passkey-${inserted.rows[0]!.id}`, ...scopeValues(scope), user.id, JSON.stringify({ credentialRecordId: inserted.rows[0]!.id, revoked: false })]);
          const marked = await tx.query("UPDATE device_link_requests SET state='COMPLETED',completed_at=now() WHERE id=$1 AND tenant_id=$2 AND application_id=$3 AND user_id=$4 AND state='APPROVED' AND expires_at>now() RETURNING id",
            [requestId, ...scopeValues(scope), user.id]);
          if (!marked.rows.length) return null;
          await audit(tx, scope, correlationId, "AUTH_PASSKEY_ADDED", "SUCCESS", user.id);
          await audit(tx, scope, correlationId, "AUTH_DEVICE_LINK_COMPLETED", "SUCCESS", user.id);
          return newSession(tx, scope, user, correlationId);
        } catch { return null; }
      });
      return completed ?? fail();
    },
    async deviceLinkCancel(scope: ApplicationScope, requestId: string, transaction: string) {
      if (!/^[A-Za-z0-9_-]{43}$/.test(transaction)) return fail();
      const updated = await database.client.query("UPDATE device_link_requests SET state='CANCELLED',approval_session_id=NULL,approval_challenge_id=NULL,approval_challenge=NULL,approval_expected_origin=NULL,approval_expected_rp_id=NULL,approval_expires_at=NULL,registration_challenge_id=NULL,registration_challenge=NULL,registration_expected_origin=NULL,registration_expected_rp_id=NULL,registration_expires_at=NULL WHERE id=$1 AND tenant_id=$2 AND application_id=$3 AND token_digest=$4 AND state IN ('PENDING','APPROVED') AND expires_at>now() RETURNING id",
        [requestId, ...scopeValues(scope), digestToken(transaction)]);
      if (!updated.rows.length) return fail();
      return { status: "CANCELLED" as const };
    },
    async reclaimStart(scope: ApplicationScope, accountId: string, correlationId: string) {
      const transaction = token();
      await database.client.transaction(async (tx) => {
        const user = await lookupUserById(tx, scope, accountId);
        await tx.query("INSERT INTO reclaim_transactions(id,tenant_id,application_id,user_id,account_digest,token_digest,state,expires_at) VALUES ($1,$2,$3,$4,$5,$6,'NOT_STARTED',now()+interval '10 minutes')",
          [randomUUID(), ...scopeValues(scope), user?.id ?? null, digestToken(accountId), digestToken(transaction)]);
        await audit(tx, scope, correlationId, "AUTH_RECOVERY_STARTED", "INFO", user?.id);
      });
      return { status: "accepted" as const, transaction, expiresIn: 600 };
    },
    async reclaimVerify(scope: ApplicationScope, input: { accountId: string; transaction: string; recoveryCode: string }, correlationId: string) {
      const accepted = await database.client.transaction(async (tx) => {
        const row = (await tx.query<{ id: string; user_id: string | null; state: string; failed_attempts: number; expires_at: Date }>(
          "SELECT id,user_id,state,failed_attempts,expires_at FROM reclaim_transactions WHERE token_digest=$1 AND tenant_id=$2 AND application_id=$3 AND account_digest=$4 FOR UPDATE",
          [digestToken(input.transaction), ...scopeValues(scope), digestToken(input.accountId)],
        )).rows[0];
        if (!row) return false;
        if (row.expires_at <= new Date()) {
          await tx.query("UPDATE reclaim_transactions SET state='EXPIRED' WHERE id=$1 AND tenant_id=$2 AND application_id=$3 AND state IN ('NOT_STARTED','CODE_VERIFIED','ENROLLMENT_PENDING')", [row.id, ...scopeValues(scope)]);
          return false;
        }
        if (row.state !== "NOT_STARTED" || row.failed_attempts >= 5) return false;
        const user = row.user_id ? (await tx.query<UserRow>("SELECT id,email,display_name,role,passkey_enrollment_required FROM users WHERE tenant_id=$1 AND application_id=$2 AND id=$3 AND deleted_at IS NULL", [...scopeValues(scope), row.user_id])).rows[0] : undefined;
        const codes = user ? (await tx.query<{ id: string; verifier: string }>("SELECT id,verifier FROM recovery_codes WHERE tenant_id=$1 AND application_id=$2 AND user_id=$3 AND consumed_at IS NULL", [...scopeValues(scope), user.id])).rows : [];
        const match = codes.find((item) => matchesRecoveryCode(input.recoveryCode, item.verifier));
        if (!user || !match) {
          await tx.query("UPDATE reclaim_transactions SET failed_attempts=LEAST(failed_attempts+1,5),state=CASE WHEN failed_attempts>=4 THEN 'EXPIRED' ELSE state END WHERE id=$1 AND tenant_id=$2 AND application_id=$3 AND state='NOT_STARTED' AND failed_attempts<5", [row.id, ...scopeValues(scope)]);
          await audit(tx, scope, correlationId, "AUTH_RECOVERY_FAILED", "FAILURE", user?.id);
          return false;
        }
        const consumed = await tx.query("UPDATE recovery_codes SET consumed_at=now() WHERE id=$1 AND tenant_id=$2 AND application_id=$3 AND user_id=$4 AND consumed_at IS NULL RETURNING id", [match.id, ...scopeValues(scope), user.id]);
        if (!consumed.rows.length) return false;
        const changed = await tx.query("UPDATE reclaim_transactions SET state='CODE_VERIFIED',recovery_code_id=$1 WHERE id=$2 AND tenant_id=$3 AND application_id=$4 AND user_id=$5 AND state='NOT_STARTED' AND failed_attempts<5 AND expires_at>now() RETURNING id", [match.id, row.id, ...scopeValues(scope), user.id]);
        if (!changed.rows.length) throw new AuthenticationError();
        await audit(tx, scope, correlationId, "AUTH_RECOVERY_CODE_VERIFIED", "SUCCESS", user.id);
        return true;
      });
      if (!accepted) return fail();
      return { status: "verified" as const, expiresIn: 600 };
    },
    async reclaimRegistrationOptions(scope: ApplicationScope, transaction: string, origin: string) {
      const result = await database.client.transaction(async (tx) => {
        const row = (await tx.query<{ id: string; user_id: string | null; state: string; expires_at: Date }>(
          "SELECT id,user_id,state,expires_at FROM reclaim_transactions WHERE token_digest=$1 AND tenant_id=$2 AND application_id=$3 FOR UPDATE",
          [digestToken(transaction), ...scopeValues(scope)],
        )).rows[0];
        if (!row) return null;
        if (row.expires_at <= new Date()) {
          await tx.query("UPDATE reclaim_transactions SET state='EXPIRED' WHERE id=$1 AND tenant_id=$2 AND application_id=$3 AND state IN ('NOT_STARTED','CODE_VERIFIED','ENROLLMENT_PENDING')", [row.id, ...scopeValues(scope)]);
          return null;
        }
        if (!row.user_id || !["CODE_VERIFIED", "ENROLLMENT_PENDING"].includes(row.state)) return null;
        const user = (await tx.query<UserRow>("SELECT id,email,display_name,role,passkey_enrollment_required FROM users WHERE tenant_id=$1 AND application_id=$2 AND id=$3 AND deleted_at IS NULL", [...scopeValues(scope), row.user_id])).rows[0];
        if (!user) return null;
        const app = await application(tx, scope, origin);
        await tx.query("UPDATE webauthn_challenges SET consumed_at=now() WHERE tenant_id=$1 AND application_id=$2 AND user_id=$3 AND purpose='recovery_registration' AND consumed_at IS NULL", [...scopeValues(scope), user.id]);
        const credentials = (await tx.query<CredentialRow>("SELECT id,user_id,credential_id,public_key,counter,transports FROM webauthn_credentials WHERE tenant_id=$1 AND application_id=$2 AND user_id=$3", [...scopeValues(scope), user.id])).rows;
        const options = await generateRegistrationOptions({ rpName: app.name, rpID: app.rp_id, userName: user.id, userID: new Uint8Array(Buffer.from(user.id)), userDisplayName: user.display_name,
          timeout: 300_000, attestationType: "none", supportedAlgorithmIDs: [-7, -257], authenticatorSelection: { residentKey: "required", userVerification: "required" },
          excludeCredentials: credentials.map((credential) => ({ id: credential.credential_id, transports: credential.transports })) });
        const challengeId = randomUUID();
        await tx.query("INSERT INTO webauthn_challenges(id,tenant_id,application_id,user_id,session_id,purpose,challenge,expected_origin,expected_rp_id,expires_at) VALUES ($1,$2,$3,$4,NULL,'recovery_registration',$5,$6,$7,now()+interval '5 minutes')",
          [challengeId, ...scopeValues(scope), user.id, options.challenge, origin, app.rp_id]);
        await tx.query("UPDATE reclaim_transactions SET state='ENROLLMENT_PENDING' WHERE id=$1 AND tenant_id=$2 AND application_id=$3 AND state IN ('CODE_VERIFIED','ENROLLMENT_PENDING')", [row.id, ...scopeValues(scope)]);
        return { challengeId, options };
      });
      return result ?? fail();
    },
    async reclaimRegistrationVerify(scope: ApplicationScope, transaction: string, challengeId: string, response: RegistrationResponseJSON, correlationId: string) {
      const completed = await database.client.transaction(async (tx) => {
        const row = (await tx.query<{ id: string; user_id: string | null; state: string; expires_at: Date }>(
          "SELECT id,user_id,state,expires_at FROM reclaim_transactions WHERE token_digest=$1 AND tenant_id=$2 AND application_id=$3 FOR UPDATE",
          [digestToken(transaction), ...scopeValues(scope)],
        )).rows[0];
        if (!row) return null;
        if (row.expires_at <= new Date()) {
          await tx.query("UPDATE reclaim_transactions SET state='EXPIRED' WHERE id=$1 AND tenant_id=$2 AND application_id=$3 AND state IN ('CODE_VERIFIED','ENROLLMENT_PENDING')", [row.id, ...scopeValues(scope)]);
          return null;
        }
        if (row.state !== "ENROLLMENT_PENDING" || !row.user_id) return null;
        const user = (await tx.query<UserRow>("SELECT id,email,display_name,role,passkey_enrollment_required FROM users WHERE tenant_id=$1 AND application_id=$2 AND id=$3 AND deleted_at IS NULL", [...scopeValues(scope), row.user_id])).rows[0];
        if (!user) return null;
        const challenge = (await tx.query<ChallengeRow>(
          "UPDATE webauthn_challenges SET consumed_at=now() WHERE id=$1 AND tenant_id=$2 AND application_id=$3 AND user_id=$4 AND session_id IS NULL AND purpose='recovery_registration' AND consumed_at IS NULL AND expires_at>now() RETURNING id,challenge,user_id,session_id,expected_origin,expected_rp_id",
          [challengeId, ...scopeValues(scope), user.id],
        )).rows[0];
        if (!challenge?.expected_origin || !challenge.expected_rp_id) return null;
        try {
          requireTopLevelClientData(response.response.clientDataJSON);
          const app = await application(tx, scope, challenge.expected_origin);
          if (app.rp_id !== challenge.expected_rp_id) {
            await audit(tx, scope, correlationId, "AUTH_RECOVERY_FAILED", "FAILURE", user.id);
            return null;
          }
          const verified = await verifyRegistrationResponse({ response, expectedChallenge: challenge.challenge, expectedOrigin: challenge.expected_origin, expectedRPID: challenge.expected_rp_id,
            requireUserVerification: true, requireUserPresence: true, supportedAlgorithmIDs: [-7, -257] });
          if (!verified.verified) {
            await audit(tx, scope, correlationId, "AUTH_RECOVERY_FAILED", "FAILURE", user.id);
            return null;
          }
          const info = verified.registrationInfo;
          const inserted = await tx.query<{ id: string }>("INSERT INTO webauthn_credentials(id,tenant_id,application_id,user_id,credential_id,public_key,counter,transports,device_type,backed_up) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10) ON CONFLICT (tenant_id,application_id,credential_id) DO NOTHING RETURNING id",
            [randomUUID(), ...scopeValues(scope), user.id, info.credential.id, Buffer.from(info.credential.publicKey).toString("base64url"), info.credential.counter, JSON.stringify(info.credential.transports ?? []), info.credentialDeviceType, info.credentialBackedUp]);
          if (!inserted.rows.length) {
            await audit(tx, scope, correlationId, "AUTH_RECOVERY_FAILED", "FAILURE", user.id);
            return null;
          }
          await tx.query("UPDATE user_resources SET data=data || '{\"revoked\":true}'::jsonb WHERE tenant_id=$1 AND application_id=$2 AND user_id=$3 AND kind='passkey'", [...scopeValues(scope), user.id]);
          await tx.query("DELETE FROM webauthn_credentials WHERE tenant_id=$1 AND application_id=$2 AND user_id=$3 AND id<>$4", [...scopeValues(scope), user.id, inserted.rows[0]!.id]);
          await tx.query("INSERT INTO user_resources(id,tenant_id,application_id,user_id,kind,data) VALUES ($1,$2,$3,$4,'passkey',$5)",
            [`passkey-${inserted.rows[0]!.id}`, ...scopeValues(scope), user.id, JSON.stringify({ credentialRecordId: inserted.rows[0]!.id, revoked: false })]);
          await tx.query("UPDATE sessions SET revoked_at=now() WHERE tenant_id=$1 AND application_id=$2 AND user_id=$3 AND revoked_at IS NULL", [...scopeValues(scope), user.id]);
          await tx.query("UPDATE webauthn_challenges SET consumed_at=now() WHERE tenant_id=$1 AND application_id=$2 AND user_id=$3 AND consumed_at IS NULL", [...scopeValues(scope), user.id]);
          await tx.query("UPDATE users SET passkey_enrollment_required=false WHERE tenant_id=$1 AND application_id=$2 AND id=$3", [...scopeValues(scope), user.id]);
          const codes = newRecoveryCodes();
          await tx.query("UPDATE recovery_codes SET consumed_at=now() WHERE tenant_id=$1 AND application_id=$2 AND user_id=$3 AND consumed_at IS NULL", [...scopeValues(scope), user.id]);
          for (const code of codes) await tx.query("INSERT INTO recovery_codes(id,tenant_id,application_id,user_id,verifier) VALUES ($1,$2,$3,$4,$5)", [randomUUID(), ...scopeValues(scope), user.id, recoveryCodeVerifier(code)]);
          const marked = await tx.query("UPDATE reclaim_transactions SET state='COMPLETED',completed_at=now() WHERE id=$1 AND tenant_id=$2 AND application_id=$3 AND user_id=$4 AND state='ENROLLMENT_PENDING' AND expires_at>now() RETURNING id", [row.id, ...scopeValues(scope), user.id]);
          if (!marked.rows.length) throw new ReclaimCommitError();
          await tx.query("UPDATE reclaim_transactions SET state='CANCELLED' WHERE tenant_id=$1 AND application_id=$2 AND user_id=$3 AND id<>$4 AND state IN ('NOT_STARTED','CODE_VERIFIED','ENROLLMENT_PENDING')", [...scopeValues(scope), user.id, row.id]);
          await audit(tx, scope, correlationId, "AUTH_PASSKEY_ADDED", "SUCCESS", user.id);
          await audit(tx, scope, correlationId, "AUTH_RECOVERY_COMPLETED", "SUCCESS", user.id);
          return { recoveryCodes: codes };
        } catch (error) {
          if (error instanceof ReclaimCommitError) throw error;
          await audit(tx, scope, correlationId, "AUTH_RECOVERY_FAILED", "FAILURE", user.id);
          return null;
        }
      });
      if (!completed) return fail();
      return { status: "completed" as const, recoveryCodes: completed.recoveryCodes };
    },
    async reclaimCancel(scope: ApplicationScope, transaction: string) {
      const result = await database.client.transaction(async (tx) => {
        const row = (await tx.query<{ id: string; user_id: string | null; expires_at: Date }>("SELECT id,user_id,expires_at FROM reclaim_transactions WHERE token_digest=$1 AND tenant_id=$2 AND application_id=$3 AND state IN ('NOT_STARTED','CODE_VERIFIED','ENROLLMENT_PENDING') FOR UPDATE", [digestToken(transaction), ...scopeValues(scope)])).rows[0];
        if (!row) return false;
        const state = row.expires_at <= new Date() ? "EXPIRED" : "CANCELLED";
        await tx.query("UPDATE reclaim_transactions SET state=$1 WHERE id=$2 AND tenant_id=$3 AND application_id=$4", [state, row.id, ...scopeValues(scope)]);
        if (row.user_id) await tx.query("UPDATE webauthn_challenges SET consumed_at=now() WHERE tenant_id=$1 AND application_id=$2 AND user_id=$3 AND purpose='recovery_registration' AND consumed_at IS NULL", [...scopeValues(scope), row.user_id]);
        return true;
      });
      if (!result) return fail();
      return { status: "cancelled" as const };
    },
  };
}
