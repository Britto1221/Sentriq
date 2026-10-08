import { randomUUID } from "node:crypto";
import { createHash } from "node:crypto";
import {
  generateAuthenticationOptions,
  generateRegistrationOptions,
  verifyAuthenticationResponse,
  verifyRegistrationResponse,
  type AuthenticationResponseJSON,
  type AuthenticatorTransport,
  type RegistrationResponseJSON,
} from "@simplewebauthn/server";
export type { AuthenticationResponseJSON, RegistrationResponseJSON } from "@simplewebauthn/server";

/** Minimal account projection owned and loaded by the host application. */
export interface HostAccount {
  id: string;
  /** Optional profile attribute. Sentriq never uses this to identify or authorize the account. */
  email?: string | null;
  displayName: string;
  active: boolean;
}

export interface PasskeyChallenge {
  id: string;
  purpose: "registration" | "authentication";
  userId: string | null;
  challenge: string;
  origin: string;
  rpID: string;
  registrationContextDigest: string | null;
  createdAt: Date;
  expiresAt: Date;
}

export interface PasskeyCredential {
  userId: string;
  credentialId: string;
  publicKey: Uint8Array;
  counter: number;
  transports: AuthenticatorTransport[];
  deviceType: "singleDevice" | "multiDevice";
  backedUp: boolean;
  createdAt: Date;
  revokedAt: Date | null;
}

export interface HostSession {
  id: string;
  expiresAt: Date;
}

/**
 * The host implements these operations against its own database. `consumeChallenge`
 * must atomically mark and return a live challenge at most once. `insertCredential`
 * must enforce global credential-ID uniqueness in the host's application scope.
 * `updateCredentialCounter` must be a compare-and-swap so parallel assertions do
 * not both authenticate against a stale counter.
 */
export interface SentriqCoreStorage {
  getAccountById(userId: string): Promise<HostAccount | null>;
  /** Validate a host-issued, account-bound, short-lived enrollment authorization. */
  authorizeRegistration(input: { userId: string; registrationContextDigest: string; now: Date }): Promise<boolean>;
  createChallenge(challenge: PasskeyChallenge): Promise<void>;
  consumeChallenge(input: { id: string; purpose: PasskeyChallenge["purpose"]; expectedUserId?: string; expectedRegistrationContextDigest?: string; now: Date }): Promise<PasskeyChallenge | null>;
  listCredentials(userId: string): Promise<PasskeyCredential[]>;
  getCredentialById(credentialId: string): Promise<PasskeyCredential | null>;
  /** Insert and consume the matching enrollment authorization atomically. */
  insertCredential(credential: PasskeyCredential, input: { registrationContextDigest: string; now: Date }): Promise<boolean>;
  updateCredentialCounter(input: { credentialId: string; expectedCounter: number; newCounter: number }): Promise<boolean>;
  createSession(input: { userId: string; credentialId: string; authenticatedAt: Date }): Promise<HostSession>;
}

export interface PasskeyServerOptions {
  rpName: string;
  rpID: string;
  allowedOrigins: readonly string[];
  storage: SentriqCoreStorage;
  challengeTtlMs?: number;
  now?: () => Date;
}

export class SentriqAuthError extends Error {
  readonly code: "INVALID_CONFIGURATION" | "INVALID_ORIGIN" | "ACCOUNT_NOT_READY" | "AUTHENTICATION_FAILED";
  constructor(code: SentriqAuthError["code"]) {
    const messages = {
      INVALID_CONFIGURATION: "Sentriq passkey configuration is invalid.",
      INVALID_ORIGIN: "This request could not be verified.",
      ACCOUNT_NOT_READY: "The account is not ready for passkey authentication.",
      AUTHENTICATION_FAILED: "Authentication could not be completed.",
    } as const;
    super(messages[code]);
    this.name = "SentriqAuthError";
    this.code = code;
  }
}

function reject(code: SentriqAuthError["code"]): never { throw new SentriqAuthError(code); }
const MAX_CHALLENGE_TTL_MS = 10 * 60_000;
const DEFAULT_CHALLENGE_TTL_MS = 5 * 60_000;

function isAllowedOrigin(value: string, rpID: string): boolean {
  try {
    const url = new URL(value);
    const localHttp = url.protocol === "http:" && ["localhost", "127.0.0.1", "[::1]"].includes(url.hostname);
    const originProtocol = url.protocol === "https:" || localHttp;
    return originProtocol && url.origin === value && !url.username && !url.password && !url.search && !url.hash
      && (url.hostname === rpID || url.hostname.endsWith(`.${rpID}`));
  } catch { return false; }
}

