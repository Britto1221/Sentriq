import { randomBytes, randomUUID } from "node:crypto";
import type { Transaction } from "@electric-sql/pglite";
import { generateAuthenticationOptions, verifyAuthenticationResponse, type AuthenticationResponseJSON, type AuthenticatorTransport } from "@simplewebauthn/server";
import { policyModeSchema, type EvaluationRequest, type EvaluationResult } from "@sentriq/shared";
import type { ApplicationScope } from "../app";
import type { ApiConfig } from "../config";
import { digestToken, type Database } from "../db/index";
import { AuthenticationError, requireTopLevelClientData } from "../auth/service";
import { decide } from "./engine";

const token = () => randomBytes(32).toString("base64url");
const scoped = (scope: ApplicationScope) => [scope.tenantId, scope.applicationId];
const fail = (): never => { throw new AuthenticationError(); };
export class PolicyUnavailableError extends Error { constructor() { super("Policy unavailable"); } }
interface Session { user_id: string; id: string }
interface Policy { mode: "ALLOW" | "STEP_UP" | "DENY"; version: number; enabled: boolean }
interface Challenge { id: string; challenge: string; action_id: string; resource_id: string; policy_version: number; expected_origin: string | null; expected_rp_id: string | null }

export function createPolicyService(database: Database, config: ApiConfig) {
  const session = async (tx: Transaction, scope: ApplicationScope, opaque?: string): Promise<Session> => {
    if (!opaque || !/^[A-Za-z0-9_-]{43}$/.test(opaque)) return fail();
    const row = (await tx.query<Session>("SELECT s.user_id,s.id FROM sessions s JOIN users u ON u.id=s.user_id AND u.tenant_id=s.tenant_id AND u.application_id=s.application_id WHERE s.tenant_id=$1 AND s.application_id=$2 AND s.token_digest=$3 AND s.revoked_at IS NULL AND s.expires_at>now() AND u.deleted_at IS NULL FOR UPDATE OF s", [...scoped(scope), digestToken(opaque)])).rows[0];
    return row ?? fail();
  };
  const resource = async (tx: Transaction, scope: ApplicationScope, owner: Session, id: string) => {
    if (!(await tx.query("SELECT id FROM user_resources WHERE tenant_id=$1 AND application_id=$2 AND user_id=$3 AND id=$4", [...scoped(scope), owner.user_id, id])).rows.length) return fail();
  };
  const policy = async (tx: Transaction, scope: ApplicationScope, action: string): Promise<Policy> => {
    const row = (await tx.query<Policy>("SELECT p.mode,p.version,p.enabled FROM policies p JOIN protected_actions a ON a.tenant_id=p.tenant_id AND a.application_id=p.application_id AND a.action_id=p.action_id WHERE p.tenant_id=$1 AND p.application_id=$2 AND p.action_id=$3 AND a.enabled=true ORDER BY p.version DESC LIMIT 1", [...scoped(scope), action])).rows[0];
    if (!row?.enabled || !policyModeSchema.safeParse(row.mode).success || !Number.isSafeInteger(row.version) || row.version < 1) throw new PolicyUnavailableError();
    return row;
  };
  const audit = async (tx: Transaction, scope: ApplicationScope, owner: Session, actionId: string, resourceId: string, result: EvaluationResult, type = "ACTION_EVALUATED") => {
    await tx.query("INSERT INTO audit_events(id,tenant_id,application_id,subject_id,session_id,type,outcome,action_id,resource_id,decision,policy_version,reason_code,correlation_id) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13)",
      [randomUUID(), ...scoped(scope), owner.user_id, owner.id, type, type === "AUTH_STEP_UP_FAILED" ? "FAILURE" : result.decision === "ALLOW" ? "SUCCESS" : result.decision === "STEP_UP" ? "REQUIRED" : "DENIED", actionId, resourceId, result.decision, result.policyVersion, result.reasonCode, result.correlationId]);
  };
  const application = async (tx: Transaction, scope: ApplicationScope, origin: string) => {
    const row = (await tx.query<{ origins: string[]; rp_id: string }>("SELECT origins,rp_id FROM applications WHERE tenant_id=$1 AND id=$2", scoped(scope))).rows[0];
    if (!row?.origins.includes(origin)) return fail();
    const parsed = new URL(origin); const local = ["localhost", "127.0.0.1", "[::1]"].includes(parsed.hostname);
    if (origin !== parsed.origin || parsed.username || parsed.password || (parsed.protocol !== "https:" && !(config.nodeEnv !== "production" && local && parsed.protocol === "http:")) || (parsed.hostname !== row.rp_id && !parsed.hostname.endsWith(`.${row.rp_id}`))) return fail();
    return row;
  };
  const challenge = async (tx: Transaction, scope: ApplicationScope, owner: Session, id: string, consume = false) => {
    const where = "id=$1 AND tenant_id=$2 AND application_id=$3 AND user_id=$4 AND session_id=$5 AND purpose='step_up' AND consumed_at IS NULL AND expires_at>now()";
    const row = (await tx.query<Challenge>(consume ? `UPDATE webauthn_challenges SET consumed_at=now() WHERE ${where} RETURNING *` : `SELECT * FROM webauthn_challenges WHERE ${where}`, [id, ...scoped(scope), owner.user_id, owner.id])).rows[0];
    return row ?? fail();
  };
  return {
    async evaluate(scope: ApplicationScope, input: EvaluationRequest, opaque: string | undefined, correlationId: string) {
      return database.client.transaction(async (tx) => {
        const owner = await session(tx, scope, opaque);
        if (input.applicationId !== scope.applicationId || input.userId !== owner.user_id || input.sessionId !== owner.id) return fail();
        await resource(tx, scope, owner, input.resourceId);
        const current = await policy(tx, scope, input.actionId);
        const result: EvaluationResult = { ...decide(current.mode), policyVersion: current.version, correlationId };
        // DENY is final. A stale, unrelated, or replayed grant never falls back to an ALLOW policy.
        if (result.decision !== "DENY" && input.stepUpGrantId !== undefined) {
          const consumed = /^[A-Za-z0-9_-]{43}$/.test(input.stepUpGrantId) ? await tx.query("UPDATE step_up_grants SET consumed_at=now() WHERE grant_digest=$1 AND tenant_id=$2 AND application_id=$3 AND user_id=$4 AND session_id=$5 AND action_id=$6 AND resource_id=$7 AND policy_version=$8 AND expires_at>now() AND consumed_at IS NULL RETURNING id", [digestToken(input.stepUpGrantId), ...scoped(scope), owner.user_id, owner.id, input.actionId, input.resourceId, current.version]) : { rows: [] };
          result.decision = consumed.rows.length === 1 ? "ALLOW" : "DENY";
          result.reasonCode = consumed.rows.length === 1 ? "step_up_verified" : "invalid_step_up_grant";
        } else if (result.decision === "STEP_UP") {
          const id = randomUUID();
          await tx.query("INSERT INTO webauthn_challenges(id,tenant_id,application_id,user_id,session_id,purpose,challenge,action_id,resource_id,policy_version,expires_at) VALUES ($1,$2,$3,$4,$5,'step_up',$6,$7,$8,$9,now()+interval '2 minutes')", [id, ...scoped(scope), owner.user_id, owner.id, token(), input.actionId, input.resourceId, current.version]);
          result.stepUpChallengeId = id;
        }
        await audit(tx, scope, owner, input.actionId, input.resourceId, result);
        if (result.decision !== "ALLOW") await audit(tx, scope, owner, input.actionId, input.resourceId, result, result.decision === "STEP_UP" ? "AUTH_STEP_UP_REQUIRED" : "AUTH_POLICY_DENIED");
        return result;
      });
    },
    async options(scope: ApplicationScope, id: string, origin: string, opaque?: string) {
      return database.client.transaction(async (tx) => {
        const owner = await session(tx, scope, opaque); const pending = await challenge(tx, scope, owner, id); await resource(tx, scope, owner, pending.resource_id);
        const current = await policy(tx, scope, pending.action_id);
        if (current.version !== pending.policy_version || current.mode === "DENY") return fail();
        const registered = await application(tx, scope, origin);
        if ((pending.expected_origin && pending.expected_origin !== origin) || (pending.expected_rp_id && pending.expected_rp_id !== registered.rp_id)) return fail();
        const credentials = (await tx.query<{ credential_id: string; transports: string[] }>("SELECT credential_id,transports FROM webauthn_credentials WHERE tenant_id=$1 AND application_id=$2 AND user_id=$3", [...scoped(scope), owner.user_id])).rows;
        if (!credentials.length) return fail();
        const options = await generateAuthenticationOptions({ rpID: registered.rp_id, challenge: new Uint8Array(Buffer.from(pending.challenge, "base64url")), timeout: 120_000, userVerification: "required", allowCredentials: credentials.map((credential) => ({ id: credential.credential_id, transports: credential.transports })) });
        await tx.query("UPDATE webauthn_challenges SET expected_origin=$1,expected_rp_id=$2 WHERE id=$3 AND tenant_id=$4 AND application_id=$5", [origin, registered.rp_id, id, ...scoped(scope)]);
        return { challengeId: id, options };
      });
    },
    async verify(scope: ApplicationScope, id: string, response: AuthenticationResponseJSON, opaque: string | undefined, correlationId: string) {
      const accepted = await database.client.transaction(async (tx) => {
        const owner = await session(tx, scope, opaque); const pending = await challenge(tx, scope, owner, id, true);
        await resource(tx, scope, owner, pending.resource_id); const current = await policy(tx, scope, pending.action_id);
        const decision = { ...decide(current.mode), policyVersion: current.version, correlationId };
        const rejected = async () => { await audit(tx, scope, owner, pending.action_id, pending.resource_id, { ...decision, decision: "DENY", reasonCode: "invalid_step_up_assertion" }, "AUTH_STEP_UP_FAILED"); return null; };
        if (current.version !== pending.policy_version || decision.decision === "DENY" || !pending.expected_origin || !pending.expected_rp_id) return rejected();
        const credential = (await tx.query<{ id: string; credential_id: string; public_key: string; counter: number; transports: AuthenticatorTransport[] }>("SELECT id,credential_id,public_key,counter,transports FROM webauthn_credentials WHERE tenant_id=$1 AND application_id=$2 AND user_id=$3 AND credential_id=$4", [...scoped(scope), owner.user_id, response.id])).rows[0];
        if (!credential || response.response.userHandle !== Buffer.from(owner.user_id).toString("base64url")) return rejected();
        let verified: Awaited<ReturnType<typeof verifyAuthenticationResponse>>;
        try {
          requireTopLevelClientData(response.response.clientDataJSON);
          const registered = await application(tx, scope, pending.expected_origin);
          if (registered.rp_id !== pending.expected_rp_id) return rejected();
          verified = await verifyAuthenticationResponse({ response, expectedChallenge: pending.challenge, expectedOrigin: pending.expected_origin, expectedRPID: pending.expected_rp_id, requireUserVerification: true,
            credential: { id: credential.credential_id, publicKey: new Uint8Array(Buffer.from(credential.public_key, "base64url")), counter: credential.counter, transports: credential.transports } });
        } catch { return rejected(); }
        if (!verified.verified) return rejected();
        await tx.query("UPDATE webauthn_credentials SET counter=$1,device_type=$2,backed_up=$3 WHERE id=$4 AND tenant_id=$5 AND application_id=$6 AND user_id=$7", [verified.authenticationInfo.newCounter, verified.authenticationInfo.credentialDeviceType, verified.authenticationInfo.credentialBackedUp, credential.id, ...scoped(scope), owner.user_id]);
        const opaqueGrant = token();
        const row = (await tx.query<{ expires_at: Date }>("INSERT INTO step_up_grants(id,tenant_id,application_id,user_id,session_id,challenge_id,action_id,resource_id,grant_digest,policy_version,expires_at) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,now()+interval '1 minute') RETURNING expires_at", [randomUUID(), ...scoped(scope), owner.user_id, owner.id, id, pending.action_id, pending.resource_id, digestToken(opaqueGrant), current.version])).rows[0]!;
        await audit(tx, scope, owner, pending.action_id, pending.resource_id, { ...decision, decision: "ALLOW", reasonCode: "step_up_verified" }, "AUTH_STEP_UP_SUCCEEDED");
        return { stepUpGrantId: opaqueGrant, expiresAt: row.expires_at.toISOString() };
      });
      return accepted ?? fail();
    },
  };
}
