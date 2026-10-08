# Sentriq Reclaim — account recovery

Reclaim is a restricted credential-replacement transaction, not an alternate login method.

## Recovery codes

The API generates six independent 24-byte random recovery codes in each newly issued set. The user sees the plaintext once. The service stores independently salted one-way verifiers; it never logs a code. Regenerating the set invalidates previous verifiers. Save unused codes offline. A stolen unused code is sufficient to start a restricted replacement-passkey ceremony, so protect the saved copy.

## State transitions

The server transaction progresses through `NOT_STARTED`, `CODE_VERIFIED`, `ENROLLMENT_PENDING`, `COMPLETED`, `EXPIRED` or `CANCELLED`. Public start responses are generic. A valid code is atomically consumed and bound to the original application and user. Verification creates no session and permits only replacement credential enrollment. The enrollment challenge is WebAuthn verified, one-use and expiring. Completion replaces old credentials, revokes sessions, invalidates old codes, writes an audit event and returns six replacement codes. The user must sign in using the replacement passkey afterward.

If no passkey or valid unused recovery code remains, this MVP has no secure bypass. Do not send recovery codes by email or enter them into the conversational guide.

## Abuse controls and known limits

Recovery endpoints use generic public failures and account/application/IP rate limits. Tests cover invalid, replayed, cross-account, expired, cancelled and concurrent use. Rate limiting uses process memory and local PGlite; distributed multi-instance abuse control is not implemented. The API seed and local development database are demonstration infrastructure, not a managed production recovery service.
