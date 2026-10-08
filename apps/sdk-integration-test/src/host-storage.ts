import { createHash, randomBytes, randomUUID } from "node:crypto";
import { PGlite } from "@electric-sql/pglite";
import type { HostAccount, HostSession, PasskeyChallenge, PasskeyCredential, SentriqCoreStorage } from "@sentriq/core";

const digest = (value: string) => createHash("sha256").update(value, "utf8").digest("hex");

/**
 * Independent sample host adapter. It owns users, passkey rows, challenge
 * lifecycle, and browser sessions in this app's own PostgreSQL-compatible
 * database. Northstar's schema and API are not imported here.
 */
export class IndependentHostStorage implements SentriqCoreStorage {
  readonly #emailInbox = new Map<string, { code: string; expiresAt: Date }>();

  constructor(readonly client: PGlite) {}

  async initialize(): Promise<void> {
    await this.client.exec(`
      CREATE TABLE IF NOT EXISTS host_users (
        id uuid PRIMARY KEY,
        email text NOT NULL UNIQUE,
        display_name text NOT NULL,
        email_verified_at timestamptz NOT NULL,
        disabled_at timestamptz
      );
      CREATE TABLE IF NOT EXISTS host_passkeys (
        credential_id text PRIMARY KEY,
        user_id uuid NOT NULL REFERENCES host_users(id),
        public_key bytea NOT NULL,
        counter bigint NOT NULL DEFAULT 0,
        transports text[] NOT NULL DEFAULT '{}',
        device_type text NOT NULL,
        backed_up boolean NOT NULL,
        created_at timestamptz NOT NULL DEFAULT now(),
        revoked_at timestamptz
      );
      CREATE INDEX IF NOT EXISTS host_passkeys_user_idx ON host_passkeys(user_id) WHERE revoked_at IS NULL;
      CREATE TABLE IF NOT EXISTS host_challenges (
        id uuid PRIMARY KEY,
        purpose text NOT NULL CHECK (purpose IN ('registration','authentication')),
        user_id uuid REFERENCES host_users(id),
        challenge text NOT NULL,
        origin text NOT NULL,
        rp_id text NOT NULL,
        created_at timestamptz NOT NULL,
        expires_at timestamptz NOT NULL,
        consumed_at timestamptz,
        CHECK (expires_at > created_at)
      );
      CREATE TABLE IF NOT EXISTS host_sessions (
        token_digest text PRIMARY KEY,
        user_id uuid NOT NULL REFERENCES host_users(id),
        credential_id text NOT NULL REFERENCES host_passkeys(credential_id),
        created_at timestamptz NOT NULL,
        expires_at timestamptz NOT NULL,
        revoked_at timestamptz,
        CHECK (expires_at > created_at)
      );
      CREATE TABLE IF NOT EXISTS host_email_codes (
        email text PRIMARY KEY,
        verifier text NOT NULL,
        created_at timestamptz NOT NULL DEFAULT now(),
        expires_at timestamptz NOT NULL,
        attempts integer NOT NULL DEFAULT 0,
        send_count integer NOT NULL DEFAULT 1,
        consumed_at timestamptz,
        CHECK (attempts BETWEEN 0 AND 5),
        CHECK (send_count BETWEEN 1 AND 5)
      );
      CREATE TABLE IF NOT EXISTS host_pending_registrations (
        token_digest text PRIMARY KEY,
        user_id uuid NOT NULL REFERENCES host_users(id),
        expires_at timestamptz NOT NULL,
        consumed_at timestamptz
      );
    `);
    await this.client.exec("ALTER TABLE host_email_codes ADD COLUMN IF NOT EXISTS send_count integer NOT NULL DEFAULT 1");
  }

