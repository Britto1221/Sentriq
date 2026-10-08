import { randomBytes } from "node:crypto";
import { describe, expect, it } from "vitest";
import type { AuthenticationResponseJSON, RegistrationResponseJSON } from "@simplewebauthn/server";
import { TestAuthenticator } from "../../../tests/support/test-authenticator";
import { createPasskeyServer, registrationContextDigest, type HostAccount, type PasskeyChallenge, type PasskeyCredential, type SentriqCoreStorage } from "./index";

const account: HostAccount = { id: "account-01", displayName: "Account Owner", active: true };

class HostMemoryStorage implements SentriqCoreStorage {
  readonly accounts = new Map([[account.id, account]]);
  readonly challenges = new Map<string, PasskeyChallenge>();
  readonly credentials = new Map<string, PasskeyCredential>();
  readonly enrollmentGrants = new Map<string, { userId: string; expiresAt: Date; consumed: boolean }>();
  readonly sessions: Array<{ userId: string; credentialId: string; sessionId: string; expiresAt: Date }> = [];

  async getAccountById(userId: string) { return this.accounts.get(userId) ?? null; }
  issueEnrollment(userId: string) {
    const value = randomBytes(32).toString("base64url");
    this.enrollmentGrants.set(registrationContextDigest(value), { userId, expiresAt: new Date(Date.now() + 10 * 60_000), consumed: false });
    return value;
  }
  async authorizeRegistration(input: { userId: string; registrationContextDigest: string; now: Date }) {
    const grant = this.enrollmentGrants.get(input.registrationContextDigest);
    return Boolean(grant && grant.userId === input.userId && !grant.consumed && grant.expiresAt > input.now);
  }
  async createChallenge(challenge: PasskeyChallenge) { this.challenges.set(challenge.id, challenge); }
  async consumeChallenge(input: { id: string; purpose: PasskeyChallenge["purpose"]; expectedUserId?: string; expectedRegistrationContextDigest?: string; now: Date }) {
    const challenge = this.challenges.get(input.id);
    if (!challenge || challenge.purpose !== input.purpose || challenge.expiresAt <= input.now
      || (input.expectedUserId !== undefined && challenge.userId !== input.expectedUserId)
      || (input.expectedRegistrationContextDigest !== undefined && challenge.registrationContextDigest !== input.expectedRegistrationContextDigest)) return null;
    this.challenges.delete(input.id);
    return challenge;
  }
  async listCredentials(userId: string) { return [...this.credentials.values()].filter((credential) => credential.userId === userId && !credential.revokedAt); }
  async getCredentialById(credentialId: string) { return this.credentials.get(credentialId) ?? null; }
  async insertCredential(credential: PasskeyCredential, input: { registrationContextDigest: string; now: Date }) {
    const grant = this.enrollmentGrants.get(input.registrationContextDigest);
    if (!grant || grant.userId !== credential.userId || grant.consumed || grant.expiresAt <= input.now) return false;
    if (this.credentials.has(credential.credentialId)) return false;
    grant.consumed = true;
    this.credentials.set(credential.credentialId, credential);
    return true;
  }
  async updateCredentialCounter(input: { credentialId: string; expectedCounter: number; newCounter: number }) {
    const existing = this.credentials.get(input.credentialId);
    if (!existing || existing.counter !== input.expectedCounter || existing.revokedAt) return false;
    this.credentials.set(input.credentialId, { ...existing, counter: input.newCounter });
    return true;
  }
  async createSession(input: { userId: string; credentialId: string; authenticatedAt: Date }) {
    const session = { userId: input.userId, credentialId: input.credentialId, sessionId: `host-session-${this.sessions.length + 1}`, expiresAt: new Date(input.authenticatedAt.getTime() + 60_000) };
    this.sessions.push(session);
    return { id: session.sessionId, expiresAt: session.expiresAt };
  }
}

function fixture(options: { now?: () => Date; challengeTtlMs?: number } = {}) {
  const storage = new HostMemoryStorage();
  const server = createPasskeyServer({
    rpName: "Independent Host",
    rpID: "localhost",
    allowedOrigins: ["http://localhost:4101"],
    ...(options.challengeTtlMs === undefined ? {} : { challengeTtlMs: options.challengeTtlMs }),
    storage,
    ...(options.now ? { now: options.now } : {}),
  });
  return { storage, server };
}

async function beginRegistration(server: ReturnType<typeof createPasskeyServer>, storage: HostMemoryStorage, enrolledAccount: HostAccount = account) {
  const registrationContext = storage.issueEnrollment(enrolledAccount.id);
  return { ...await server.registrationOptions({ account: enrolledAccount, origin: "http://localhost:4101", registrationContext }), registrationContext };
}

