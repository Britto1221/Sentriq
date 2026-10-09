import { randomBytes } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { buildApp } from "../app";
import { digestToken, migrateDatabase, openDatabase, type Database } from "../db/index";
import { TestAuthenticator } from "./test-authenticator";

let db: Database;
let app: Awaited<ReturnType<typeof buildApp>>;
const key = randomBytes(32).toString("base64url");
const key2 = randomBytes(32).toString("base64url");
const origin = "http://localhost:3001";
const secret = () => randomBytes(24).toString("base64url");
const opaqueSecret = () => randomBytes(32).toString("base64url");
let syntheticSource = 10;
function request(path: string, payload?: object, token?: string, applicationKey = key, remoteAddress?: string) {
  return app.inject({ method: payload === undefined ? "GET" : "POST", url: `/v1/auth${path}`, ...(remoteAddress ? { remoteAddress } : {}),
    headers: { "x-sentriq-api-key": applicationKey, ...(token ? { "x-sentriq-session-token": token } : {}) }, payload });
}
function policyRequest(path: string, payload: object, token?: string) {
  return app.inject({ method: "POST", url: `/v1${path}`,
    headers: { "x-sentriq-api-key": key, ...(token ? { "x-sentriq-session-token": token } : {}) }, payload });
}
function tokenFrom(response: { headers: Record<string, unknown> }): string {
  const cookie = String(response.headers["set-cookie"] ?? "");
  expect(cookie.includes("HttpOnly")).toBe(true);
  return cookie.split(";")[0]!.split("=")[1]!;
}
async function account() {
  const registration = await pendingRegistration();
  const registrationToken = registration.registrationToken;
  const options = await app.inject({ method: "POST", url: "/v1/auth/webauthn/register/options", headers: { "x-sentriq-api-key": key, "x-sentriq-registration-token": registrationToken }, payload: { origin } });
  expect(options.statusCode).toBe(200);
  const authenticator = new TestAuthenticator();
  const completed = await app.inject({ method: "POST", url: "/v1/auth/webauthn/register/verify", headers: { "x-sentriq-api-key": key, "x-sentriq-registration-token": registrationToken }, payload: {
    challengeId: options.json().challengeId, response: authenticator.registration(options.json().options.challenge),
  } });
  expect(completed.statusCode).toBe(200);
  return { token: tokenFrom(completed), user: completed.json().user, accountId: registration.accountId, authenticator, recoveryCodes: completed.json().recoveryCodes as string[] };
}
async function pendingRegistration(displayName = "Northstar user") {
  const started = await request("/registration/start", { displayName }, undefined, key, `198.51.100.${(syntheticSource++ % 240) + 10}`);
  expect(started.statusCode).toBe(200);
  return { accountId: started.json().accountId as string, registrationToken: started.json().registrationToken as string };
}
async function registrationOptions(registrationToken: string, registrationOrigin = origin) {
  return app.inject({ method: "POST", url: "/v1/auth/webauthn/register/options", headers: {
    "x-sentriq-api-key": key, "x-sentriq-registration-token": registrationToken,
  }, payload: { origin: registrationOrigin } });
}
async function deviceRequest(path: string, payload: object, transaction: string, session?: string) {
  return app.inject({ method: "POST", url: `/v1/auth${path}`, headers: {
    "x-sentriq-api-key": key, "x-sentriq-device-link-token": transaction,
    ...(session ? { "x-sentriq-session-token": session } : {}),
  }, payload });
}
async function enrollment(identity: Awaited<ReturnType<typeof account>>) {
  void identity;
  return identity.authenticator;
}
async function signIn(identity: Awaited<ReturnType<typeof account>>, accountId?: string) {
  const options = await request("/webauthn/login/options", { origin, ...(accountId ? { accountId } : {}) });
  expect(options.statusCode).toBe(200);
  return request("/webauthn/login/verify", { challengeId: options.json().challengeId,
    response: identity.authenticator.assertion(options.json().options.challenge, identity.user.id) });
}
beforeAll(async () => {
  db = await openDatabase("memory://"); await migrateDatabase(db.client);
  await db.client.exec(`INSERT INTO tenants(id,name) VALUES ('auth-tenant','Synthetic');
    INSERT INTO applications(id,tenant_id,name,origins,rp_id) VALUES ('auth-app','auth-tenant','Synthetic','["${origin}"]','localhost'),('other-app','auth-tenant','Other','["http://localhost:3002"]','localhost');`);
  await db.client.query("INSERT INTO application_api_keys(id,tenant_id,application_id,digest) VALUES ('auth-key','auth-tenant','auth-app',$1),('other-key','auth-tenant','other-app',$2)", [digestToken(key), digestToken(key2)]);
  app = await buildApp({ database: db, config: { nodeEnv: "test", host: "127.0.0.1", port: 4000, dataDir: "memory://", rateLimitMax: 1000, rateLimitWindowMs: 60_000, logLevel: "silent" } });
}, 60_000);
afterAll(async () => { await app?.close(); await db?.client.close(); });

