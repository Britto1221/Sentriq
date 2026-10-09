import { PGlite } from "@electric-sql/pglite";
import { describe, expect, it } from "vitest";
import { createPasskeyServer, type AuthenticationResponseJSON, type RegistrationResponseJSON } from "@sentriq/core";
import { TestAuthenticator } from "../../../tests/support/test-authenticator";
import { IndependentHostStorage } from "./host-storage";

const origin = "http://localhost:4102";

describe("independent host application integration", () => {
  it("creates an account without email and registers/authenticates with the host-issued enrollment grant", async () => {
    const client = new PGlite();
    const storage = new IndependentHostStorage(client);
    await storage.initialize();
    try {
      const { account, enrollmentToken } = await storage.createAccount({ displayName: "Independent User" });
      const passkeys = createPasskeyServer({ rpName: "Independent SDK Test", rpID: "localhost", allowedOrigins: [origin], storage });
      const authenticator = new TestAuthenticator();

      const registration = await passkeys.registrationOptions({ account, origin, registrationContext: enrollmentToken });
      const registered = await passkeys.registrationVerify({ account, registrationContext: enrollmentToken, challengeId: registration.challengeId, response: authenticator.registration(registration.options.challenge, origin) as RegistrationResponseJSON });
      expect(registered.userId).toBe(account.id);
      expect(await storage.getCredentialSummaries(account.id)).toHaveLength(1);
      expect((await client.query<{ count: number }>("SELECT count(*)::int AS count FROM host_sessions")).rows[0]?.count).toBe(0);

      const login = await passkeys.authenticationOptions({ origin });
      const authenticated = await passkeys.authenticationVerify({ challengeId: login.challengeId, response: authenticator.assertion(login.options.challenge, account.id, { origin }) as AuthenticationResponseJSON });
      expect(authenticated.userId).toBe(account.id);
      await expect(storage.getSessionByToken(authenticated.session.id)).resolves.toMatchObject({ userId: account.id, status: "active" });
      expect((await client.query<{ count: number }>("SELECT count(*)::int AS count FROM host_users WHERE email IS NULL")).rows[0]?.count).toBe(1);
    } finally {
      await client.close();
    }
  }, 20_000);

  it("rejects replay after a persisted challenge was consumed once", async () => {
    const client = new PGlite();
    const storage = new IndependentHostStorage(client);
    await storage.initialize();
    try {
      const { account, enrollmentToken } = await storage.createAccount({ displayName: "Replay User" });
      const passkeys = createPasskeyServer({ rpName: "Independent SDK Test", rpID: "localhost", allowedOrigins: [origin], storage });
      const authenticator = new TestAuthenticator();
      const registration = await passkeys.registrationOptions({ account, origin, registrationContext: enrollmentToken });
      await passkeys.registrationVerify({ account, registrationContext: enrollmentToken, challengeId: registration.challengeId, response: authenticator.registration(registration.options.challenge, origin) as RegistrationResponseJSON });
      const login = await passkeys.authenticationOptions({ origin });
      const assertion = authenticator.assertion(login.options.challenge, account.id, { origin }) as AuthenticationResponseJSON;
      const outcomes = await Promise.allSettled([
        passkeys.authenticationVerify({ challengeId: login.challengeId, response: assertion }),
        passkeys.authenticationVerify({ challengeId: login.challengeId, response: assertion }),
      ]);
      expect(outcomes.filter((outcome) => outcome.status === "fulfilled")).toHaveLength(1);
      expect((await client.query<{ count: number }>("SELECT count(*)::int AS count FROM host_sessions")).rows[0]?.count).toBe(1);
    } finally {
      await client.close();
    }
  }, 20_000);

  it("rejects enrollment by account ID alone and consumes a host-issued enrollment grant with credential insertion", async () => {
    const client = new PGlite();
    const storage = new IndependentHostStorage(client);
    await storage.initialize();
    try {
      const { account, enrollmentToken } = await storage.createAccount({ displayName: "Grant Owner" });
      const passkeys = createPasskeyServer({ rpName: "Independent SDK Test", rpID: "localhost", allowedOrigins: [origin], storage });
      await expect(passkeys.registrationOptions({ account, origin, registrationContext: "A".repeat(43) })).rejects.toMatchObject({ code: "AUTHENTICATION_FAILED" });
      const authenticator = new TestAuthenticator();
      const registration = await passkeys.registrationOptions({ account, origin, registrationContext: enrollmentToken });
      await passkeys.registrationVerify({ account, registrationContext: enrollmentToken, challengeId: registration.challengeId, response: authenticator.registration(registration.options.challenge, origin) as RegistrationResponseJSON });
      await expect(passkeys.registrationOptions({ account, origin, registrationContext: enrollmentToken })).rejects.toMatchObject({ code: "AUTHENTICATION_FAILED" });
      expect((await storage.getCredentialSummaries(account.id))).toHaveLength(1);
    } finally { await client.close(); }
  });

  it("does not use optional email as an account lookup or account-creation key", async () => {
    const client = new PGlite();
    const storage = new IndependentHostStorage(client);
    await storage.initialize();
    try {
      const first = await storage.createAccount({ displayName: "First" });
      const second = await storage.createAccount({ displayName: "Second" });
      expect(first.account.id === second.account.id).toBe(false);
      expect((await client.query<{ count: number }>("SELECT count(*)::int AS count FROM host_users")).rows[0]?.count).toBe(2);
    } finally { await client.close(); }
  });
});
