/** Browser-only WebAuthn ceremonies. These helpers never verify an identity; the host server must verify every response. */
export { startAuthentication, startRegistration } from "@simplewebauthn/browser";
export type { AuthenticationResponseJSON, PublicKeyCredentialRequestOptionsJSON, PublicKeyCredentialCreationOptionsJSON, RegistrationResponseJSON } from "@simplewebauthn/browser";
