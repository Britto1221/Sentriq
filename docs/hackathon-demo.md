# Northstar demonstration

Follow the root README, seed the local Northstar application, configure the ignored `apps/demo-web/.env.local`, and start `pnpm dev`. The API listens at `http://127.0.0.1:4000`; Northstar is at `http://localhost:3001`. Each demo user is registered interactively; there are no seeded passwords or authentication bypass accounts.

For WebAuthn, use a compatible platform authenticator, security key, or the test-only Chromium virtual authenticator configured by Playwright. The user account ID, not optional email, is the host-owned identity. Registration does not require email delivery; Northstar creates a host-owned account ID and the user completes passkey enrollment.

## Scenarios

1. **New account:** Open `/signup`, enter a display name and optional email, then create a passkey. Email is not an authentication or authorization factor. Save all six displayed recovery codes and acknowledge storage. Registration is not complete until WebAuthn registration verifies on the server.
2. **Returning account:** Sign out, open `/login`, enter the host account ID and select **Sign in with a passkey**. The server verifies the assertion before setting the session cookie. You can also try discoverable sign-in without entering an identifier if the authenticator supports it.
3. **Sensitive export:** Open Settings → Export and request an export. The API requires fresh passkey verification. A direct same-origin API request without the server-held one-use grant is rejected; a successful grant is bound to the action and session.
4. **Second device with existing-device approval:** Keep the first device signed in. In another browser profile, start **Approve using my existing device** and note its six-character comparison code. On the first device, open Settings → Security, confirm the same code, and approve with a fresh passkey assertion. On the new device, create a passkey. The registration request cookie is bound to that browser; approval cannot be transferred by request ID alone.
5. **Synced passkey:** On a compatible second device, try ordinary passkey sign-in first. If the platform provider has synchronized the credential, no Device Link flow is needed.
6. **Lost device recovery:** Open `/recover`, enter the host account ID and one saved, unused code in the dedicated form, then register a replacement passkey. Reclaim revokes prior passkeys and sessions and rotates the six recovery codes. Recovery does not create an unrestricted session before replacement registration succeeds.
7. **Recovery attack:** Reuse the consumed code or try an invalid code. The API rejects it. Recovery details and transaction tokens are protected by the same-origin BFF; the browser never receives the transaction token in JavaScript.
8. **English/Tamil guidance:** Change the language on registration, login, or recovery. The local rule-based assistant can explain how to use another passkey or the secure recovery form. It does not make an AI request and never accepts recovery codes.
9. **Session revocation and isolation:** Create a second authenticated browser session, revoke it from the first session using fresh passkey verification, then make a request from the revoked browser. Create a separate Northstar account and attempt to export the first account's resource; the server rejects ownership mismatch.

## What the demo does not prove

The API tests use signed software credential fixtures and the browser suite can use Chromium's virtual authenticator. Neither proves compatibility with every real phone, synced passkey provider, Windows Hello, or roaming key. Tamil copy still needs review by a fluent security translator. See [security model](security-model.md) and [accessibility evidence](accessibility.md).
