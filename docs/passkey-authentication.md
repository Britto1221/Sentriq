# Passkey authentication

Northstar uses `@simplewebauthn/browser` for browser WebAuthn ceremonies and `@simplewebauthn/server` for relying-party verification. The authenticator or passkey provider protects the private key. Sentriq stores only the credential ID, public key, counter, transport/device metadata and account association. Biometric information is never sent to Sentriq.

## Email registration

1. The user enters an email address. Sentriq normalizes it and sends a short-lived verification code using the configured `EmailSender`.
2. The user submits the code. Only after server-side verification does Sentriq create or activate the account and issue a short-lived registration transaction in an HttpOnly same-site cookie through Northstar's BFF.
3. The browser requests passkey creation options. The API binds a fresh, expiring challenge to that verified account and the registered application origin/RP ID.
4. The browser calls WebAuthn. Sentriq verifies the challenge, exact origin, RP ID, user-presence and user-verification requirements before inserting the unique credential.
5. Only after verification does the API create the session and issue six independent recovery codes. Plaintext codes are returned once for the setup screen; storage contains salted verifiers.

The local development API keeps verification codes in memory and exposes them only through the labeled development inbox route. The route is disabled in production. This repository does not contain a production email sender. The API fails closed with `EMAIL_UNAVAILABLE` when registration has no injected sender.

## Passwordless login

The primary flow asks for email and then requests a discoverable passkey assertion. The email digest is bound to the short-lived challenge, but the options response does not reveal whether the account exists. A second button supports discoverable sign-in without email where the authenticator/browser can identify the credential. The server checks the challenge, origin, RP ID, signature, user verification, credential ownership and user handle before it creates a session. There is no password authentication route or password form.

The server does not create a new key pair during login. Each separately registered credential has its own key pair. A platform provider may synchronize a passkey; Sentriq neither assumes each device has a distinct key nor implements key synchronization.

## Additional passkeys

An authenticated device can approve a Device Link request only after fresh passkey verification. The new browser proves possession of its original short-lived transaction cookie and performs its own WebAuthn registration after approval. The server stores the new credential under the existing account and creates a session after successful verification. Device Link is a Sentriq workflow around WebAuthn, not a native WebAuthn protocol feature. See [Device Link protocol](device-link.md).

## Local configuration

The development seed registers Northstar for `http://localhost:3001` with RP ID `localhost`. Deployments must configure exact HTTPS origins and the corresponding RP ID. Do not widen accepted origins to make a test pass. Use HTTPS outside localhost.

## Verification scope

Automated API tests create signed software credential fixtures that pass through the actual SimpleWebAuthn verification functions. Playwright can use Chromium's virtual authenticator to exercise browser/API ceremony wiring. Neither validates real fingerprints, face/PIN UX, synced provider behavior, platform compatibility or roaming-key behavior. Test supported devices before release.
