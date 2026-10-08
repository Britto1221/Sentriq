import { randomBytes, randomUUID } from "node:crypto";
import { readFile } from "node:fs/promises";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { buildApp } from "../app";
import { digestToken, migrateDatabase, openDatabase, type Database } from "../db/index";
import { TestAuthenticator } from "../auth/test-authenticator";
import { SentriqClient } from "../../../../packages/sdk/src/index";

const opaque = () => randomBytes(32).toString("base64url");
const key = opaque(); const otherKey = opaque(); const origin = "http://localhost:3001";
let db: Database; let app: Awaited<ReturnType<typeof buildApp>>;
let user: string; let bob: string; let session: string; let session2: string; let token: string; let token2: string; let resource: string; let resource2: string; let bobsResource: string;
let registeredAuthenticator: TestAuthenticator | undefined;
function post(path: string, body: object, sessionToken: string | undefined = token, applicationKey = key) {
  return app.inject({ method: "POST", url: path, payload: body, headers: { "x-sentriq-api-key": applicationKey, ...(sessionToken ? { "x-sentriq-session-token": sessionToken } : {}) } });
}
function input(actionId = "data.export") { return { applicationId: "policy-app", userId: user, sessionId: session, actionId, resourceId: resource }; }
async function evaluated(actionId = "data.export") { return post("/v1/evaluations", input(actionId)); }
async function enrollment() {
  if (registeredAuthenticator) return registeredAuthenticator;
  const email = (await db.client.query<{ email: string }>("SELECT email FROM users WHERE id=$1", [user])).rows[0]!.email;
  expect((await post("/v1/auth/registration/start", { email }, "")).statusCode).toBe(200);
  const inbox = await post("/v1/auth/dev/email-inbox", { email }, "");
  expect(inbox.statusCode).toBe(200);
  const verified = await post("/v1/auth/registration/verify", { email, code: inbox.json().verificationCode }, "");
  expect(verified.statusCode).toBe(200);
  const auth = new TestAuthenticator();
  const headers = { "x-sentriq-api-key": key, "x-sentriq-registration-token": verified.json().registrationToken as string };
  const options = await app.inject({ method: "POST", url: "/v1/auth/webauthn/register/options", headers, payload: { origin } });
  expect(options.statusCode, options.body).toBe(200);
  const completed = await app.inject({ method: "POST", url: "/v1/auth/webauthn/register/verify", headers, payload: {
    challengeId: options.json().challengeId, response: auth.registration(options.json().options.challenge),
  } });
  expect(completed.statusCode, completed.body).toBe(200);
  registeredAuthenticator = auth;
  return registeredAuthenticator;
}
async function grant(auth: TestAuthenticator) {
  const decision = await evaluated(); expect(decision.statusCode).toBe(200); expect(decision.json().decision).toBe("STEP_UP");
  const challengeId = decision.json().stepUpChallengeId;
  const options = await post("/v1/step-up/options", { challengeId, origin }); expect(options.statusCode).toBe(200);
  const verified = await post("/v1/step-up/verify", { challengeId, response: auth.assertion(options.json().options.challenge, user) });
  expect(verified.statusCode).toBe(200); return verified.json().stepUpGrantId as string;
}
beforeAll(async () => {
  db = await openDatabase("memory://"); await migrateDatabase(db.client);
  await db.client.exec(`INSERT INTO tenants(id,name) VALUES ('policy-tenant','Synthetic'),('other-tenant','Synthetic');
    INSERT INTO applications(id,tenant_id,name,origins,rp_id) VALUES ('policy-app','policy-tenant','Synthetic','["${origin}"]','localhost'),('other-policy-app','other-tenant','Synthetic','["${origin}"]','localhost');`);
  await db.client.query("INSERT INTO application_api_keys(id,tenant_id,application_id,digest) VALUES ('policy-key','policy-tenant','policy-app',$1),('other-policy-key','other-tenant','other-policy-app',$2)", [digestToken(key), digestToken(otherKey)]);
  for (const [action, mode, version] of [["data.export", "STEP_UP", 1], ["account.delete", "DENY", 2], ["security.settings.change", "ALLOW", 3], ["session.revoke", "ALLOW", 4]] as const) {
    await db.client.query("INSERT INTO protected_actions(id,tenant_id,application_id,action_id) VALUES ($1,'policy-tenant','policy-app',$2)", [randomUUID(), action]);
    await db.client.query("INSERT INTO policies(id,tenant_id,application_id,action_id,mode,version) VALUES ($1,'policy-tenant','policy-app',$2,$3,$4)", [randomUUID(), action, mode, version]);
  }
  app = await buildApp({ database: db, config: { nodeEnv: "test", host: "127.0.0.1", port: 4000, dataDir: "memory://", rateLimitMax: 1000, rateLimitWindowMs: 60_000, logLevel: "silent" } });
}, 60_000);
beforeEach(async () => {
  registeredAuthenticator = undefined;
  user = randomUUID(); bob = randomUUID(); session = randomUUID(); session2 = randomUUID(); token = opaque(); token2 = opaque(); resource = randomUUID(); resource2 = randomUUID(); bobsResource = randomUUID();
  for (const id of [user, bob]) await db.client.query("INSERT INTO users(id,tenant_id,application_id,email,display_name) VALUES ($1,'policy-tenant','policy-app',$2,'Synthetic')", [id, `${id}@synthetic.test`]);
  for (const [id, secret] of [[session, token], [session2, token2]]) await db.client.query("INSERT INTO sessions(id,tenant_id,application_id,user_id,token_digest,expires_at) VALUES ($1,'policy-tenant','policy-app',$2,$3,now()+interval '12 hours')", [id, user, digestToken(secret!)]);
  for (const [id, owner] of [[resource, user], [resource2, user], [bobsResource, bob]]) await db.client.query("INSERT INTO user_resources(id,tenant_id,application_id,user_id,kind) VALUES ($1,'policy-tenant','policy-app',$2,'profile')", [id, owner]);
});
afterAll(async () => { await app?.close(); await db?.client.close(); });

