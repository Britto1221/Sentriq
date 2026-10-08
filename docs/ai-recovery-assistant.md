# Sentriq recovery assistant

The current Northstar interface is a **deterministic recovery guide**, not a language-model assistant. It uses a small English/Tamil keyword classifier and fixed translated explanations. The UI explicitly states that no AI model is connected. This keeps recovery guidance usable without external credentials and avoids making model output part of a security decision.

It can explain another-device passkey sign-in, recovery-code use, and the replacement-passkey sequence. User questions remain local to the page for classification; only a fixed response key and allowed route are retained. The question text is never displayed in a transcript, sent to an endpoint, logged, or persisted. A code-shaped input returns a fixed warning and directs the user to the dedicated secure recovery form. The assistant never accepts or verifies a recovery code, creates a session, or authorizes enrollment.

The classifier is intentionally limited and may not understand rephrased questions. The deterministic recovery state machine and API remain authoritative. If an optional model-backed adapter is added later, it must be server-side, schema constrained, secret-free, rate limited, timeout bounded, and unable to invoke security tools or change state. No such provider is implemented or live inference performed here.
