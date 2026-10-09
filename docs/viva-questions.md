# Sentriq viva questions and answers

1. **What is Sentriq?** A self-hostable TypeScript authentication-security project with passkey verification, step-up protection, restricted recovery, and accessible English/Tamil guidance.
2. **What problem does it address?** It demonstrates strong, server-verified authentication and recovery while giving users understandable, keyboard-usable guidance.
3. **What is an authenticator?** A device or credential manager that holds a private passkey key and performs a local user-verification ceremony when asked to sign.
4. **What is the public/private key relationship?** The server stores the public key; the private key stays in the authenticator. A valid signature proves control of the private key without sending it.
5. **How does registration work?** The server creates a random challenge; the browser asks the authenticator to create a credential; the server checks the challenge, origin, RP context and attestation response before storing public credential data.
6. **How does returning-user login work?** The server creates a fresh challenge; the authenticator signs it; server verification checks the signature and ceremony context before establishing a session.
7. **Does Sentriq receive a fingerprint or face scan?** No. The authenticator may use local biometrics or a PIN, but only WebAuthn protocol responses reach the service.
8. **How is this different from Google Sign-In?** Google Sign-In is a federated identity provider flow; Sentriq provides passkey and protected-action primitives that a host can self-host and integrate. Northstar is the reference app.
9. **How is it different from Google Authenticator?** Google Authenticator is commonly used for TOTP codes; Sentriq's primary factor is a public-key passkey verified with WebAuthn. Reclaim codes are backup recovery artifacts, not a login factor.
10. **What happens if a phone is lost?** The user can use a synced passkey on another device or one unused recovery code through the dedicated Reclaim form.
11. **What are recovery codes?** Random one-time backup secrets whose salted verifiers are stored server-side. A valid code authorizes only a restricted replacement-passkey transaction.
12. **Why are recovery codes not passkeys?** Codes are bearer secrets; passkeys use asymmetric challenge-response and keep the private key in an authenticator.
13. **Why does export need fresh authentication?** A valid session can be stolen or left unattended. Shield requests a fresh passkey assertion bound to that operation before allowing it.
14. **Can one Shield grant be reused?** No. It is short-lived, action/resource/user/session scoped and atomically consumed.
15. **Can a recovery code approve a Shield action?** No. Reclaim proof and Shield passkey proof are separate authorities.
16. **Why provide multilingual guidance?** Security instructions only help when the user can understand them. English and Tamil catalog entries are deterministic; Tamil still needs native-speaker security review.
17. **How is Sentriq Assistant different from browser translation?** It answers authentication and recovery questions in English or Tamil using the selected language, page context, and either bounded model-generated explanations or deterministic fallback guidance; it does not translate arbitrary host content.
18. **Can the assistant approve login or recovery?** No. It has no security tools or account lookup. The backend verifies passkeys, consumes recovery codes, creates sessions, and authorizes sensitive actions independently.
19. **What attacks does this demo mitigate?** It checks challenge replay, wrong-origin/RP assertions, session revocation, owner mismatch, missing/replayed step-up grants and reused recovery codes in tested paths.
20. **What attacks does it not prevent?** It cannot prevent endpoint malware, authenticator compromise, stolen unused recovery codes, host application authorization bugs, database/operator compromise or every phishing scenario.
21. **Why is Sentriq an SDK rather than an authenticator app?** It is intended to give host applications server verification and UI integration pieces; the user's device/credential manager supplies the authenticator. Current storage-agnostic SDK work remains incomplete.
22. **How does a developer integrate it today?** Use the server-only `@sentriq/sdk` client from trusted server routes, keep the application key private, and perform final resource authorization in the host server. Northstar demonstrates the API/BFF shape.
23. **What is the current database?** The demo security API uses local PGlite/Drizzle with migrations, one process/writer, and synthetic data. A production managed PostgreSQL deployment is not verified.
24. **What is the relationship to PS05?** The vertical slice joins secure passkey authentication and fresh action verification with recovery and accessible English/Tamil authentication guidance.
25. **Is it production certified?** No. Automated tests provide evidence for specific paths, but real-device, native-speaker, assistive-technology, external penetration and production deployment reviews are still required.