function requireTopLevelClientData(encoded: string): void {
  try {
    const bytes = Buffer.from(encoded, "base64url");
    if (!bytes.length || bytes.toString("base64url") !== encoded) reject("AUTHENTICATION_FAILED");
    const parsed: unknown = JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(bytes));
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) reject("AUTHENTICATION_FAILED");
    const data = parsed as Record<string, unknown>;
    if (typeof data.type !== "string" || typeof data.challenge !== "string" || typeof data.origin !== "string"
      || (data.crossOrigin !== undefined && data.crossOrigin !== false) || Object.hasOwn(data, "topOrigin")) reject("AUTHENTICATION_FAILED");
  } catch { reject("AUTHENTICATION_FAILED"); }
}

function validateResponseIdentity(response: { id: string; rawId: string; type: string }): void {
  if (response.type !== "public-key" || !response.id || response.id !== response.rawId) reject("AUTHENTICATION_FAILED");
}

function accountReady(account: HostAccount): boolean {
  return typeof account.id === "string" && account.id.length > 0 && Buffer.byteLength(account.id, "utf8") <= 64
    && (account.email === undefined || account.email === null || (typeof account.email === "string" && account.email.length <= 254))
    && typeof account.displayName === "string" && account.displayName.length > 0 && account.displayName.length <= 100 && account.active;
}

/** Stable SHA-256 digest format used by host storage adapters for enrollment grants. */
export function registrationContextDigest(context: string): string {
  return createHash("sha256").update(context, "utf8").digest("hex");
}