describe("real authentication", { timeout: 60_000 }, () => {
  it("registers a host-owned account without email delivery and issues six recovery codes after passkey verification", async () => {
    const started = await request("/registration/start", { displayName: "No Email User" });
    expect(started.statusCode).toBe(200);
    expect(started.json().registrationToken).toMatch(/^[A-Za-z0-9_-]{43}$/);
    expect(started.json().accountId).toBeTruthy();

    const registrationToken = started.json().registrationToken as string;
    const transactionRow = (await db.client.query<{ state: string; user_id: string | null; expires_at: Date }>("SELECT state,user_id,expires_at FROM passkey_enrollment_transactions WHERE token_digest=$1", [digestToken(registrationToken)])).rows[0];
    expect(transactionRow?.state).toBe("PENDING");
    expect(transactionRow?.user_id).toBeTruthy();
    expect((await db.client.query("SELECT id FROM users WHERE id=$1 AND email IS NULL", [started.json().accountId])).rows).toHaveLength(1);
    const options = await app.inject({ method: "POST", url: "/v1/auth/webauthn/register/options", headers: {
      "x-sentriq-api-key": key, "x-sentriq-registration-token": registrationToken,
    }, payload: { origin } });
    expect(options.statusCode, JSON.stringify(options.json())).toBe(200);
    const authenticator = new TestAuthenticator();
    const completed = await app.inject({ method: "POST", url: "/v1/auth/webauthn/register/verify", headers: {
      "x-sentriq-api-key": key, "x-sentriq-registration-token": registrationToken,
    }, payload: { challengeId: options.json().challengeId, response: authenticator.registration(options.json().options.challenge) } });
    expect(completed.statusCode).toBe(200);
    expect(completed.json().recoveryCodes).toHaveLength(6);
    expect(String(completed.headers["set-cookie"])).toContain("HttpOnly");
    expect((await request("/session", undefined, tokenFrom(completed))).statusCode).toBe(200);
    expect((await app.inject({ method: "POST", url: "/v1/auth/signup", headers: { "x-sentriq-api-key": key }, payload: { email: "name@example.test", password: secret(), displayName: "No password" } })).statusCode).toBe(404);
    expect((await app.inject({ method: "POST", url: "/v1/auth/login", headers: { "x-sentriq-api-key": key }, payload: { email: "name@example.test", password: secret() } })).statusCode).toBe(404);
  });

  it("links a new device only after its matching request receives fresh passkey approval", async () => {
    const existing = await account();
    const outsider = await account();
    const started = await request("/device-links/start", { accountId: existing.user.id });
    expect(started.statusCode).toBe(200);
    expect(started.json().comparisonCode).toMatch(/^[A-Z2-9]{6}$/);
    const { requestId, transaction, comparisonCode } = started.json() as { requestId: string; transaction: string; comparisonCode: string };
    expect(started.headers["set-cookie"]).toBeUndefined();

    const inbox = await request("/device-links/inbox", undefined, existing.token);
    expect(inbox.json()).toContainEqual(expect.objectContaining({ requestId, comparisonCode, status: "PENDING" }));
    expect((await request("/device-links/inbox", undefined, outsider.token)).json()).toEqual([]);
    expect((await deviceRequest("/device-links/status", { requestId }, "z".repeat(43))).statusCode).toBe(401);
    expect((await deviceRequest("/device-links/registration/options", { requestId, origin }, transaction)).statusCode).toBe(401);
    expect((await request("/device-links/approval/options", { requestId, origin }, outsider.token)).statusCode).toBe(401);
    const approvalOptions = await request("/device-links/approval/options", { requestId, origin }, existing.token);
    expect(approvalOptions.statusCode).toBe(200);
    const originalSessionId = (await request("/session", undefined, existing.token)).json().session.id as string;
    const secondSession = await signIn(existing);
    const secondSessionId = (await request("/session", undefined, tokenFrom(secondSession))).json().session.id as string;
    expect(secondSessionId === originalSessionId).toBe(false);
    // signIn above advanced this software authenticator's signature counter to 1.
    // The approval assertion is its next authenticator use, so use the next counter.
    const approvalResponse = existing.authenticator.assertion(approvalOptions.json().options.challenge, existing.user.id, { counter: 2 });
    expect((await request("/device-links/approval/verify", {
      requestId, challengeId: approvalOptions.json().challengeId, response: approvalResponse,
    }, tokenFrom(secondSession))).statusCode).toBe(401);
    const unchanged = await db.client.query<{ state: string; approval_session_id: string; approval_challenge_id: string }>("SELECT state,approval_session_id,approval_challenge_id FROM device_link_requests WHERE id=$1", [requestId]);
    expect(unchanged.rows[0]).toMatchObject({ state: "PENDING", approval_session_id: originalSessionId, approval_challenge_id: approvalOptions.json().challengeId });
    const approval = await request("/device-links/approval/verify", {
      requestId, challengeId: approvalOptions.json().challengeId,
      response: approvalResponse,
    }, existing.token);
    expect(approval.statusCode, JSON.stringify(approval.json())).toBe(200);
    expect(approval.json()).toEqual({ status: "APPROVED" });

    const status = await deviceRequest("/device-links/status", { requestId }, transaction);
    expect(status.json().status).toBe("APPROVED");
    const enrollment = await deviceRequest("/device-links/registration/options", { requestId, origin }, transaction);
    expect(enrollment.statusCode).toBe(200);
    const newPhone = new TestAuthenticator();
    const completed = await deviceRequest("/device-links/registration/verify", {
      requestId, challengeId: enrollment.json().challengeId,
      response: newPhone.registration(enrollment.json().options.challenge),
    }, transaction);
    expect(completed.statusCode).toBe(200);
    expect((await deviceRequest("/device-links/registration/options", { requestId, origin }, "z".repeat(43))).statusCode).toBe(401);
    expect(String(completed.headers["set-cookie"])).toContain("HttpOnly");
    const newSession = tokenFrom(completed);
    expect((await request("/session", undefined, newSession)).json().user.id).toBe(existing.user.id);
    expect((await request("/session", undefined, existing.token)).statusCode).toBe(200);
    expect((await deviceRequest("/device-links/status", { requestId }, transaction)).json().status).toBe("COMPLETED");
    expect((await deviceRequest("/device-links/registration/verify", {
      requestId, challengeId: enrollment.json().challengeId,
      response: newPhone.registration(enrollment.json().options.challenge),
    }, transaction)).statusCode).toBe(401);
    const loginOptions = await request("/webauthn/login/options", { origin, accountId: existing.user.id });
    const newLogin = await request("/webauthn/login/verify", { challengeId: loginOptions.json().challengeId,
      response: newPhone.assertion(loginOptions.json().options.challenge, existing.user.id) });
    expect(newLogin.statusCode).toBe(200);

    const rejectedRequest = await request("/device-links/start", { accountId: existing.user.id });
    const rejectedRequestId = rejectedRequest.json().requestId as string;
    const rejectedToken = rejectedRequest.json().transaction as string;
    expect((await request("/device-links/reject", { requestId: rejectedRequestId }, existing.token)).statusCode).toBe(200);
    expect((await deviceRequest("/device-links/status", { requestId: rejectedRequestId }, rejectedToken)).json().status).toBe("REJECTED");
    expect((await deviceRequest("/device-links/registration/options", { requestId: rejectedRequestId, origin }, rejectedToken)).statusCode).toBe(401);
  });

  it("requires app credentials and exposes no password authentication route", async () => {
    expect((await app.inject({ method: "POST", url: "/v1/auth/registration/start", payload: { email: "missing@synthetic.test" } })).statusCode).toBe(401);
    const identity = await account();
    expect((await app.inject({ method: "POST", url: "/v1/auth/signup", headers: { "x-sentriq-api-key": key }, payload: { email: identity.user.id, password: secret(), displayName: "Legacy" } })).statusCode).toBe(404);
    expect((await app.inject({ method: "POST", url: "/v1/auth/login", headers: { "x-sentriq-api-key": key }, payload: { email: identity.user.id, password: secret() } })).statusCode).toBe(404);
    const response = await signIn(identity);
    expect(response.statusCode).toBe(200);
    expect(response.json().token).toBeUndefined(); expect(response.json().sessionToken).toBeUndefined();
    expect(String(response.headers["set-cookie"]).includes("SameSite=Lax")).toBe(true);
    expect(String(response.headers["set-cookie"]).includes("Path=/")).toBe(true);
    expect(response.headers["cache-control"]).toBe("no-store");
    expect((await db.client.query("SELECT tablename FROM pg_tables WHERE schemaname='public' AND tablename='password_credentials'")).rows).toHaveLength(0);
  });
  it("authenticates by host account ID and never treats email-like input as identity", async () => {
    const identity = await account();
    const known = await signIn(identity, identity.accountId);
    const unknown = await signIn(identity, `${secret()}@synthetic.test`);
    expect(known.statusCode).toBe(200); expect(unknown.statusCode).toBe(401);
  });
  it("returns only the authenticated user's safe security events", async () => {
    const identity = await account();
    const other = await account();
    const ownedId = secret();
    const otherId = secret();
    await db.client.query("INSERT INTO audit_events(id,tenant_id,application_id,subject_id,type,outcome,action_id,policy_version,reason_code,correlation_id) VALUES ($1,'auth-tenant','auth-app',$2,'ACTION_EVALUATED','REQUIRED','data.export',1,'policy_step_up',$3),($4,'auth-tenant','auth-app',$5,'AUTH_RECOVERY_STARTED','INFO',NULL,NULL,'recovery_started',$6)",
      [ownedId, identity.user.id, secret(), otherId, other.user.id, secret()]);

    const response = await request("/events", undefined, identity.token);
    expect(response.statusCode).toBe(200);
    expect(response.json().map((event: { id: string }) => event.id)).toContain(ownedId);
    expect(response.json().some((event: { id: string }) => event.id === otherId)).toBe(false);
    expect(response.json().every((event: Record<string, unknown>) => !["riskScore", "signalCodes", "simulated", "token", "recoveryCode"].some((field) => field in event))).toBe(true);
    expect((await request("/events", undefined, undefined)).statusCode).toBe(401);
    expect((await request("/events", undefined, identity.token, key2)).statusCode).toBe(401);
  });
  it("rejects conflicting app credentials and emits production host-only secure cookies", async () => {
    const identity = await account();
    for (const headers of [{ authorization: `Bearer ${key2}` }, { "x-sentriq-application-id": "other-app" }]) {
      expect((await app.inject({ method: "GET", url: "/v1/auth/session", headers: { "x-sentriq-api-key": key, "x-sentriq-session-token": identity.token, ...headers } })).statusCode).toBe(401);
    }
    const production = await buildApp({ database: db, config: { nodeEnv: "production", host: "127.0.0.1", port: 4000, dataDir: "memory://", rateLimitMax: 1000, rateLimitWindowMs: 60_000, logLevel: "silent" } });
    try {
      const productionOrigin = "https://login.synthetic.test";
      await db.client.query("UPDATE applications SET origins=$1,rp_id='synthetic.test' WHERE id='auth-app'", [JSON.stringify([productionOrigin])]);
      const options = await production.inject({ method: "POST", url: "/v1/auth/webauthn/login/options", headers: { "x-sentriq-api-key": key }, payload: { origin: productionOrigin, accountId: identity.user.id } });
      const login = await production.inject({ method: "POST", url: "/v1/auth/webauthn/login/verify", headers: { "x-sentriq-api-key": key }, payload: {
        challengeId: options.json().challengeId, response: identity.authenticator.assertion(options.json().options.challenge, identity.user.id, { origin: productionOrigin, rpId: "synthetic.test" }),
      } });
      expect(login.statusCode).toBe(200);
      const cookie = String(login.headers["set-cookie"]);
      expect(cookie.startsWith("__Host-sentriq_")).toBe(true);
      expect(cookie.includes("; Secure")).toBe(true);
      expect(cookie.includes("HttpOnly")).toBe(true);
      expect(cookie.includes("Domain=")).toBe(false);
    } finally { await db.client.query("UPDATE applications SET origins=$1,rp_id='localhost' WHERE id='auth-app'", [JSON.stringify([origin])]); await production.close(); }
  });
  it("rejects invalid, expired, revoked and cross-application sessions and clears logout cookies", async () => {
    const identity = await account();
    expect((await request("/session", undefined, identity.token)).json().user.id).toBe(identity.user.id);
    expect((await request("/session", undefined, secret())).statusCode).toBe(401);
    expect((await request("/session", undefined, identity.token, key2)).statusCode).toBe(401);
    const logout = await request("/logout", {}, identity.token);
    expect(logout.statusCode).toBe(200); expect(String(logout.headers["set-cookie"]).includes("Max-Age=0")).toBe(true);
    expect((await request("/session", undefined, identity.token)).statusCode).toBe(401);
    const second = await signIn(identity); const token = tokenFrom(second);
    await db.client.query("UPDATE sessions SET created_at=now()-interval '2 hours', expires_at=now()-interval '1 hour' WHERE token_digest=$1", [digestToken(token)]);
    expect((await request("/session", undefined, token)).statusCode).toBe(401);
  });
  it("verifies real passkey registration and email-bound signed login, then advances the authenticator counter", async () => {
    const identity = await account(); const auth = await enrollment(identity);
    expect((await db.client.query("SELECT id FROM webauthn_credentials WHERE user_id=$1", [identity.user.id])).rows).toHaveLength(1);
    const options = await request("/webauthn/login/options", { origin, accountId: identity.user.id });
    expect(options.json().options.userVerification).toBe("required");
    const response = await request("/webauthn/login/verify", { challengeId: options.json().challengeId, response: auth.assertion(options.json().options.challenge, identity.user.id) });
    expect(response.statusCode).toBe(200);
    expect((await request("/session", undefined, tokenFrom(response))).json().user.id).toBe(identity.user.id);
    expect((await db.client.query<{ counter: number }>("SELECT counter FROM webauthn_credentials WHERE credential_id=$1", [auth.id])).rows[0]!.counter).toBe(1);
    const next = (await request("/webauthn/login/options", { origin })).json();
    expect((await request("/webauthn/login/verify", { challengeId: next.challengeId, response: auth.assertion(next.options.challenge, identity.user.id, { counter: 1 }) })).statusCode).toBe(401);
  });
  it("lists and renames only owned passkey metadata, and removes a credential only with a matching one-use Shield grant", async () => {
    const identity = await account();
    const other = await account();
    const link = await request("/device-links/start", { accountId: identity.user.id });
    const linkId = link.json().requestId as string;
    const linkTransaction = link.json().transaction as string;
    const approvalOptions = await request("/device-links/approval/options", { requestId: linkId, origin }, identity.token);
    expect((await request("/device-links/approval/verify", { requestId: linkId, challengeId: approvalOptions.json().challengeId,
      response: identity.authenticator.assertion(approvalOptions.json().options.challenge, identity.user.id) }, identity.token)).statusCode).toBe(200);
    const newAuthenticator = new TestAuthenticator();
    const registrationOptions = await deviceRequest("/device-links/registration/options", { requestId: linkId, origin }, linkTransaction);
    const linked = await deviceRequest("/device-links/registration/verify", { requestId: linkId, challengeId: registrationOptions.json().challengeId,
      response: newAuthenticator.registration(registrationOptions.json().options.challenge) }, linkTransaction);
    expect(linked.statusCode).toBe(200);

    const first = (await request("/credentials", undefined, identity.token));
    expect(first.statusCode).toBe(200);
    expect(first.json()).toHaveLength(2);
    expect(first.json()[0]).toMatchObject({ displayName: "Passkey", deviceType: "singleDevice", backedUp: false });
    expect(Object.hasOwn(first.json()[0], "credentialId")).toBe(false);
    expect(Object.hasOwn(first.json()[0], "publicKey")).toBe(false);
    // Remove the newly linked authenticator and keep the original signer for the final-credential check.
    const credentialId = first.json()[1].id as string;
    const lastCredentialId = first.json()[0].id as string;
    const otherCredentialId = (await request("/credentials", undefined, other.token)).json()[0].id as string;
    expect(otherCredentialId === credentialId).toBe(false);

    const renamed = await request("/credentials/rename", { credentialId, displayName: "My laptop" }, identity.token);
    expect(renamed.statusCode).toBe(200);
    expect(renamed.json()).toMatchObject({ id: credentialId, displayName: "My laptop" });
    expect((await request("/credentials/rename", { credentialId, displayName: "   " }, identity.token)).statusCode).toBe(400);
    expect((await request("/credentials/rename", { credentialId, displayName: "Other" }, other.token)).statusCode).toBe(401);

    await db.client.query("INSERT INTO protected_actions(id,tenant_id,application_id,action_id,description) VALUES ('remove-action','auth-tenant','auth-app','passkey.remove','Remove a passkey after fresh verification')");
    await db.client.query("INSERT INTO policies(id,tenant_id,application_id,action_id,mode,version) VALUES ('remove-policy','auth-tenant','auth-app','passkey.remove','STEP_UP',1)");
    const requestStepUp = async (token: string, userId: string, credential: TestAuthenticator, targetId: string) => {
      const input = { applicationId: "auth-app", userId, sessionId: (await request("/session", undefined, token)).json().session.id, actionId: "passkey.remove", resourceId: `passkey-${targetId}` };
      const decision = await policyRequest("/evaluations", input, token);
      expect(decision.json().decision).toBe("STEP_UP");
      const options = await policyRequest("/step-up/options", { challengeId: decision.json().stepUpChallengeId, origin }, token);
      const verified = await policyRequest("/step-up/verify", { challengeId: decision.json().stepUpChallengeId,
        response: credential.assertion(options.json().options.challenge, userId) }, token);
      expect(verified.statusCode).toBe(200);
      return verified.json().stepUpGrantId as string;
    };
    const grant = await requestStepUp(identity.token, identity.user.id, identity.authenticator, credentialId);
    const revoked = await request("/credentials/revoke", { credentialId, stepUpGrantId: grant }, identity.token);
    expect(revoked.statusCode).toBe(200);
    expect(revoked.json()).toEqual({ status: "revoked" });
    expect((await request("/credentials", undefined, identity.token)).json()).toHaveLength(1);
    expect((await db.client.query("SELECT id FROM audit_events WHERE subject_id=$1 AND type='AUTH_PASSKEY_REMOVED'", [identity.user.id])).rows).toHaveLength(1);

    expect((await request("/credentials/revoke", { credentialId, stepUpGrantId: grant }, identity.token)).statusCode).toBe(401);
    const lastGrant = await requestStepUp(identity.token, identity.user.id, identity.authenticator, lastCredentialId);
    expect((await request("/credentials/revoke", { credentialId: lastCredentialId, stepUpGrantId: lastGrant }, identity.token)).statusCode).toBe(401);
    expect((await request("/credentials", undefined, identity.token)).json()).toHaveLength(1);
    const crossAccountGrant = await requestStepUp(identity.token, identity.user.id, identity.authenticator, lastCredentialId);
    expect((await request("/credentials/revoke", { credentialId: otherCredentialId, stepUpGrantId: crossAccountGrant }, identity.token)).statusCode).toBe(401);
    expect((await request("/credentials", undefined, other.token)).json()).toHaveLength(1);
    expect((await request("/credentials/revoke", { credentialId: otherCredentialId, stepUpGrantId: opaqueSecret() }, other.token)).statusCode).toBe(401);
  });
  it("rejects signature, origin, RP, challenge, UV and user-handle failures using the real verifier", async () => {
    const identity = await account(); const auth = await enrollment(identity);
    for (const variant of [{ badSignature: true }, { origin: "https://attacker.test" }, { rpId: "attacker.test" }, { uv: false }]) {
      const options = (await request("/webauthn/login/options", { origin })).json();
      expect((await request("/webauthn/login/verify", { challengeId: options.challengeId, response: auth.assertion(options.options.challenge, identity.user.id, variant) })).statusCode).toBe(401);
    }
    for (const [challenge, userId] of [[secret(), identity.user.id], [undefined, "other-user"]]) {
      const options = (await request("/webauthn/login/options", { origin })).json();
      expect((await request("/webauthn/login/verify", { challengeId: options.challengeId, response: auth.assertion(challenge ?? options.options.challenge, userId) })).statusCode).toBe(401);
    }
  });
  it.each([
    { crossOrigin: true, topOrigin: "https://hostile.synthetic.test" },
    { crossOrigin: true },
    { crossOrigin: false, topOrigin: "https://hostile.synthetic.test" },
    { crossOrigin: "false" },
    { crossOrigin: null },
    { crossOrigin: false, topOrigin: null },
  ])("rejects cross-origin or malformed ceremony flags in genuine signed assertions (case %#)", async (clientData) => {
    const identity = await account(); const auth = await enrollment(identity);
    const options = (await request("/webauthn/login/options", { origin })).json();
    const response = await request("/webauthn/login/verify", { challengeId: options.challengeId,
      response: auth.assertion(options.options.challenge, identity.user.id, { clientData }) });
    expect(response.statusCode).toBe(401);
    expect(response.json().error.message).toBe("Authentication failed");
    expect((await db.client.query<{ counter: number }>("SELECT counter FROM webauthn_credentials WHERE credential_id=$1", [auth.id])).rows[0]!.counter).toBe(0);
    expect((await db.client.query<{ consumed_at: unknown }>("SELECT consumed_at FROM webauthn_challenges WHERE id=$1", [options.challengeId])).rows[0]!.consumed_at !== null).toBe(true);
  });
  it.each([
    { crossOrigin: true, topOrigin: "https://hostile.synthetic.test" },
    { crossOrigin: true },
    { crossOrigin: false, topOrigin: "https://hostile.synthetic.test" },
    { crossOrigin: "false" },
    { crossOrigin: null },
    { crossOrigin: false, topOrigin: null },
  ])("rejects cross-origin or malformed ceremony flags in registration (case %#)", async (clientData) => {
    const registration = await pendingRegistration(); const auth = new TestAuthenticator();
    const options = (await registrationOptions(registration.registrationToken)).json();
    const response = await app.inject({ method: "POST", url: "/v1/auth/webauthn/register/verify", headers: {
      "x-sentriq-api-key": key, "x-sentriq-registration-token": registration.registrationToken,
    }, payload: { challengeId: options.challengeId, response: auth.registration(options.options.challenge, origin, "localhost", true, clientData) } });
    expect(response.statusCode).toBe(401);
    expect(response.json().error.message).toBe("Authentication failed");
    expect((await db.client.query("SELECT id FROM webauthn_credentials WHERE user_id=(SELECT id FROM users WHERE id=$1)", [registration.accountId])).rows).toHaveLength(0);
  });
  it("rejects unregistered origins, registration without UV and registration from another session", async () => {
    const unverified = await pendingRegistration();
    expect((await registrationOptions(unverified.registrationToken, "https://attacker.test")).statusCode).toBe(401);
    const other = await pendingRegistration(); const options = await registrationOptions(other.registrationToken);
    const auth = new TestAuthenticator();
    expect((await app.inject({ method: "POST", url: "/v1/auth/webauthn/register/verify", headers: {
      "x-sentriq-api-key": key, "x-sentriq-registration-token": other.registrationToken, "x-sentriq-session-token": secret(),
    }, payload: { challengeId: options.json().challengeId, response: auth.registration(options.json().options.challenge) } })).statusCode).toBe(401);
    const third = await pendingRegistration(); const uvOptions = await registrationOptions(third.registrationToken);
    expect((await app.inject({ method: "POST", url: "/v1/auth/webauthn/register/verify", headers: {
      "x-sentriq-api-key": key, "x-sentriq-registration-token": third.registrationToken,
    }, payload: { challengeId: uvOptions.json().challengeId, response: auth.registration(uvOptions.json().options.challenge, origin, "localhost", false) } })).statusCode).toBe(401);
  });
  it("fails closed on malformed client data and accepts top-level ceremonies with the optional flag omitted", async () => {
    const identity = await account(); const auth = await enrollment(identity);
    for (const rawClientData of [Buffer.from("{"), Buffer.from("null"), Buffer.from("[]"), Buffer.from([0xc3, 0x28])]) {
      const login = (await request("/webauthn/login/options", { origin })).json();
      expect((await request("/webauthn/login/verify", { challengeId: login.challengeId,
        response: auth.assertion(login.options.challenge, identity.user.id, { rawClientData }) })).statusCode).toBe(401);
      const transaction = await pendingRegistration();
      const registration = (await registrationOptions(transaction.registrationToken)).json();
      const response = new TestAuthenticator().registration(registration.options.challenge);
      response.response.clientDataJSON = rawClientData.toString("base64url");
      expect((await app.inject({ method: "POST", url: "/v1/auth/webauthn/register/verify", headers: { "x-sentriq-api-key": key, "x-sentriq-registration-token": transaction.registrationToken }, payload: { challengeId: registration.challengeId, response } })).statusCode).toBe(401);
    }
    const transaction = await pendingRegistration();
    const registration = (await registrationOptions(transaction.registrationToken)).json();
    const response = await app.inject({ method: "POST", url: "/v1/auth/webauthn/register/verify", headers: { "x-sentriq-api-key": key, "x-sentriq-registration-token": transaction.registrationToken }, payload: {
      challengeId: registration.challengeId,
      response: new TestAuthenticator().registration(registration.options.challenge, origin, "localhost", true, { crossOrigin: undefined }),
    } });
    expect(response.statusCode).toBe(200);
    const login = (await request("/webauthn/login/options", { origin })).json();
    expect((await request("/webauthn/login/verify", { challengeId: login.challengeId,
      response: auth.assertion(login.options.challenge, identity.user.id, { clientData: { crossOrigin: undefined } }) })).statusCode).toBe(200);
  });
  it("rejects pending registration and login proofs after an application RP change", async () => {
    const identity = await account(); const auth = new TestAuthenticator();
    const registeredOrigin = "https://login.synthetic.test";
    try {
      await db.client.query("UPDATE applications SET origins=$1,rp_id='synthetic.test' WHERE id='auth-app'", [JSON.stringify([registeredOrigin])]);
      const registration = await pendingRegistration();
      const enrollmentOptions = (await registrationOptions(registration.registrationToken, registeredOrigin)).json();
      const registered = await app.inject({ method: "POST", url: "/v1/auth/webauthn/register/verify", headers: { "x-sentriq-api-key": key, "x-sentriq-registration-token": registration.registrationToken }, payload: { challengeId: enrollmentOptions.challengeId, response: auth.registration(enrollmentOptions.options.challenge, registeredOrigin, "synthetic.test") } });
      expect(registered.statusCode).toBe(200);
      const pendingLogin = (await request("/webauthn/login/options", { origin: registeredOrigin })).json();
      await db.client.query("UPDATE applications SET rp_id='test' WHERE id='auth-app'");
      const pendingNew = await pendingRegistration();
      const pending = (await registrationOptions(pendingNew.registrationToken, registeredOrigin)).json();
      const attemptedRegistration = await app.inject({ method: "POST", url: "/v1/auth/webauthn/register/verify", headers: { "x-sentriq-api-key": key, "x-sentriq-registration-token": pendingNew.registrationToken }, payload: { challengeId: pending.challengeId, response: new TestAuthenticator().registration(pending.options.challenge, registeredOrigin, "synthetic.test") } });
      const attemptedLogin = await request("/webauthn/login/verify", { challengeId: pendingLogin.challengeId, response: auth.assertion(pendingLogin.options.challenge, identity.user.id, { origin: registeredOrigin, rpId: "synthetic.test" }) });
      expect([attemptedRegistration.statusCode, attemptedLogin.statusCode]).toEqual([401, 401]);
    } finally {
      await db.client.query("UPDATE applications SET origins=$1,rp_id='localhost' WHERE id='auth-app'", [JSON.stringify([origin])]);
    }
  });
  it("consumes signed login challenges only once under concurrent requests and rejects expiry/replay", async () => {
    const identity = await account(); const auth = await enrollment(identity);
    const options = (await request("/webauthn/login/options", { origin })).json();
    const payload = { challengeId: options.challengeId, response: auth.assertion(options.options.challenge, identity.user.id) };
    const responses = await Promise.all([request("/webauthn/login/verify", payload), request("/webauthn/login/verify", payload)]);
    expect(responses.map((r: { statusCode: number }) => r.statusCode).sort()).toEqual([200, 401]);
    expect((await request("/webauthn/login/verify", payload)).statusCode).toBe(401);
    const expired = (await request("/webauthn/login/options", { origin })).json();
    await db.client.query("UPDATE webauthn_challenges SET created_at=now()-interval '2 hours', expires_at=now()-interval '1 hour' WHERE id=$1", [expired.challengeId]);
    expect((await request("/webauthn/login/verify", { challengeId: expired.challengeId, response: auth.assertion(expired.options.challenge, identity.user.id, { counter: 2 }) })).statusCode).toBe(401);
  });
  it("does not expose the retired password-reset recovery bypass", async () => {
    expect((await request("/recovery/start", { email: "alice@synthetic.test" })).statusCode).toBe(404);
    expect((await request("/recovery/complete", { email: "alice@synthetic.test", code: "A".repeat(32), newPassword: secret(), attempt: secret() })).statusCode).toBe(404);
  });  it("rate limits host-account registration per source", async () => {
    const statuses = [];
    for (let i = 0; i < 9; i++) statuses.push((await request("/registration/start", { displayName: "Rate test" })).statusCode);
    expect(statuses).toContain(429);
  });
  it("cannot bypass registration throttling by changing an untrusted session header", async () => {
    const statuses = [];
    for (let i = 0; i < 9; i++) statuses.push((await request("/registration/start", { displayName: "Rate test" }, secret())).statusCode);
    expect(statuses).toContain(429);
  });
  it("keeps registration source limits independent when callers have distinct addresses", async () => {
    const statuses = [];
    for (let i = 0; i < 9; i++) statuses.push((await app.inject({ method: "POST", url: "/v1/auth/registration/start", remoteAddress: `192.0.2.${i + 1}`,
      headers: { "x-sentriq-api-key": key }, payload: { displayName: "Rate test" } })).statusCode);
    expect(statuses.every((status) => status === 200)).toBe(true);
  });
  it("recovers through a restricted transaction, replaces passkeys, revokes sessions and rotates recovery codes", async () => {
    const identity = await account(); const oldAuthenticator = await enrollment(identity);
    const secondSession = tokenFrom(await signIn(identity));
    const oldCodes = identity.recoveryCodes;
    const started = await request("/reclaim/start", { accountId: identity.user.id });
    expect(started.statusCode).toBe(200);
    expect(started.json().status).toBe("accepted");
    expect(started.headers["set-cookie"]).toBeUndefined();
    const transaction = started.json().transaction as string;

    const proof = await request("/reclaim/verify", { accountId: identity.user.id, transaction, recoveryCode: oldCodes[0] });
    expect(proof.statusCode).toBe(200);
    expect(proof.json().status).toBe("verified");
    expect(proof.headers["set-cookie"]).toBeUndefined();
    expect((await request("/session", undefined, identity.token)).statusCode).toBe(200);

    const registration = await request("/reclaim/passkey/options", { transaction, origin });
    expect(registration.statusCode).toBe(200);
    expect(registration.json().options.authenticatorSelection.userVerification).toBe("required");
    const replacement = new TestAuthenticator();
    const completed = await request("/reclaim/passkey/verify", {
      transaction,
      challengeId: registration.json().challengeId,
      response: replacement.registration(registration.json().options.challenge),
    });

    expect(completed.statusCode).toBe(200);
    expect(completed.headers["set-cookie"]).toBeUndefined();
    const replacementCodes = completed.json().recoveryCodes as string[];
    expect(replacementCodes).toHaveLength(6);
    expect(replacementCodes.some((code) => oldCodes.includes(code))).toBe(false);
    expect((await request("/session", undefined, identity.token)).statusCode).toBe(401);
    expect((await request("/session", undefined, secondSession)).statusCode).toBe(401);
    const credentials = (await db.client.query<{ credential_id: string }>("SELECT credential_id FROM webauthn_credentials WHERE tenant_id='auth-tenant' AND application_id='auth-app' AND user_id=$1", [identity.user.id])).rows;
    expect(credentials).toEqual([{ credential_id: replacement.id }]);
    const storedCodes = (await db.client.query<{ verifier: string; consumed_at: unknown }>("SELECT verifier,consumed_at FROM recovery_codes WHERE tenant_id='auth-tenant' AND application_id='auth-app' AND user_id=$1", [identity.user.id])).rows;
    expect(storedCodes).toHaveLength(12);
    expect(storedCodes.every((row) => row.consumed_at !== null || !replacementCodes.some((code) => row.verifier.includes(code)))).toBe(true);
    expect((await request("/reclaim/verify", { accountId: identity.user.id, transaction, recoveryCode: oldCodes[0] })).statusCode).toBe(401);
    expect((await db.client.query<{ state: string }>("SELECT state FROM reclaim_transactions WHERE token_digest=$1", [digestToken(transaction)])).rows[0]?.state).toBe("COMPLETED");
    expect((await db.client.query("SELECT id FROM audit_events WHERE subject_id=$1 AND type='AUTH_RECOVERY_COMPLETED'", [identity.user.id])).rows).toHaveLength(1);

    const login = await request("/webauthn/login/options", { origin });
    const authenticated = await request("/webauthn/login/verify", { challengeId: login.json().challengeId, response: replacement.assertion(login.json().options.challenge, identity.user.id) });
    expect(authenticated.statusCode).toBe(200);
    expect((await request("/session", undefined, tokenFrom(authenticated))).json().user.id).toBe(identity.user.id);
    expect((await request("/webauthn/login/verify", { challengeId: login.json().challengeId, response: oldAuthenticator.assertion(login.json().options.challenge, identity.user.id) })).statusCode).toBe(401);
  });
  it("uses generic recovery failures and rejects cross-account, cross-application, replayed, expired and cancelled transactions", async () => {
    const identity = await account();
    const codes = identity.recoveryCodes;
    const started = await request("/reclaim/start", { accountId: identity.user.id });
    const transaction = started.json().transaction as string;
    const invalid = await request("/reclaim/verify", { accountId: identity.user.id, transaction, recoveryCode: secret().slice(0, 32) });
    const mismatched = await request("/reclaim/verify", { accountId: secret(), transaction, recoveryCode: codes[0] });
    expect(invalid.statusCode).toBe(401);
    expect(mismatched.statusCode).toBe(401);
    expect({ code: invalid.json().error.code, message: invalid.json().error.message }).toEqual({ code: mismatched.json().error.code, message: mismatched.json().error.message });
    expect((await request("/reclaim/verify", { accountId: identity.user.id, transaction, recoveryCode: codes[0] }, undefined, key2)).statusCode).toBe(401);
    expect((await request("/reclaim/verify", { accountId: identity.user.id, transaction, recoveryCode: codes[0] })).statusCode).toBe(200);
    expect((await request("/reclaim/verify", { accountId: identity.user.id, transaction, recoveryCode: codes[0] })).statusCode).toBe(401);

    const expired = await request("/reclaim/start", { accountId: identity.user.id });
    const expiredTransaction = expired.json().transaction as string;
    await db.client.query("UPDATE reclaim_transactions SET created_at=now()-interval '2 hours',expires_at=now()-interval '1 second' WHERE token_digest=$1", [digestToken(expiredTransaction)]);
    expect((await request("/reclaim/verify", { accountId: identity.user.id, transaction: expiredTransaction, recoveryCode: codes[1] })).statusCode).toBe(401);
    expect((await db.client.query<{ state: string }>("SELECT state FROM reclaim_transactions WHERE token_digest=$1", [digestToken(expiredTransaction)])).rows[0]?.state).toBe("EXPIRED");

    const cancelled = await request("/reclaim/start", { accountId: identity.user.id });
    const cancelledTransaction = cancelled.json().transaction as string;
    expect((await request("/reclaim/cancel", { transaction: cancelledTransaction })).statusCode).toBe(200);
    expect((await request("/reclaim/verify", { accountId: identity.user.id, transaction: cancelledTransaction, recoveryCode: codes[1] })).statusCode).toBe(401);
    expect((await db.client.query<{ state: string }>("SELECT state FROM reclaim_transactions WHERE token_digest=$1", [digestToken(cancelledTransaction)])).rows[0]?.state).toBe("CANCELLED");
  });
  it("consumes recovery codes and passkey replacement ceremonies exactly once", async () => {
    const identity = await account();
    const codes = identity.recoveryCodes;
    const started = await request("/reclaim/start", { accountId: identity.user.id });
    const transaction = started.json().transaction as string;
    const results = await Promise.all([
      request("/reclaim/verify", { accountId: identity.user.id, transaction, recoveryCode: codes[0] }),
      request("/reclaim/verify", { accountId: identity.user.id, transaction, recoveryCode: codes[0] }),
    ]);
    expect(results.map((result: { statusCode: number }) => result.statusCode).sort()).toEqual([200, 401]);
    const options = await request("/reclaim/passkey/options", { transaction, origin });
    const response = new TestAuthenticator().registration(options.json().options.challenge);
    const completes = await Promise.all([
      request("/reclaim/passkey/verify", { transaction, challengeId: options.json().challengeId, response }),
      request("/reclaim/passkey/verify", { transaction, challengeId: options.json().challengeId, response }),
    ]);
    expect(completes.map((result: { statusCode: number }) => result.statusCode).sort()).toEqual([200, 401]);
  });
  it("deletes only the authenticated account, revokes its sessions, and removes its authenticators", async () => {
    const identity = await account();
    const other = await account();
    const codes = identity.recoveryCodes;
    const response = await request("/account/delete", {}, identity.token);

    expect(response.statusCode).toBe(200);
    expect(String(response.headers["set-cookie"])).toContain("Max-Age=0");
    expect((await request("/session", undefined, identity.token)).statusCode).toBe(401);
    expect((await request("/session", undefined, other.token)).statusCode).toBe(200);
    const loginOptions = await request("/webauthn/login/options", { origin, accountId: identity.user.id });
    expect((await request("/webauthn/login/verify", { challengeId: loginOptions.json().challengeId,
      response: identity.authenticator.assertion(loginOptions.json().options.challenge, identity.user.id, { counter: 2 }) })).statusCode).toBe(401);
    expect((await db.client.query("SELECT id FROM webauthn_credentials WHERE user_id=$1", [identity.user.id])).rows).toHaveLength(0);
    expect((await db.client.query("SELECT id FROM recovery_codes WHERE user_id=$1 AND consumed_at IS NULL", [identity.user.id])).rows).toHaveLength(0);
    expect((await db.client.query("SELECT id FROM webauthn_credentials WHERE user_id=$1", [identity.user.id])).rows).toHaveLength(0);
    expect((await db.client.query("SELECT id FROM audit_events WHERE subject_id=$1 AND type='ACCOUNT_DELETION_COMPLETED' AND outcome='SUCCESS'", [identity.user.id])).rows).toHaveLength(1);
    expect((await db.client.query<{ data: Record<string, unknown> }>("SELECT data FROM user_resources WHERE user_id=$1", [identity.user.id])).rows[0]?.data).toEqual({});
    expect(codes).toHaveLength(6);
  });
});