describe("persistent deterministic enforcement", { timeout: 60_000 }, () => {
  it("upgrades stored contextual policies to the stricter step-up mode", async () => {
    const id = randomUUID();
    await db.client.exec("ALTER TABLE policies DROP CONSTRAINT policies_mode_check");
    await db.client.query("INSERT INTO policies(id,tenant_id,application_id,action_id,mode,version) VALUES ($1,'policy-tenant','policy-app','data.export','CONTEXTUAL_RISK',99)", [id]);
    const migration = await readFile(new URL("../../migrations/0007_deterministic_policy_modes.sql", import.meta.url), "utf8");
    try {
      const upgrade = migration.replace("ALTER TABLE policies DROP CONSTRAINT policies_mode_check;", "");
      expect(upgrade === migration).toBe(false);
      await db.client.exec(upgrade);
      expect((await db.client.query<{ mode: string }>("SELECT mode FROM policies WHERE id=$1", [id])).rows[0]?.mode).toBe("STEP_UP");
      await expect(db.client.query("INSERT INTO policies(id,tenant_id,application_id,action_id,mode,version) VALUES ($1,'policy-tenant','policy-app','data.export','CONTEXTUAL_RISK',100)", [randomUUID()])).rejects.toMatchObject({ code: "23514" });
    } finally { await db.client.query("DELETE FROM policies WHERE id=$1", [id]); }
  });

  it("accepts only explicit deterministic policy modes in persisted configuration", async () => {
    await expect(db.client.query("INSERT INTO policies(id,tenant_id,application_id,action_id,mode,version) VALUES ($1,'policy-tenant','policy-app','data.export','CONTEXTUAL_RISK',99)", [randomUUID()])).rejects.toMatchObject({ code: "23514" });
  });
  it("returns persisted ALLOW/STEP_UP/DENY versions and records explicit safe decision evidence", async () => {
    for (const [action, expected, version] of [["security.settings.change", "ALLOW", 3], ["data.export", "STEP_UP", 1], ["account.delete", "DENY", 2]] as const) {
      const result = await evaluated(action); expect(result.statusCode).toBe(200); expect(result.json().decision).toBe(expected); expect(result.json().policyVersion).toBe(version);
      const evidence = (await db.client.query<{ decision: string; correlation_id: string }>("SELECT decision,correlation_id FROM audit_events WHERE subject_id=$1 AND type='ACTION_EVALUATED' AND action_id=$2", [user, action])).rows;
      expect(evidence[0]?.decision).toBe(expected); expect(evidence[0]?.correlation_id).toBe(result.json().correlationId);
    }
  });
  it("requires a live token-derived owner/session and rejects cross-user/resource/tenant or browser assertions", async () => {
    expect((await post("/v1/evaluations", input(), "")).statusCode).toBe(401);
    expect((await post("/v1/evaluations", input(), opaque())).statusCode).toBe(401);
    for (const body of [{ ...input(), userId: bob }, { ...input(), sessionId: session2 }, { ...input(), resourceId: bobsResource }]) expect([401, 403].includes((await post("/v1/evaluations", body)).statusCode)).toBe(true);
    expect([401, 403].includes((await post("/v1/evaluations", input(), token, otherKey)).statusCode)).toBe(true);
    expect((await post("/v1/evaluations", { ...input(), verified: true })).statusCode).toBe(400);
    await db.client.query("UPDATE sessions SET revoked_at=now() WHERE id=$1", [session]); expect((await evaluated()).statusCode).toBe(401);
  });
  it("uses the explicit persisted policy mode and rejects caller-supplied signals", async () => {
    const result = await evaluated("session.revoke");
    expect(result.json().decision).toBe("ALLOW");
    expect("riskScore" in result.json()).toBe(false);
    expect((await post("/v1/evaluations", { ...input("session.revoke"), signals: ["suspicious_automation"] })).statusCode).toBe(400);
  });
  it("fails closed for unregistered/disabled policy and a database failure", async () => {
    expect((await evaluated("email.change")).statusCode).toBe(403);
    await db.client.exec("UPDATE policies SET enabled=false WHERE action_id='data.export'");
    try { expect((await evaluated()).statusCode).toBe(403); } finally { await db.client.exec("UPDATE policies SET enabled=true WHERE action_id='data.export'"); }
    await db.client.exec("ALTER TABLE policies DROP CONSTRAINT policies_mode_check; UPDATE policies SET mode='UNKNOWN' WHERE action_id='data.export'");
    try { expect((await evaluated()).statusCode).toBe(403); }
    finally { await db.client.exec("UPDATE policies SET mode='STEP_UP' WHERE action_id='data.export'; ALTER TABLE policies ADD CONSTRAINT policies_mode_check CHECK (mode IN ('ALLOW','STEP_UP','DENY'))"); }
    await db.client.exec("ALTER TABLE policies RENAME TO unavailable_policies");
    try { expect((await evaluated()).statusCode).toBe(500); } finally { await db.client.exec("ALTER TABLE unavailable_policies RENAME TO policies"); }
  });
  it("verifies real action-bound UV assertions, consumes grants once and never lets a grant override DENY", async () => {
    const proof = await grant(await enrollment());
    expect(/^[A-Za-z0-9_-]{43}$/.test(proof)).toBe(true);
    const outcome = await post("/v1/evaluations", { ...input(), stepUpGrantId: proof }); expect(outcome.json().decision).toBe("ALLOW");
    expect((await post("/v1/evaluations", { ...input(), stepUpGrantId: proof })).json().decision).toBe("DENY");
    const fresh = await grant(await enrollment());
    expect((await post("/v1/evaluations", { ...input("account.delete"), stepUpGrantId: fresh })).json().decision).toBe("DENY");
    expect((await db.client.query<{ consumed_at: unknown }>("SELECT consumed_at FROM step_up_grants WHERE grant_digest=$1", [digestToken(fresh)])).rows[0]!.consumed_at).toBeNull();
  });
  it("does not accept Reclaim recovery codes as Action Shield verification", async () => {
    const recoveryCode = randomBytes(24).toString("base64url");
    const salt = randomBytes(16).toString("hex");
    await db.client.query("INSERT INTO recovery_codes(id,tenant_id,application_id,user_id,verifier) VALUES ($1,'policy-tenant','policy-app',$2,$3)",
      [randomUUID(), user, `${salt}:${digestToken(`${salt}:${recoveryCode}`)}`]);
    const challengeId = (await evaluated()).json().stepUpChallengeId as string;

    const verified = await post("/v1/step-up/recovery-code/verify", { challengeId, recoveryCode });
    expect(verified.statusCode).toBe(404);
    expect((await post("/v1/evaluations", input())).json().decision).toBe("STEP_UP");
    expect((await db.client.query("SELECT id FROM recovery_codes WHERE user_id=$1 AND consumed_at IS NULL", [user])).rows).toHaveLength(1);
  });
  it("rejects unrelated action/resource/session grants and consumes concurrently only once", async () => {
    const auth = await enrollment(); const proof = await grant(auth);
    for (const body of [{ ...input("session.revoke"), stepUpGrantId: proof }, { ...input(), resourceId: resource2, stepUpGrantId: proof }]) expect((await post("/v1/evaluations", body)).json().decision).toBe("DENY");
    expect((await post("/v1/evaluations", { ...input(), sessionId: session2, stepUpGrantId: proof }, token2)).json().decision).toBe("DENY");
    const responses = await Promise.all([post("/v1/evaluations", { ...input(), stepUpGrantId: proof }), post("/v1/evaluations", { ...input(), stepUpGrantId: proof })]);
    expect(responses.map((r: { json(): { decision: string } }) => r.json().decision).sort()).toEqual(["ALLOW", "DENY"]);
  });
  it("rejects invalid/expired/replayed step-up assertions and wrong sessions without issuing grants", async () => {
    const auth = await enrollment();
    const decision = await evaluated(); const challengeId = decision.json().stepUpChallengeId;
    expect((await post("/v1/step-up/options", { challengeId, origin }, token2)).statusCode).toBe(401);
    const options = (await post("/v1/step-up/options", { challengeId, origin })).json();
    expect(options.options.userVerification).toBe("required");
    const invalid = await post("/v1/step-up/verify", { challengeId, response: auth.assertion(options.options.challenge, user, { uv: false }) }); expect(invalid.statusCode).toBe(401);
    expect((await post("/v1/step-up/verify", { challengeId, response: auth.assertion(options.options.challenge, user) })).statusCode).toBe(401);
    expect((await db.client.query("SELECT id FROM step_up_grants WHERE user_id=$1", [user])).rows).toHaveLength(0);
    const expired = (await evaluated()).json().stepUpChallengeId;
    await db.client.query("UPDATE webauthn_challenges SET created_at=now()-interval '2 hours',expires_at=now()-interval '1 hour' WHERE id=$1", [expired]);
    expect((await post("/v1/step-up/options", { challengeId: expired, origin })).statusCode).toBe(401);
  });
  it("rejects genuine assertions with wrong origin/RP/challenge/signature, cross-origin context or malformed client data", async () => {
    const auth = await enrollment();
    for (const options of [{ origin: "https://hostile.synthetic.test" }, { rpId: "hostile.synthetic.test" }, { badSignature: true },
      { clientData: { crossOrigin: true, topOrigin: "https://hostile.synthetic.test" } }, { rawClientData: Buffer.from("{") }]) {
      const challengeId = (await evaluated()).json().stepUpChallengeId;
      const optionsResult = (await post("/v1/step-up/options", { challengeId, origin })).json();
      const assertion = auth.assertion(optionsResult.options.challenge, user, options);
      expect((await post("/v1/step-up/verify", { challengeId, response: assertion })).statusCode).toBe(401);
    }
    const challengeId = (await evaluated()).json().stepUpChallengeId;
    await post("/v1/step-up/options", { challengeId, origin });
    expect((await post("/v1/step-up/verify", { challengeId, response: auth.assertion(opaque(), user) })).statusCode).toBe(401);
    expect((await db.client.query("SELECT id FROM step_up_grants WHERE user_id=$1", [user])).rows).toHaveLength(0);
  });
  it("expires grants, rejects old policy versions, and does not fall back past a disabled latest version", async () => {
    const first = await grant(await enrollment());
    await db.client.query("UPDATE step_up_grants SET created_at=now()-interval '2 hours',expires_at=now()-interval '1 hour' WHERE grant_digest=$1", [digestToken(first)]);
    expect((await post("/v1/evaluations", { ...input(), stepUpGrantId: first })).json().decision).toBe("DENY");
    const second = await grant(await enrollment());
    const policyId = randomUUID();
    await db.client.query("INSERT INTO policies(id,tenant_id,application_id,action_id,mode,version) VALUES ($1,'policy-tenant','policy-app','data.export','STEP_UP',5)", [policyId]);
    try {
      expect((await post("/v1/evaluations", { ...input(), stepUpGrantId: second })).json().decision).toBe("DENY");
      await db.client.query("UPDATE policies SET enabled=false WHERE id=$1", [policyId]);
      expect((await evaluated()).statusCode).toBe(403);
    } finally { await db.client.query("DELETE FROM policies WHERE id=$1", [policyId]); }
  });
  it("consumes a verified challenge once under concurrency and rejects revoked sessions", async () => {
    const auth = await enrollment(); const challengeId = (await evaluated()).json().stepUpChallengeId;
    const options = (await post("/v1/step-up/options", { challengeId, origin })).json();
    const response = auth.assertion(options.options.challenge, user);
    const verified = await Promise.all([post("/v1/step-up/verify", { challengeId, response }), post("/v1/step-up/verify", { challengeId, response })]);
    expect(verified.map((result: { statusCode: number }) => result.statusCode).sort()).toEqual([200, 401]);
    const proof = verified.find((result: { statusCode: number }) => result.statusCode === 200)!.json().stepUpGrantId;
    await db.client.query("UPDATE sessions SET revoked_at=now() WHERE id=$1", [session]);
    expect((await post("/v1/evaluations", { ...input(), stepUpGrantId: proof })).statusCode).toBe(401);
    expect((await post("/v1/step-up/options", { challengeId, origin })).statusCode).toBe(401);
  });
  it("rolls back grant consumption when mandatory audit persistence fails", async () => {
    const proof = await grant(await enrollment());
    await db.client.exec("CREATE FUNCTION synthetic_audit_failure() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'Synthetic write failure'; END; $$; CREATE TRIGGER synthetic_audit_failure BEFORE INSERT ON audit_events FOR EACH STATEMENT EXECUTE FUNCTION synthetic_audit_failure()");
    try { expect((await post("/v1/evaluations", { ...input(), stepUpGrantId: proof })).statusCode).toBe(500); }
    finally { await db.client.exec("DROP TRIGGER synthetic_audit_failure ON audit_events; DROP FUNCTION synthetic_audit_failure()"); }
    expect((await db.client.query<{ consumed_at: unknown }>("SELECT consumed_at FROM step_up_grants WHERE grant_digest=$1", [digestToken(proof)])).rows[0]!.consumed_at).toBeNull();
    expect((await post("/v1/evaluations", { ...input(), stepUpGrantId: proof })).json().decision).toBe("ALLOW");
  });
  it("enforces the stored RP snapshot even when the new RP remains valid for the same registered origin", async () => {
    const auth = await enrollment(); const registeredOrigin = "https://northstar.synthetic.test";
    await db.client.query("UPDATE applications SET origins=$1,rp_id='synthetic.test' WHERE id='policy-app'", [JSON.stringify([origin, registeredOrigin])]);
    try {
      const challengeId = (await evaluated()).json().stepUpChallengeId;
      const options = (await post("/v1/step-up/options", { challengeId, origin: registeredOrigin })).json();
      await db.client.exec("UPDATE applications SET rp_id='northstar.synthetic.test' WHERE id='policy-app'");
      const response = auth.assertion(options.options.challenge, user, { origin: registeredOrigin, rpId: "synthetic.test" });
      expect((await post("/v1/step-up/verify", { challengeId, response })).statusCode).toBe(401);
    } finally { await db.client.query("UPDATE applications SET origins=$1,rp_id='localhost' WHERE id='policy-app'", [JSON.stringify([origin])]); }
  });
  it("round-trips the server SDK through real API evaluation/options/assertion verification without exposing credentials", async () => {
    const auth = await enrollment();
    const transport: typeof fetch = async (url, init) => {
      const result = await app.inject({ method: "POST", url: new URL(String(url)).pathname, headers: Object.fromEntries(new Headers(init?.headers)), payload: String(init?.body) });
      return new Response(result.body, { status: result.statusCode, headers: { "content-type": "application/json" } });
    };
    const sdk = new SentriqClient({ baseUrl: "http://localhost:4000", applicationId: "policy-app", apiKey: key }, transport);
    const request = { ...input(), actionId: "data.export" as const };
    const required = await sdk.evaluate(request, token); expect(required.decision).toBe("STEP_UP");
    const options = await sdk.stepUpOptions({ challengeId: required.stepUpChallengeId!, origin }, token);
    const verified = await sdk.stepUpVerify({ challengeId: options.challengeId, response: auth.assertion(options.options.challenge, user) }, token);
    expect((await sdk.evaluate({ ...request, stepUpGrantId: verified.stepUpGrantId }, token)).decision).toBe("ALLOW");
    expect((await sdk.evaluate({ ...request, stepUpGrantId: verified.stepUpGrantId }, token)).decision).toBe("DENY");

  });
});
