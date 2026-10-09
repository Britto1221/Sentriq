# Security model and threat boundaries

## Protected assets

- Passkey public credentials and account bindings.
- Challenge, session, step-up grant and Reclaim transaction state.
- Northstar account data and sensitive operations such as export, deletion and session revocation.
- Application API keys, held only by trusted server configuration.
- Recovery-code verifiers and audit events.

## Controls in this implementation

- WebAuthn private keys and biometric checks remain with the user's authenticator. Server verification uses the maintained SimpleWebAuthn package.
- Challenges and opaque session/grant/transaction tokens are generated with cryptographic randomness; persistent records use digests where appropriate.
- Application keys are stored as digests in the API database and only their bootstrap value is written to a private, ignored local file.
- Recovery codes are high entropy, independently salted and one-use. The API limits attempts and does not create an unrestricted session after recovery proof.
- Shield decisions use explicit persisted `ALLOW`, `STEP_UP` or `DENY` modes. Unknown or unavailable enforcement fails closed.
- Shield grants bind the user, session, action and resource; replay, expiry, session revocation and current policy version are checked server-side.
- Removing a passkey uses a grant scoped to that credential's resource. Grant consumption and credential removal share a database transaction; a row lock prevents concurrent removals from deleting the final passkey.
- Northstar server routes check same-origin mutation requests, use HttpOnly/SameSite cookies, no-store responses, bounded JSON bodies and generic auth failures.
- Audit events omit passwords, recovery code plaintext, opaque session tokens, challenges, signatures and key material.
- Sentriq Assistant is informational. The browser rejects code- or credential-shaped chat messages before sending them, the server repeats the check, and the OpenAI adapter receives only bounded/redacted user text plus page/language context. It does not receive account/session records, cookies, passkey material, or auth headers; it has no tools and cannot validate a code or trigger an auth state transition. Offline mode is available when configured or selected.

## Explicit limitations

- This is not a production security certification. No external penetration test, formal cryptographic review, or physical authenticator compatibility matrix has been completed.
- The reference API's local PGlite store is single-process/single-writer. Production database operations, backups, TLS termination, secrets rotation, monitoring, and deployment hardening remain operator work.
- The API currently owns Northstar's authentication users and sessions. Host-owned user/session storage adapters are a product gap.
- Passkey proofs can still be affected by compromised endpoints, malware, account recovery-code theft, weak host authorization, or operator/database compromise. No mechanism guarantees prevention of every account takeover.
- Recovery is only as safe as custody of unused codes. A stolen unused code can authorize the restricted credential-replacement path.
- Session fixation, CSRF, XSS and tenant boundaries have targeted controls/tests, but the complete deployment threat surface remains unverified.
- A test authenticator or browser virtual authenticator is not real hardware validation. No manual assistive-technology evaluation is recorded.
- Tamil translations are not certified by a fluent security translator.

## Excluded signals and authorities

No browser/device fingerprint, keystroke biometrics, geolocation, VPN/Tor intelligence, machine-learning score or IP change is used as proof of identity. Sentriq Assistant may use OpenAI for plain-language guidance, with deterministic English/Tamil fallback. No model may grant a session, approve a recovery, authorize an action, or override a security decision. Model text remains untrusted and is displayed as plain text.
