# Passkey authentication

Northstar uses `@simplewebauthn/browser` for browser WebAuthn ceremonies and `@simplewebauthn/server` for relying-party verification. The authenticator or passkey provider protects the private key. Sentriq stores only the credential ID, public key, counter, transport/device metadata and account association. Biometric information is never sent to Sentriq.

## Host-controlled registration

1. The host application creates or loads the account through its trusted account-creation or authenticated-session flow. The stable host account ID is the Sentriq subject; optional email is profile data only.
2. For a new account, the host issues a short-lived, one-use registration grant only after its own account-creation policy succeeds. An unauthenticated browser cannot register against an existing account by supplying its ID or email.
3. The browser requests passkey creation options. The API binds a fresh, expiring challenge to that verified account and the registered application origin/RP ID.
4. The browser calls WebAuthn. Sentriq verifies the challenge, exact origin, RP ID, user-presence and user-verification requirements before inserting the unique credential.
5. Only after verification does the host create or retain the authenticated session. The reference application issues six independent recovery codes once; storage contains protected verifiers.

Email delivery and email verification are not Sentriq features. The host application owns account identity; an optional email attribute is profile data only. New self-hosted accounts use a short-lived registration grant and must complete a server-verified passkey enrollment before a session is issued.

## Passwordless login

The reference flow asks for the host account ID and requests a discoverable passkey assertion; users can also start discoverable sign-in without an identifier where the authenticator/browser supports it. Email is optional and is not used as an authentication factor. The server checks the challenge, origin, RP ID, signature, user verification, credential ownership and user handle before the host creates a session. There is no password authentication route or password form.

The server does not create a new key pair during login. Each separately registered credential has its own key pair. A platform provider may synchronize a passkey; Sentriq neither assumes each device has a distinct key nor implements key synchronization.

## Additional passkeys

An authenticated device can approve a Device Link request only after fresh passkey verification. The new browser proves possession of its original short-lived transaction cookie and performs its own WebAuthn registration after approval. The server stores the new credential under the existing account and creates a session after successful verification. Device Link is a Sentriq workflow around WebAuthn, not a native WebAuthn protocol feature. See [Device Link protocol](device-link.md).

## Local configuration

The development seed registers Northstar for `http://localhost:3001` with RP ID `localhost`. Deployments must configure exact HTTPS origins and the corresponding RP ID. Do not widen accepted origins to make a test pass. Use HTTPS outside localhost.

## Verification scope

Automated API tests create signed software credential fixtures that pass through the actual SimpleWebAuthn verification functions. Playwright can use Chromium's virtual authenticator to exercise browser/API ceremony wiring. Neither validates real fingerprints, face/PIN UX, synced provider behavior, platform compatibility or roaming-key behavior. Test supported devices before release.
