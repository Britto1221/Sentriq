import { createHash, randomBytes, randomUUID } from "node:crypto";
import { PGlite } from "@electric-sql/pglite";
import { registrationContextDigest, type HostAccount, type HostSession, type PasskeyChallenge, type PasskeyCredential, type SentriqCoreStorage } from "@sentriq/core";

const digest = (value: string) => createHash("sha256").update(value, "utf8").digest("hex");
const opaque = () => randomBytes(32).toString("base64url");

/**
 * Independent sample host adapter. It owns its account IDs, passkey rows,
 * enrollment grants, challenges, and sessions in its own PostgreSQL-compatible
 * database. Email is an optional profile field and is not used as identity.
 */
export class IndependentHostStorage implements SentriqCoreStorage {
  constructor(readonly client: PGlite) {}

  async initialize(): Promise<void> {
    await this.client.exec(`
      CREATE TABLE IF NOT EXISTS host_users (
        id uuid PRIMARY KEY,
        email text UNIQUE,
        display_name text NOT NULL,
        disabled_at timestamptz
      );
      ALTER TABLE host_users ALTER COLUMN email DROP NOT NULL;
      ALTER TABLE host_users DROP COLUMN IF EXISTS email_verified_at;
      DROP TABLE IF EXISTS host_email_codes;
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
        registration_context_digest text,
        created_at timestamptz NOT NULL,
        expires_at timestamptz NOT NULL,
        consumed_at timestamptz,
        CHECK (expires_at > created_at),
        CHECK (registration_context_digest IS NULL OR registration_context_digest ~ '^[a-f0-9]{64}$')
      );
      ALTER TABLE host_challenges ADD COLUMN IF NOT EXISTS registration_context_digest text;
      CREATE TABLE IF NOT EXISTS host_sessions (
        token_digest text PRIMARY KEY,
        user_id uuid NOT NULL REFERENCES host_users(id),
        credential_id text NOT NULL REFERENCES host_passkeys(credential_id),
        created_at timestamptz NOT NULL,
        expires_at timestamptz NOT NULL,
        revoked_at timestamptz,
        CHECK (expires_at > created_at)
      );
      CREATE TABLE IF NOT EXISTS host_pending_registrations (
        token_digest text PRIMARY KEY,
        user_id uuid NOT NULL REFERENCES host_users(id),
        expires_at timestamptz NOT NULL,
        consumed_at timestamptz
      );
    `);
  }

  /** Host-controlled sign-up creates a new internal identity; it never looks up by email. */
  async createAccount(input: { displayName: string }): Promise<{ account: HostAccount; enrollmentToken: string }> {
    const displayName = input.displayName.trim();
    if (!displayName || displayName.length > 100) throw new Error("Invalid host account");
    const id = randomUUID();
    const enrollmentToken = opaque();
    await this.client.transaction(async (tx) => {
      await tx.query("INSERT INTO host_users(id,email,display_name) VALUES ($1,NULL,$2)", [id, displayName]);
      await tx.query("INSERT INTO host_pending_registrations(token_digest,user_id,expires_at) VALUES ($1,$2,now()+interval '10 minutes')", [digest(enrollmentToken), id]);
    });
    return { account: { id, displayName, active: true }, enrollmentToken };
  }

  async getPendingRegistration(token: string): Promise<HostAccount | null> {
    const row = (await this.client.query<{ id: string; email: string | null; display_name: string; disabled_at: Date | null }>(
      `SELECT u.id,u.email,u.display_name,u.disabled_at FROM host_pending_registrations p
       JOIN host_users u ON u.id=p.user_id
       WHERE p.token_digest=$1 AND p.consumed_at IS NULL AND p.expires_at>now() AND u.disabled_at IS NULL`,
      [digest(token)],
    )).rows[0];
    return row ? this.#account(row) : null;
  }

  async authorizeRegistration(input: { userId: string; registrationContextDigest: string; now: Date }): Promise<boolean> {
    const row = (await this.client.query(
      `SELECT 1 FROM host_pending_registrations p JOIN host_users u ON u.id=p.user_id
       WHERE p.token_digest=$1 AND p.user_id=$2 AND p.consumed_at IS NULL AND p.expires_at>$3 AND u.disabled_at IS NULL`,
      [input.registrationContextDigest, input.userId, input.now],
    )).rows[0];
    return Boolean(row);
  }

