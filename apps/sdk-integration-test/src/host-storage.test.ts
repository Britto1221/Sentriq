import { PGlite } from "@electric-sql/pglite";
import { describe, expect, it } from "vitest";
import { createPasskeyServer, type AuthenticationResponseJSON, type RegistrationResponseJSON } from "@sentriq/core";
import { TestAuthenticator } from "../../../tests/support/test-authenticator";
import { IndependentHostStorage } from "./host-storage";

const origin = "http://localhost:4102";

async function verifiedPendingAccount(storage: IndependentHostStorage, email: string) {
  await storage.startEmailVerification(email);
  const code = storage.getDevelopmentEmailCode(email)?.code;
  if (!code) throw new Error("Local inbox did not return the issued verification code");
  const result = await storage.verifyEmailCode({ email, code });
  if (!result?.registrationToken) throw new Error("Email verification did not create a restricted registration transaction");
  return result.account;
}

describe("independent host application integration", () => {
  it("registers and authenticates against its own PGlite account and session tables through public SDK exports", async () => {
    const client = new PGlite();
    const storage = new IndependentHostStorage(client);
    await storage.initialize();
    try {
      const account = await verifiedPendingAccount(storage, "independent@example.test");
      const passkeys = createPasskeyServer({ rpName: "Independent SDK Test", rpID: "localhost", allowedOrigins: [origin], storage });
      const authenticator = new TestAuthenticator();

      const registration = await passkeys.registrationOptions({ account, origin });
      const registered = await passkeys.registrationVerify({ account, challengeId: registration.challengeId, response: authenticator.registration(registration.options.challenge, origin) as RegistrationResponseJSON });
      expect(registered.userId).toBe(account.id);
      expect(await storage.getCredentialSummaries(account.id)).toHaveLength(1);
      expect((await client.query<{ count: number }>("SELECT count(*)::int AS count FROM host_sessions")).rows[0]?.count).toBe(0);

      const login = await passkeys.authenticationOptions({ origin });
      const authenticated = await passkeys.authenticationVerify({ challengeId: login.challengeId, response: authenticator.assertion(login.options.challenge, account.id, { origin }) as AuthenticationResponseJSON });
      expect(authenticated.userId).toBe(account.id);
      await expect(storage.getSessionByToken(authenticated.session.id)).resolves.toMatchObject({ userId: account.id, status: "active" });
      expect((await client.query<{ count: number }>("SELECT count(*)::int AS count FROM host_users")).rows[0]?.count).toBe(1);
    } finally {
      await client.close();
    }
  });

  it("rejects replay after a persisted challenge was consumed once", async () => {
    const client = new PGlite();
    const storage = new IndependentHostStorage(client);
    await storage.initialize();
    try {
      const account = await verifiedPendingAccount(storage, "replay@example.test");
      const passkeys = createPasskeyServer({ rpName: "Independent SDK Test", rpID: "localhost", allowedOrigins: [origin], storage });
      const authenticator = new TestAuthenticator();
      const registration = await passkeys.registrationOptions({ account, origin });
      await passkeys.registrationVerify({ account, challengeId: registration.challengeId, response: authenticator.registration(registration.options.challenge, origin) as RegistrationResponseJSON });
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
  });

  it("consumes the local email code once and consumes its restricted registration grant with credential insertion", async () => {
    const client = new PGlite();
    const storage = new IndependentHostStorage(client);
    await storage.initialize();
    try {
      await storage.startEmailVerification("one-time@example.test");
      const code = storage.getDevelopmentEmailCode("one-time@example.test")?.code;
      expect(code).toBeTruthy();
      const result = await storage.verifyEmailCode({ email: "one-time@example.test", code: code! });
      expect(result?.registrationToken).toBeTruthy();
      expect(storage.getDevelopmentEmailCode("one-time@example.test")).toBeNull();
      await expect(storage.verifyEmailCode({ email: "one-time@example.test", code: code! })).resolves.toBeNull();
      const account = result!.account;
      const passkeys = createPasskeyServer({ rpName: "Independent SDK Test", rpID: "localhost", allowedOrigins: [origin], storage });
      const authenticator = new TestAuthenticator();
      const registration = await passkeys.registrationOptions({ account, origin });
      await passkeys.registrationVerify({ account, challengeId: registration.challengeId, response: authenticator.registration(registration.options.challenge, origin) as RegistrationResponseJSON });
      expect(await storage.getPendingRegistration(result!.registrationToken!)).toBeNull();
      expect(await storage.canRegisterFirstPasskey(account.id)).toBe(false);
    } finally { await client.close(); }
  });

  it("rate limits verification messages without changing authentication state", async () => {
    const client = new PGlite();
    const storage = new IndependentHostStorage(client);
    await storage.initialize();
    try {
      await storage.startEmailVerification("rate@example.test");
      await expect(storage.startEmailVerification("rate@example.test")).rejects.toThrow("EMAIL_RATE_LIMITED");
      expect((await client.query<{ count: number }>("SELECT count(*)::int AS count FROM host_users")).rows[0]?.count).toBe(0);
    } finally { await client.close(); }
  });
});