  async startEmailVerification(emailInput: string): Promise<{ expiresAt: Date }> {
    const email = emailInput.trim().toLowerCase();
    if (!/^\S+@\S+\.\S+$/.test(email) || email.length > 254) throw new Error("Invalid host account");
    const code = randomBytes(9).toString("base64url");
    const expiresAt = new Date(Date.now() + 10 * 60_000);
    await this.client.transaction(async (tx) => {
      const lockKey = createHash("sha256").update(email, "utf8").digest().readInt32BE(0);
      await tx.query("SELECT pg_advisory_xact_lock($1::integer)", [lockKey]);
      const prior = (await tx.query<{ created_at: Date; send_count: number }>(
        "SELECT created_at,send_count FROM host_email_codes WHERE email=$1 FOR UPDATE", [email],
      )).rows[0];
      if (prior && prior.created_at.getTime() > Date.now() - 60_000) throw new Error("EMAIL_RATE_LIMITED");
      if (prior && prior.created_at.getTime() > Date.now() - 24 * 60 * 60_000 && prior.send_count >= 5) throw new Error("EMAIL_RATE_LIMITED");
      await tx.query(
        `INSERT INTO host_email_codes(email,verifier,expires_at,attempts,send_count,consumed_at)
         VALUES ($1,$2,$3,0,1,NULL)
         ON CONFLICT (email) DO UPDATE SET verifier=EXCLUDED.verifier,expires_at=EXCLUDED.expires_at,
           attempts=0,send_count=CASE WHEN host_email_codes.created_at > now()-interval '24 hours'
             THEN LEAST(host_email_codes.send_count+1,5) ELSE 1 END,
           consumed_at=NULL,created_at=now()`,
        [email, digest(code), expiresAt],
      );
    });
    this.#emailInbox.set(email, { code, expiresAt });
    return { expiresAt };
  }

  getDevelopmentEmailCode(emailInput: string): { code: string; expiresAt: Date } | null {
    const email = emailInput.trim().toLowerCase();
    const value = this.#emailInbox.get(email);
    if (!value || value.expiresAt <= new Date()) return null;
    return value;
  }

  async verifyEmailCode(input: { email: string; code: string }): Promise<{ account: HostAccount; registrationToken: string | null } | null> {
    const email = input.email.trim().toLowerCase();
    return this.client.transaction(async (tx) => {
      const code = (await tx.query<{ verifier: string; expires_at: Date; attempts: number; consumed_at: Date | null }>(
        "SELECT verifier,expires_at,attempts,consumed_at FROM host_email_codes WHERE email=$1 FOR UPDATE", [email],
      )).rows[0];
      if (!code || code.consumed_at || code.expires_at <= new Date() || code.attempts >= 5) return null;
      if (code.verifier !== digest(input.code)) {
        await tx.query("UPDATE host_email_codes SET attempts=LEAST(attempts+1,5) WHERE email=$1", [email]);
        return null;
      }
      await tx.query("UPDATE host_email_codes SET consumed_at=now() WHERE email=$1 AND consumed_at IS NULL", [email]);
      this.#emailInbox.delete(email);
      const userId = randomUUID();
      await tx.query("INSERT INTO host_users(id,email,display_name,email_verified_at) VALUES ($1,$2,$3,now()) ON CONFLICT (email) DO NOTHING", [userId, email, email.slice(0, email.indexOf("@")) || "User"]);
      const userRow = (await tx.query<{ id: string; email: string; display_name: string; email_verified_at: Date | null; disabled_at: Date | null }>(
        "SELECT id,email,display_name,email_verified_at,disabled_at FROM host_users WHERE email=$1", [email],
      )).rows[0];
      if (!userRow) return null;
      const account = this.#account(userRow);
      const hasPasskey = (await tx.query("SELECT 1 FROM host_passkeys WHERE user_id=$1 AND revoked_at IS NULL LIMIT 1", [account.id])).rows.length > 0;
      if (hasPasskey) return { account, registrationToken: null };
      const registrationToken = randomBytes(32).toString("base64url");
      await tx.query("INSERT INTO host_pending_registrations(token_digest,user_id,expires_at) VALUES ($1,$2,now()+interval '10 minutes')", [digest(registrationToken), account.id]);
      return { account, registrationToken };
    });
  }

  async getPendingRegistration(token: string): Promise<HostAccount | null> {
    const row = (await this.client.query<{ id: string; email: string; display_name: string; email_verified_at: Date | null; disabled_at: Date | null }>(
      `SELECT u.id,u.email,u.display_name,u.email_verified_at,u.disabled_at FROM host_pending_registrations p
       JOIN host_users u ON u.id=p.user_id
       WHERE p.token_digest=$1 AND p.consumed_at IS NULL AND p.expires_at>now()
         AND u.email_verified_at IS NOT NULL AND u.disabled_at IS NULL
         AND NOT EXISTS (SELECT 1 FROM host_passkeys c WHERE c.user_id=u.id AND c.revoked_at IS NULL)`,
      [digest(token)],
    )).rows[0];
    return row ? this.#account(row) : null;
  }