  #account(row: { id: string; email: string | null; display_name: string; disabled_at: Date | null }): HostAccount {
    return { id: row.id, email: row.email, displayName: row.display_name, active: row.disabled_at === null };
  }

  async getAccountById(userId: string): Promise<HostAccount | null> {
    const row = (await this.client.query<{ id: string; email: string | null; display_name: string; disabled_at: Date | null }>(
      "SELECT id,email,display_name,disabled_at FROM host_users WHERE id=$1", [userId],
    )).rows[0];
    return row ? this.#account(row) : null;
  }

  async createChallenge(challenge: PasskeyChallenge): Promise<void> {
    await this.client.query(
      `INSERT INTO host_challenges(id,purpose,user_id,challenge,origin,rp_id,registration_context_digest,created_at,expires_at)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)`,
      [challenge.id, challenge.purpose, challenge.userId, challenge.challenge, challenge.origin, challenge.rpID, challenge.registrationContextDigest, challenge.createdAt, challenge.expiresAt],
    );
  }

  async consumeChallenge(input: { id: string; purpose: PasskeyChallenge["purpose"]; expectedUserId?: string; expectedRegistrationContextDigest?: string; now: Date }): Promise<PasskeyChallenge | null> {
    const row = (await this.client.query<{ id: string; purpose: PasskeyChallenge["purpose"]; user_id: string | null; challenge: string; origin: string; rp_id: string; registration_context_digest: string | null; created_at: Date; expires_at: Date }>(
      `UPDATE host_challenges SET consumed_at=$4
       WHERE id=$1 AND purpose=$2 AND consumed_at IS NULL AND expires_at>$4
         AND ($3::uuid IS NULL OR user_id=$3)
         AND ($5::text IS NULL OR registration_context_digest=$5)
       RETURNING id,purpose,user_id,challenge,origin,rp_id,registration_context_digest,created_at,expires_at`,
      [input.id, input.purpose, input.expectedUserId ?? null, input.now, input.expectedRegistrationContextDigest ?? null],
    )).rows[0];
    return row ? { id: row.id, purpose: row.purpose, userId: row.user_id, challenge: row.challenge, origin: row.origin, rpID: row.rp_id, registrationContextDigest: row.registration_context_digest, createdAt: row.created_at, expiresAt: row.expires_at } : null;
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
    return { userId: row.user_id, credentialId: row.credential_id, publicKey: new Uint8Array(row.public_key), counter: Number(row.counter),
      transports: row.transports.filter((transport): transport is PasskeyCredential["transports"][number] => allowedTransports.has(transport)),
      deviceType: row.device_type, backedUp: row.backed_up, createdAt: row.created_at, revokedAt: row.revoked_at };
  }

  async insertCredential(credential: PasskeyCredential, input: { registrationContextDigest: string; now: Date }): Promise<boolean> {
    try {
      return await this.client.transaction(async (tx) => {
        const account = (await tx.query("SELECT id FROM host_users WHERE id=$1 AND disabled_at IS NULL FOR UPDATE", [credential.userId])).rows[0];
        const grant = (await tx.query("SELECT user_id FROM host_pending_registrations WHERE token_digest=$1 AND user_id=$2 AND consumed_at IS NULL AND expires_at>$3 FOR UPDATE", [input.registrationContextDigest, credential.userId, input.now])).rows[0];
        if (!account || !grant) return false;
        const inserted = await tx.query(
          `INSERT INTO host_passkeys(credential_id,user_id,public_key,counter,transports,device_type,backed_up,created_at)
           VALUES ($1,$2,$3,$4,$5,$6,$7,$8) ON CONFLICT (credential_id) DO NOTHING RETURNING credential_id`,
          [credential.credentialId, credential.userId, credential.publicKey, credential.counter, credential.transports, credential.deviceType, credential.backedUp, credential.createdAt],
        );
        if (!inserted.rows.length) return false;
        const consumed = await tx.query(
          "UPDATE host_pending_registrations SET consumed_at=$3 WHERE token_digest=$1 AND user_id=$2 AND consumed_at IS NULL AND expires_at>$3 RETURNING user_id",
          [input.registrationContextDigest, credential.userId, input.now],
        );
        if (consumed.rows.length !== 1) throw new Error("Enrollment grant consumption failed");
        return true;
      });
    } catch { return false; }
  }

  async updateCredentialCounter(input: { credentialId: string; expectedCounter: number; newCounter: number }): Promise<boolean> {
    const updated = await this.client.query(
      "UPDATE host_passkeys SET counter=$3 WHERE credential_id=$1 AND counter=$2 AND revoked_at IS NULL RETURNING credential_id",
      [input.credentialId, input.expectedCounter, input.newCounter],
    );
    return updated.rows.length === 1;
  }

  async createSession(input: { userId: string; credentialId: string; authenticatedAt: Date }): Promise<HostSession> {
    const opaqueSession = opaque();
    const expiresAt = new Date(input.authenticatedAt.getTime() + 12 * 60 * 60_000);
    await this.client.query("INSERT INTO host_sessions(token_digest,user_id,credential_id,created_at,expires_at) VALUES ($1,$2,$3,$4,$5)",
      [digest(opaqueSession), input.userId, input.credentialId, input.authenticatedAt, expiresAt]);
    return { id: opaqueSession, expiresAt };
  }

  async getSessionByToken(opaqueSession: string): Promise<{ userId: string; status: "active" | "revoked" | "expired" } | null> {
    const row = (await this.client.query<{ user_id: string; revoked_at: Date | null; expires_at: Date }>("SELECT user_id,revoked_at,expires_at FROM host_sessions WHERE token_digest=$1", [digest(opaqueSession)])).rows[0];
    return row ? { userId: row.user_id, status: row.revoked_at ? "revoked" : row.expires_at <= new Date() ? "expired" : "active" } : null;
  }

  async revokeSession(opaqueSession: string): Promise<void> {
    await this.client.query("UPDATE host_sessions SET revoked_at=now() WHERE token_digest=$1 AND revoked_at IS NULL", [digest(opaqueSession)]);
  }

  async getCredentialSummaries(userId: string) {
    return (await this.client.query<{ credential_id: string; created_at: Date; device_type: string; backed_up: boolean }>(
      "SELECT credential_id,created_at,device_type,backed_up FROM host_passkeys WHERE user_id=$1 AND revoked_at IS NULL ORDER BY created_at", [userId],
    )).rows.map((row) => ({ id: row.credential_id, createdAt: row.created_at.toISOString(), deviceType: row.device_type, backedUp: row.backed_up }));
  }
}
