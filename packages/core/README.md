# @sentriq/core

Framework-independent server-side WebAuthn primitives for applications that
want Sentriq's passkey verification while retaining their own accounts,
credentials, challenges, and sessions.

This package currently provides passkey registration and discoverable
passkey-login orchestration. It does not implement email delivery, account
creation, session cookies, authorization rules, Reclaim recovery, Shield
grants, or Device Link persistence. The host application owns those policies
and must not treat this package as a complete authentication product.

## Host adapter requirements

`SentriqCoreStorage` is the trust boundary. Its database implementation must:

- consume a challenge atomically, only once, only for its purpose, and only
  before its expiration;
- enforce unique credential IDs in the host application's scope;
- compare-and-swap credential counters during authentication;
- reject credentials already revoked;
- create host-owned sessions only after the SDK has verified the assertion.

The SDK rechecks stored challenge purpose, expiry, origin, and RP ID after the
adapter returns a consumed challenge. It cannot repair a non-atomic adapter.
Run a storage conformance suite against every database adapter before use.

## Server example

```ts
import { createPasskeyServer } from "@sentriq/core";

const passkeys = createPasskeyServer({
  rpName: "Example Website",
  rpID: "example.com",
  allowedOrigins: ["https://www.example.com"],
  storage: hostStorage,
});

// account must be loaded from the host's trusted account/session boundary.
const options = await passkeys.registrationOptions({ account, origin: requestOrigin });
const registered = await passkeys.registrationVerify({
  account,
  challengeId: request.body.challengeId,
  response: request.body.response,
});

const authentication = await passkeys.authenticationOptions({ origin: requestOrigin });
const login = await passkeys.authenticationVerify({
  challengeId: request.body.challengeId,
  response: request.body.response,
});
// `login.session` came from the host adapter; set the host's HttpOnly cookie.
```

Email verification is host-owned. The server must pass an account with
`emailVerified: true` and `active: true` only after checking it through its own
trusted records. Never accept an account identifier from the browser as proof
of authorization.

## Security limits

The SDK uses SimpleWebAuthn's maintained server verifier for challenge,
origin, RP ID, authenticator data, user-verification, and signature checks. It
does not receive biometric data or private keys. Test fixtures create
software-signed WebAuthn responses and are not physical-authenticator tests.
The host remains responsible for HTTPS, CSRF defenses, rate limiting, account
status checks, session security, authorization of application resources, and
recovery safeguards.
