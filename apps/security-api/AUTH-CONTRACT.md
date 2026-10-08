# Authentication and Reclaim contract for trusted BFFs

All `/v1/auth/*` endpoints require the application API key in `x-sentriq-api-key`. Authenticated calls also require the opaque session token in `x-sentriq-session-token`. Optional application scope headers must match the key; client-supplied tenant, user and role scope is not authoritative. Northstar's server-side BFF holds the application key and HttpOnly session cookie and forwards them to the API. The browser receives neither the API key nor raw API session token. Responses are `Cache-Control: no-store`; public errors are generic.

## Routes

Paths below are relative to `/v1/auth`; request objects are strict.

| Path | Method / body | Success |
|---|---|---|
| `/signup` | POST `{email,password,displayName}` | `{status:"accepted"}`; no session cookie, generic for duplicate identity. |
| `/login` | POST `{email,password}` | `{user}` plus HttpOnly session cookie. |
| `/session` | GET with session header | User and live session summary after expiry/revocation/deletion checks. |
| `/sessions` | GET with session header | User-owned session summaries. |
| `/sessions/revoke` | POST `{sessionId}` with session header | Revokes an owned session after the applicable policy path. |
| `/events` | GET with session header | Owner-scoped safe security events. |
| `/logout` | POST `{}` with session header | Revokes the current session and clears its cookie. |
| `/webauthn/register/options` | POST `{origin}` with session header | Challenge ID and WebAuthn registration options. |
| `/webauthn/register/verify` | POST `{challengeId,response}` with session header | `{verified:true}` after successful server verification. |
| `/webauthn/login/options` | POST `{origin}` | Discoverable passkey options without account enumeration. |
| `/webauthn/login/verify` | POST `{challengeId,response}` | `{user}` plus session cookie after verification. |
| `/recovery/codes` | POST `{password}` with session header | Six new `{codes:[...]}` after fresh password verification; prior codes are invalidated. |
| `/reclaim/start` | POST `{email}` | Generic `{status:"accepted",transaction}`. |
| `/reclaim/verify` | POST `{email,transaction,recoveryCode}` | Restricted `{status:"verified"}`; no cookie or general session. |
| `/reclaim/passkey/options` | POST `{transaction,origin}` | Replacement passkey options only while the restricted transaction is valid. |
| `/reclaim/passkey/verify` | POST `{transaction,challengeId,response}` | `{status:"completed",recoveryCodes:[six codes]}` after verified replacement. No cookie is issued. |
| `/reclaim/cancel` | POST `{transaction}` | Cancels the restricted transaction. |

`POST /v1/auth/account/delete` is a protected internal integration route and is not exposed through the public auth proxy. See Action Shield.

## WebAuthn and session behavior

Registration and login use `@simplewebauthn/server` with exact registered origin/RP validation, required user verification, one-time expiring challenges, signature verification, credential ownership checks and counter validation. Challenge and session state is persistent in the API's PGlite database. Private credential keys and biometric data are never sent to the service. Session cookies are HttpOnly/SameSite=Lax and production adds Secure with a host-only cookie. Mutating Northstar BFF requests check same-origin context.

Tests exercise the verifier with generated software registration/assertion fixtures, including replay and wrong-origin cases. They do not prove physical device compatibility or authenticator attestation provenance.

## Reclaim behavior

The recovery code has 192 bits of random input entropy in the current generator; each verifier is independently salted and stored one-way. Plaintext appears only in a one-time response. A restricted recovery transaction is short-lived, account/application-bound and cannot be used as a login session or as an Action Shield grant. Replacement enrollment is itself a verified WebAuthn registration. Completion invalidates the old credential/recovery-code set, revokes sessions, writes an audit event and issues six new codes once. The user signs in normally with the replacement passkey afterward.

Invalid proofs return generic errors and are rate limited by the current process-local controls. Tests cover wrong code, reuse, concurrent use, account mismatch, expiry, cancellation and replacement flow. A stolen unused code remains a recovery risk. Loss of every passkey and recovery code has no bypass.

## Development seed and limitations

Run `pnpm --filter @sentriq/security-api seed:demo` only outside production. It creates synthetic Alice/Bob accounts and Northstar once; generated credentials and the application key are written to a new permission-restricted private `bootstrap-*.json` file. The seed prints the file path and counts, not secret values. Re-running against an existing application does not reveal its previous key. Production refuses seeding.

Per-account/application/route and IP-aware rate budgets live in process memory and are not coordinated between API instances. The local database is single writer. The host-owned user/session storage adapter remains incomplete; this is currently the reference API's auth store. No email or SMS recovery delivery exists.
