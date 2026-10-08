# Sentriq Shield — sensitive-action enforcement

Action Shield is a backend decision check. A disabled button or modal is not authorization.

## Current Northstar protected operations

- `data.export`
- `account.delete`
- `session.revoke`
- `security.settings.change` is registered in the API seed; a host must still enforce it in its own route before using it.

The SDK creates a server-only `SentriqClient` with `baseUrl`, `applicationId` and `apiKey`. Its `evaluate` method validates the request/response and times out without retry. It must be called by a trusted application server, never by browser code.

## Request flow

1. Host server derives the user and session from its validated session boundary.
2. Host server supplies an action ID and an owned resource ID to evaluation.
3. `STEP_UP` creates a short-lived challenge. Browser completes a new passkey assertion; server verifies it with the same session.
4. The host repeats evaluation with the one-time grant.
5. The operation executes only after final `ALLOW` and is independently scoped to the user's resource.

`DENY` is final. Grants cannot be reused for another user, session, action, resource, app or policy version. Reclaim codes cannot approve Shield. If the API or database is unavailable, Northstar rejects the protected operation.

For direct-API testing, call the Northstar protected route without its action grant cookie or call the SDK with a missing/replayed grant. The server must reject it even if the client skips the verification UI.