/** Create a framework-independent WebAuthn service backed entirely by host adapters. */
export function createPasskeyServer(options: PasskeyServerOptions) {
  const rpName = options.rpName.trim();
  const rpID = options.rpID.trim().toLowerCase();
  const origins = [...new Set(options.allowedOrigins)];
  const ttl = options.challengeTtlMs ?? DEFAULT_CHALLENGE_TTL_MS;
  // Sentriq's default and only supported policy is required user verification.
  // Host applications cannot accidentally lower the assurance level in config.
  const userVerification = "required" as const;
  const now = options.now ?? (() => new Date());

  if (!rpName || rpName.length > 80 || !/^(?=.{1,253}$)(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?)(?:\.(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?))*$/.test(rpID)
    || origins.length < 1 || origins.length > 20 || origins.some((origin) => !isAllowedOrigin(origin, rpID))
    || !Number.isSafeInteger(ttl) || ttl < 30_000 || ttl > MAX_CHALLENGE_TTL_MS || !options.storage) {
    reject("INVALID_CONFIGURATION");
  }

  function originFor(value: string): string {
    if (!origins.includes(value) || !isAllowedOrigin(value, rpID)) reject("INVALID_ORIGIN");
    return value;
  }

  async function storeChallenge(input: { purpose: PasskeyChallenge["purpose"]; userId: string | null; challenge: string; origin: string; registrationContextDigest?: string | null }) {
    const createdAt = now();
    const record: PasskeyChallenge = {
      id: randomUUID(), purpose: input.purpose, userId: input.userId, challenge: input.challenge,
      origin: input.origin, rpID, registrationContextDigest: input.registrationContextDigest ?? null,
      createdAt, expiresAt: new Date(createdAt.getTime() + ttl),
    };
    await options.storage.createChallenge(record);
    return record.id;
  }

  async function consumeChallenge(input: { id: string; purpose: PasskeyChallenge["purpose"]; expectedUserId?: string; expectedRegistrationContextDigest?: string }) {
    const challenge = await options.storage.consumeChallenge({ ...input, now: now() });
    if (!challenge || challenge.id !== input.id || challenge.purpose !== input.purpose || challenge.expiresAt <= now()
      || !origins.includes(challenge.origin) || !isAllowedOrigin(challenge.origin, rpID) || challenge.rpID !== rpID
      || (input.expectedUserId !== undefined && challenge.userId !== input.expectedUserId)
      || (input.expectedRegistrationContextDigest !== undefined && challenge.registrationContextDigest !== input.expectedRegistrationContextDigest)) reject("AUTHENTICATION_FAILED");
    return challenge;
  }

  return {
    async registrationOptions(input: { account: HostAccount; origin: string; registrationContext: string }) {
      const origin = originFor(input.origin);
      if (!accountReady(input.account)) reject("ACCOUNT_NOT_READY");
      if (!/^[A-Za-z0-9_-]{43}$/.test(input.registrationContext)) reject("AUTHENTICATION_FAILED");
      const contextDigest = registrationContextDigest(input.registrationContext);
      if (!await options.storage.authorizeRegistration({ userId: input.account.id, registrationContextDigest: contextDigest, now: now() })) reject("AUTHENTICATION_FAILED");
      const existing = await options.storage.listCredentials(input.account.id);
      const registration = await generateRegistrationOptions({
        rpName, rpID, userName: input.account.id, userID: new Uint8Array(Buffer.from(input.account.id, "utf8")),
        userDisplayName: input.account.displayName, timeout: ttl, attestationType: "none", supportedAlgorithmIDs: [-7, -257],
        authenticatorSelection: { residentKey: "required", userVerification },
        excludeCredentials: existing.filter((credential) => !credential.revokedAt).map((credential) => ({ id: credential.credentialId, transports: credential.transports })),
      });
      const challengeId = await storeChallenge({ purpose: "registration", userId: input.account.id, challenge: registration.challenge, origin, registrationContextDigest: contextDigest });
      return { challengeId, options: registration };
    },

    async registrationVerify(input: { account: HostAccount; registrationContext: string; challengeId: string; response: RegistrationResponseJSON }) {
      if (!accountReady(input.account)) reject("ACCOUNT_NOT_READY");
      if (!/^[A-Za-z0-9_-]{43}$/.test(input.registrationContext)) reject("AUTHENTICATION_FAILED");
      const contextDigest = registrationContextDigest(input.registrationContext);
      if (!await options.storage.authorizeRegistration({ userId: input.account.id, registrationContextDigest: contextDigest, now: now() })) reject("AUTHENTICATION_FAILED");
      validateResponseIdentity(input.response);
      requireTopLevelClientData(input.response.response.clientDataJSON);
      const challenge = await consumeChallenge({ id: input.challengeId, purpose: "registration", expectedUserId: input.account.id, expectedRegistrationContextDigest: contextDigest });
      try {
        const verified = await verifyRegistrationResponse({
          response: input.response, expectedChallenge: challenge.challenge, expectedOrigin: challenge.origin,
          expectedRPID: challenge.rpID, requireUserVerification: userVerification === "required", requireUserPresence: true,
          supportedAlgorithmIDs: [-7, -257],
        });
        if (!verified.verified || !verified.registrationInfo) reject("AUTHENTICATION_FAILED");
        const info = verified.registrationInfo;
        const transports = (info.credential.transports ?? []).filter((value): value is AuthenticatorTransport =>
          ["ble", "hybrid", "internal", "nfc", "usb"].includes(value));
        const credential: PasskeyCredential = {
          userId: input.account.id,
          credentialId: info.credential.id,
          publicKey: new Uint8Array(info.credential.publicKey),
          counter: info.credential.counter,
          transports,
          deviceType: info.credentialDeviceType,
          backedUp: info.credentialBackedUp,
          createdAt: now(),
          revokedAt: null,
        };
        if (!await options.storage.insertCredential(credential, { registrationContextDigest: contextDigest, now: now() })) reject("AUTHENTICATION_FAILED");
        return { userId: input.account.id, credentialId: credential.credentialId, deviceType: credential.deviceType, backedUp: credential.backedUp };
      } catch { reject("AUTHENTICATION_FAILED"); }
    },

    async authenticationOptions(input: { origin: string }) {
      const origin = originFor(input.origin);
      const authentication = await generateAuthenticationOptions({ rpID, timeout: ttl, userVerification });
      const challengeId = await storeChallenge({ purpose: "authentication", userId: null, challenge: authentication.challenge, origin });
      return { challengeId, options: authentication };
    },

    async authenticationVerify(input: { challengeId: string; response: AuthenticationResponseJSON }) {
      validateResponseIdentity(input.response);
      requireTopLevelClientData(input.response.response.clientDataJSON);
      const challenge = await consumeChallenge({ id: input.challengeId, purpose: "authentication" });
      try {
        const credential = await options.storage.getCredentialById(input.response.id);
        if (!credential || credential.revokedAt || input.response.response.userHandle !== Buffer.from(credential.userId, "utf8").toString("base64url")) reject("AUTHENTICATION_FAILED");
        const account = await options.storage.getAccountById(credential.userId);
        if (!account || !accountReady(account)) reject("AUTHENTICATION_FAILED");
        const verified = await verifyAuthenticationResponse({
          response: input.response, expectedChallenge: challenge.challenge, expectedOrigin: challenge.origin,
          expectedRPID: challenge.rpID, requireUserVerification: userVerification === "required",
          credential: { id: credential.credentialId, publicKey: new Uint8Array(credential.publicKey), counter: credential.counter, transports: credential.transports },
        });
        if (!verified.verified || !await options.storage.updateCredentialCounter({
          credentialId: credential.credentialId, expectedCounter: credential.counter,
          newCounter: verified.authenticationInfo.newCounter,
        })) reject("AUTHENTICATION_FAILED");
        const authenticatedAt = now();
        const session = await options.storage.createSession({ userId: account.id, credentialId: credential.credentialId, authenticatedAt });
        if (!session || typeof session.id !== "string" || session.id.length < 1 || session.id.length > 256
          || !(session.expiresAt instanceof Date) || session.expiresAt <= authenticatedAt) reject("AUTHENTICATION_FAILED");
        return { userId: account.id, session };
      } catch { reject("AUTHENTICATION_FAILED"); }
    },
  };
}
