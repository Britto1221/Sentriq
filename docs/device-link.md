# Sentriq Device Link

Device Link is an application workflow that lets a user approve adding a new passkey from an already authenticated device. It is layered around WebAuthn and is not a native WebAuthn capability. A compatible synchronized passkey can be used for ordinary sign-in instead; Device Link does not copy private keys between devices.

## Request and approval

1. The new browser submits an email address. The API returns a random request ID, a cryptographically random 6-character comparison code, and a 10-minute transaction token. Northstar's same-origin BFF stores the transaction token in a short-lived HttpOnly, `SameSite=Strict` cookie; JavaScript receives only the request ID, comparison code and expiry.
2. The new browser displays the code and polls status while retaining its cookie. The API persists a digest of the transaction token and the account binding. Knowing the email or request ID is not authentication.
3. An authenticated existing device reads a user-scoped approval inbox. The user compares the code shown on both devices and explicitly confirms the match.
4. The existing device requests approval options and completes a fresh passkey assertion. The API binds that challenge to the exact user, session and request, verifies WebAuthn, and atomically changes the request from `PENDING` to `APPROVED`.
5. The new browser polls with its original cookie. Only the approved request can create registration options. After a new passkey registration assertion verifies, the API atomically consumes that registration challenge, stores the credential, marks the request complete, and creates a session for the new browser.

Reject and cancel transitions are persisted. Expired requests and challenges are rejected. One request authorizes at most one registration challenge; enrollment verification consumes it before processing the response, so an invalid attempt requires a new request.

## Threat boundaries

The comparison code helps users notice an unsolicited or mismatched request; it is not a secret or authentication factor. Approval always requires a fresh passkey assertion. The short-lived transaction token is browser-bound through an HttpOnly cookie and stored as a digest in the API. Same-origin request checks, per-account/IP rate limits, user/application scoping and server-side state transitions protect the flow. No precise location or invented device identity is displayed.

Users who cannot reach an authenticated device can try an available synced passkey or Sentriq Reclaim. The assistant can explain those supported options but cannot approve a request.

## Verification

The API integration tests cover wrong account/session, missing original transaction, rejection, request replay, approval before verification, and single-use enrollment. The Playwright flow is separately exercised with virtual authenticators; neither is proof of all real-device behavior.