describe("host-storage Sentriq passkey server", () => {
  it("does not let an account identifier alone authorize passkey enrollment", async () => {
    const { server, storage } = fixture();

    await expect(server.registrationOptions({ account, origin: "http://localhost:4101" })).rejects.toMatchObject({ code: "AUTHENTICATION_FAILED" });
    expect(storage.challenges.size).toBe(0);
  });

  it("registers a host-created account without email and creates a host-owned session after verified login", async () => {
    const { storage, server } = fixture();
    const authenticator = new TestAuthenticator();
    const started = await beginRegistration(server, storage);

    const registered = await server.registrationVerify({ account, registrationContext: started.registrationContext, challengeId: started.challengeId, response: authenticator.registration(started.options.challenge, "http://localhost:4101") as RegistrationResponseJSON });
    expect(registered).toMatchObject({ userId: account.id, credentialId: authenticator.id });
    expect(storage.sessions).toHaveLength(0);
    expect(storage.credentials.get(authenticator.id)?.userId).toBe(account.id);

    const login = await server.authenticationOptions({ origin: "http://localhost:4101" });
    const result = await server.authenticationVerify({ challengeId: login.challengeId, response: authenticator.assertion(login.options.challenge, account.id, { origin: "http://localhost:4101" }) as AuthenticationResponseJSON });
    expect(result).toMatchObject({ userId: account.id, session: { id: "host-session-1" } });
    expect(storage.sessions).toHaveLength(1);
  });

  it("treats email as optional profile data rather than enrollment authorization", async () => {
    const { server, storage } = fixture();
    const accountWithOptionalEmail = { ...account, email: "profile@example.test" };
    await expect(server.registrationOptions({ account: accountWithOptionalEmail, origin: "http://localhost:4101" })).rejects.toMatchObject({ code: "AUTHENTICATION_FAILED" });
    const authorized = await beginRegistration(server, storage, accountWithOptionalEmail);
    expect(authorized.options.user.name).toBe(accountWithOptionalEmail.id);
  });

  it("uses an exact configured origin and consumes an invalid challenge once", async () => {
    const { storage, server } = fixture();
    const authenticator = new TestAuthenticator();
    const started = await beginRegistration(server, storage);
    await expect(server.registrationVerify({ account, registrationContext: started.registrationContext, challengeId: started.challengeId, response: authenticator.registration(started.options.challenge, "http://localhost:4102") as RegistrationResponseJSON })).rejects.toMatchObject({ code: "AUTHENTICATION_FAILED" });
    expect(storage.challenges.has(started.challengeId)).toBe(false);
    await expect(server.registrationVerify({ account, registrationContext: started.registrationContext, challengeId: started.challengeId, response: authenticator.registration(started.options.challenge, "http://localhost:4101") as RegistrationResponseJSON })).rejects.toMatchObject({ code: "AUTHENTICATION_FAILED" });
  });

  it("rejects invalid signatures and replayed authentication challenges without issuing a session", async () => {
    const { storage, server } = fixture();
    const authenticator = new TestAuthenticator();
    const registration = await beginRegistration(server, storage);
    await server.registrationVerify({ account, registrationContext: registration.registrationContext, challengeId: registration.challengeId, response: authenticator.registration(registration.options.challenge, "http://localhost:4101") as RegistrationResponseJSON });

    const invalid = await server.authenticationOptions({ origin: "http://localhost:4101" });
    await expect(server.authenticationVerify({ challengeId: invalid.challengeId, response: authenticator.assertion(invalid.options.challenge, account.id, { origin: "http://localhost:4101", badSignature: true }) as AuthenticationResponseJSON })).rejects.toMatchObject({ code: "AUTHENTICATION_FAILED" });
    expect(storage.sessions).toHaveLength(0);

    const valid = await server.authenticationOptions({ origin: "http://localhost:4101" });
    const response = authenticator.assertion(valid.options.challenge, account.id, { origin: "http://localhost:4101" }) as AuthenticationResponseJSON;
    await server.authenticationVerify({ challengeId: valid.challengeId, response });
    await expect(server.authenticationVerify({ challengeId: valid.challengeId, response })).rejects.toMatchObject({ code: "AUTHENTICATION_FAILED" });
    expect(storage.sessions).toHaveLength(1);
  });

  it("rejects a wrong RP ID, an assertion without user verification, and a credential with another account's user handle", async () => {
    const { server, storage } = fixture();
    const authenticator = new TestAuthenticator();
    const registration = await beginRegistration(server, storage);
    await server.registrationVerify({ account, registrationContext: registration.registrationContext, challengeId: registration.challengeId, response: authenticator.registration(registration.options.challenge, "http://localhost:4101") as RegistrationResponseJSON });

    // Keep each challenge explicitly paired with its response so a failure can
    // never be attributed to a mismatched test fixture.
    const wrongRp = await server.authenticationOptions({ origin: "http://localhost:4101" });
    await expect(server.authenticationVerify({ challengeId: wrongRp.challengeId, response: authenticator.assertion(wrongRp.options.challenge, account.id, { origin: "http://localhost:4101", rpId: "wrong.example" }) as AuthenticationResponseJSON })).rejects.toMatchObject({ code: "AUTHENTICATION_FAILED" });
    const noUv = await server.authenticationOptions({ origin: "http://localhost:4101" });
    await expect(server.authenticationVerify({ challengeId: noUv.challengeId, response: authenticator.assertion(noUv.options.challenge, account.id, { origin: "http://localhost:4101", uv: false }) as AuthenticationResponseJSON })).rejects.toMatchObject({ code: "AUTHENTICATION_FAILED" });
    const crossAccount = await server.authenticationOptions({ origin: "http://localhost:4101" });
    await expect(server.authenticationVerify({ challengeId: crossAccount.challengeId, response: authenticator.assertion(crossAccount.options.challenge, "another-account", { origin: "http://localhost:4101" }) as AuthenticationResponseJSON })).rejects.toMatchObject({ code: "AUTHENTICATION_FAILED" });
    expect(storage.sessions).toHaveLength(0);
  });

  it("supports multiple independent passkeys for one host account", async () => {
    const { server, storage } = fixture();
    const first = new TestAuthenticator();
    const second = new TestAuthenticator();
    const firstOptions = await beginRegistration(server, storage);
    await server.registrationVerify({ account, registrationContext: firstOptions.registrationContext, challengeId: firstOptions.challengeId, response: first.registration(firstOptions.options.challenge, "http://localhost:4101") as RegistrationResponseJSON });
    const secondOptions = await beginRegistration(server, storage);
    expect(secondOptions.options.excludeCredentials).toHaveLength(1);
    await server.registrationVerify({ account, registrationContext: secondOptions.registrationContext, challengeId: secondOptions.challengeId, response: second.registration(secondOptions.options.challenge, "http://localhost:4101") as RegistrationResponseJSON });
    expect(await storage.listCredentials(account.id)).toHaveLength(2);

    const login = await server.authenticationOptions({ origin: "http://localhost:4101" });
    await server.authenticationVerify({ challengeId: login.challengeId, response: second.assertion(login.options.challenge, account.id, { origin: "http://localhost:4101" }) as AuthenticationResponseJSON });
    expect(storage.sessions[0]?.credentialId).toBe(second.id);
  });

  it("atomically permits only one completion when the same challenge is submitted concurrently", async () => {
    const { server, storage } = fixture();
    const authenticator = new TestAuthenticator();
    const registration = await beginRegistration(server, storage);
    await server.registrationVerify({ account, registrationContext: registration.registrationContext, challengeId: registration.challengeId, response: authenticator.registration(registration.options.challenge, "http://localhost:4101") as RegistrationResponseJSON });
    const login = await server.authenticationOptions({ origin: "http://localhost:4101" });
    const response = authenticator.assertion(login.options.challenge, account.id, { origin: "http://localhost:4101" }) as AuthenticationResponseJSON;
    const results = await Promise.allSettled([
      server.authenticationVerify({ challengeId: login.challengeId, response }),
      server.authenticationVerify({ challengeId: login.challengeId, response }),
    ]);
    expect(results.filter((result) => result.status === "fulfilled")).toHaveLength(1);
    expect(storage.sessions).toHaveLength(1);
  });

  it("fails closed when the host adapter cannot atomically update the credential counter", async () => {
    const storage = new HostMemoryStorage();
    storage.updateCredentialCounter = async () => false;
    const server = createPasskeyServer({ rpName: "Independent Host", rpID: "localhost", allowedOrigins: ["http://localhost:4101"], storage });
    const authenticator = new TestAuthenticator();
    const registration = await beginRegistration(server, storage);
    await server.registrationVerify({ account, registrationContext: registration.registrationContext, challengeId: registration.challengeId, response: authenticator.registration(registration.options.challenge, "http://localhost:4101") as RegistrationResponseJSON });
    const login = await server.authenticationOptions({ origin: "http://localhost:4101" });
    await expect(server.authenticationVerify({ challengeId: login.challengeId, response: authenticator.assertion(login.options.challenge, account.id, { origin: "http://localhost:4101" }) as AuthenticationResponseJSON })).rejects.toMatchObject({ code: "AUTHENTICATION_FAILED" });
    expect(storage.sessions).toHaveLength(0);
  });

  it("expires stored challenges using the server clock", async () => {
    let current = new Date("2026-10-09T00:00:00.000Z");
    const { server } = fixture({ now: () => current, challengeTtlMs: 30_000 });
    const started = await server.authenticationOptions({ origin: "http://localhost:4101" });
    current = new Date(current.getTime() + 30_001);
    const response = new TestAuthenticator().assertion(started.options.challenge, account.id, { origin: "http://localhost:4101" }) as AuthenticationResponseJSON;
    await expect(server.authenticationVerify({ challengeId: started.challengeId, response })).rejects.toMatchObject({ code: "AUTHENTICATION_FAILED" });
  });
});