  async consumePendingRegistration(token: string): Promise<boolean> {
    const consumed = await this.client.query(
      `UPDATE host_pending_registrations p SET consumed_at=now()
       WHERE p.token_digest=$1 AND p.consumed_at IS NULL AND p.expires_at>now()
         AND NOT EXISTS (SELECT 1 FROM host_passkeys c WHERE c.user_id=p.user_id AND c.revoked_at IS NULL)
       RETURNING p.user_id`,
      [digest(token)],
    );
    return consumed.rows.length === 1;
  }

  async canRegisterFirstPasskey(userId: string): Promise<boolean> {
    return (await this.client.query("SELECT 1 FROM host_pending_registrations p WHERE p.user_id=$1 AND p.consumed_at IS NULL AND p.expires_at>now()", [userId])).rows.length > 0
      && (await this.client.query("SELECT 1 FROM host_passkeys WHERE user_id=$1 AND revoked_at IS NULL", [userId])).rows.length === 0;
  }

  #account(row: { id: string; email: string; display_name: string; email_verified_at: Date | null; disabled_at: Date | null }): HostAccount {
    return { id: row.id, email: row.email, displayName: row.display_name, emailVerified: row.email_verified_at !== null, active: row.disabled_at === null };
  }

  async getAccountById(userId: string): Promise<HostAccount | null> {
    const row = (await this.client.query<{ id: string; email: string; display_name: string; email_verified_at: Date | null; disabled_at: Date | null }>(
      "SELECT id,email,display_name,email_verified_at,disabled_at FROM host_users WHERE id=$1", [userId],
    )).rows[0];
    return row ? this.#account(row) : null;
  }

  async createChallenge(challenge: PasskeyChallenge): Promise<void> {
    await this.client.query(
      "INSERT INTO host_challenges(id,purpose,user_id,challenge,origin,rp_id,created_at,expires_at) VALUES ($1,$2,$3,$4,$5,$6,$7,$8)",
      [challenge.id, challenge.purpose, challenge.userId, challenge.challenge, challenge.origin, challenge.rpID, challenge.createdAt, challenge.expiresAt],
    );
  }

  async consumeChallenge(input: { id: string; purpose: PasskeyChallenge["purpose"]; expectedUserId?: string; now: Date }): Promise<PasskeyChallenge | null> {
    const row = (await this.client.query<{ id: string; purpose: PasskeyChallenge["purpose"]; user_id: string | null; challenge: string; origin: string; rp_id: string; created_at: Date; expires_at: Date }>(
      `UPDATE host_challenges SET consumed_at=$4
       WHERE id=$1 AND purpose=$2 AND consumed_at IS NULL AND expires_at>$4
         AND ($3::uuid IS NULL OR user_id=$3)
       RETURNING id,purpose,user_id,challenge,origin,rp_id,created_at,expires_at`,
      [input.id, input.purpose, input.expectedUserId ?? null, input.now],
    )).rows[0];
    return row ? { id: row.id, purpose: row.purpose, userId: row.user_id, challenge: row.challenge, origin: row.origin, rpID: row.rp_id, createdAt: row.created_at, expiresAt: row.expires_at } : null;
  }

  async listCredentials(userId: string): Promise<PasskeyCredential[]> {
    const rows = (await this.client.query<{ user_id: string; credential_id: string; public_key: Uint8Array; counter: number; transports: string[]; device_type: PasskeyCredential["deviceType"]; backed_up: boolean; created_at: Date; revoked_at: Date | null }>(
      "SELECT user_id,credential_id,public_key,counter,transports,device_type,backed_up,created_at,revoked_at FROM host_passkeys WHERE user_id=$1 AND revoked_at IS NULL ORDER BY created_at",
      [userId],
    )).rows;
    return rows.map((row) => this.#credential(row));
  }

  async getCredentialById(credentialId: string): Promise<PasskeyCredential | null> {
    const row = (await this.client.query<{ user_id: string; credential_id: string; public_key: Uint8Array; counter: number; transports: string[]; device_type: PasskeyCredential["deviceType"]; backed_up: boolean; created_at: Date; revoked_at: Date | null }>(
      "SELECT user_id,credential_id,public_key,counter,transports,device_type,backed_up,created_at,revoked_at FROM host_passkeys WHERE credential_id=$1",
      [credentialId],
    )).rows[0];
    return row ? this.#credential(row) : null;
  }

  #credential(row: { user_id: string; credential_id: string; public_key: Uint8Array; counter: number; transports: string[]; device_type: PasskeyCredential["deviceType"]; backed_up: boolean; created_at: Date; revoked_at: Date | null }): PasskeyCredential {
    const allowedTransports = new Set(["ble", "hybrid", "internal", "nfc", "usb"]);
    return {
      userId: row.user_id,
      credentialId: row.credential_id,
      publicKey: new Uint8Array(row.public_key),
      counter: Number(row.counter),
      transports: row.transports.filter((transport): transport is PasskeyCredential["transports"][number] => allowedTransports.has(transport)),
      deviceType: row.device_type,
      backedUp: row.backed_up,
      createdAt: row.created_at,
      revokedAt: row.revoked_at,
    };
  }

  async insertCredential(credential: PasskeyCredential): Promise<boolean> {
    return this.client.transaction(async (tx) => {
      await tx.query("SELECT id FROM host_users WHERE id=$1 AND email_verified_at IS NOT NULL AND disabled_at IS NULL FOR UPDATE", [credential.userId]);
      const existing = await tx.query("SELECT 1 FROM host_passkeys WHERE user_id=$1 AND revoked_at IS NULL LIMIT 1", [credential.userId]);
      if (existing.rows.length) return false;
      // Consume the registration grant in the same transaction as credential
      // insertion. A copied grant cannot authorize another enrollment.
      const pending = await tx.query(
        `UPDATE host_pending_registrations SET consumed_at=now()
         WHERE user_id=$1 AND consumed_at IS NULL AND expires_at>now()
         RETURNING user_id`,
        [credential.userId],
      );
      if (pending.rows.length !== 1) return false;
      const inserted = await tx.query(
        `INSERT INTO host_passkeys(credential_id,user_id,public_key,counter,transports,device_type,backed_up,created_at)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8) ON CONFLICT (credential_id) DO NOTHING RETURNING credential_id`,
        [credential.credentialId, credential.userId, credential.publicKey, credential.counter, credential.transports, credential.deviceType, credential.backedUp, credential.createdAt],
      );
      return inserted.rows.length === 1;
    });
  }

  async updateCredentialCounter(input: { credentialId: string; expectedCounter: number; newCounter: number }): Promise<boolean> {
    const updated = await this.client.query(
      "UPDATE host_passkeys SET counter=$3 WHERE credential_id=$1 AND counter=$2 AND revoked_at IS NULL RETURNING credential_id",
      [input.credentialId, input.expectedCounter, input.newCounter],
    );
    return updated.rows.length === 1;
  }

  async createSession(input: { userId: string; credentialId: string; authenticatedAt: Date }): Promise<HostSession> {
    const opaqueSession = randomBytes(32).toString("base64url");
    const expiresAt = new Date(input.authenticatedAt.getTime() + 12 * 60 * 60_000);
    await this.client.query(
      "INSERT INTO host_sessions(token_digest,user_id,credential_id,created_at,expires_at) VALUES ($1,$2,$3,$4,$5)",
      [digest(opaqueSession), input.userId, input.credentialId, input.authenticatedAt, expiresAt],
    );
    return { id: opaqueSession, expiresAt };
  }

  async getSessionByToken(opaqueSession: string): Promise<{ userId: string; status: "active" | "revoked" | "expired" } | null> {
    const row = (await this.client.query<{ user_id: string; revoked_at: Date | null; expires_at: Date }>(
      "SELECT user_id,revoked_at,expires_at FROM host_sessions WHERE token_digest=$1", [digest(opaqueSession)],
    )).rows[0];
    if (!row) return null;
    return { userId: row.user_id, status: row.revoked_at ? "revoked" : row.expires_at <= new Date() ? "expired" : "active" };
  }

  async revokeSession(opaqueSession: string): Promise<void> {
    await this.client.query("UPDATE host_sessions SET revoked_at=now() WHERE token_digest=$1 AND revoked_at IS NULL", [digest(opaqueSession)]);
  }

  async getCredentialSummaries(userId: string) {
    return (await this.client.query<{ credential_id: string; created_at: Date; device_type: string; backed_up: boolean }>(
      "SELECT credential_id,created_at,device_type,backed_up FROM host_passkeys WHERE user_id=$1 AND revoked_at IS NULL ORDER BY created_at",
      [userId],
    )).rows.map((row) => ({
      id: row.credential_id,
      createdAt: row.created_at.toISOString(),
      deviceType: row.device_type,
      backedUp: row.backed_up,
    }));
  }
}
