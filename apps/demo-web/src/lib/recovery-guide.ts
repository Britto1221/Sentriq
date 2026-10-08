import type { LanguageCode } from "@sentriq/access";

export type RecoveryGuideState =
  | "START"
  | "HAS_EXISTING_PASSKEY"
  | "HAS_BACKUP_AUTHENTICATOR"
  | "HAS_RECOVERY_CODE"
  | "NEEDS_RECOVERY_FORM"
  | "REPLACEMENT_PASSKEY_ENROLLMENT"
  | "RECOVERY_COMPLETE"
  | "RECOVERY_UNAVAILABLE";

export type RecoveryGuideMessageKey =
  | "lostDevice"
  | "anotherPasskey"
  | "hasRecoveryCode"
  | "recoveryUnavailable"
  | "authenticator"
  | "secretSafety"
  | "general";

export interface RecoveryGuideReply {
  state: RecoveryGuideState;
  messageKey: RecoveryGuideMessageKey;
  destination: "/login" | "/recover" | null;
  secretDetected: boolean;
}

const recoveryCodePattern = /(?:^|[^A-Za-z0-9_-])[A-Za-z0-9_-]{32}(?![A-Za-z0-9_-])/;

function includesAny(text: string, terms: readonly string[]) {
  return terms.some((term) => text.includes(term));
}

export function guideRecovery(message: string, language: LanguageCode): RecoveryGuideReply {
  const normalized = message.trim().toLocaleLowerCase(language === "ta" ? "ta-IN" : "en-US");

  if (recoveryCodePattern.test(message)) {
    return { state: "NEEDS_RECOVERY_FORM", messageKey: "secretSafety", destination: "/recover", secretDetected: true };
  }

  if (includesAny(normalized, ["no passkey", "no recovery", "no backup", "neither", "none of them", "எதுவும் இல்லை", "குறியீடுகள் இல்லை", "passkey இல்லை"])) {
    return { state: "RECOVERY_UNAVAILABLE", messageKey: "recoveryUnavailable", destination: null, secretDetected: false };
  }

  if (includesAny(normalized, ["recovery code", "backup code", "recovery-code", "மீட்பு குறியீடு", "மீட்பு குறியீடு உள்ளது"])) {
    return { state: "HAS_RECOVERY_CODE", messageKey: "hasRecoveryCode", destination: "/recover", secretDetected: false };
  }

  if (includesAny(normalized, ["another phone", "another device", "my laptop", "other device", "synced passkey", "வேறு சாதனம்", "மற்றொரு சாதனம்", "மற்றொரு கைபேசி", "என் மடிக்கணினி"])) {
    return { state: "HAS_EXISTING_PASSKEY", messageKey: "anotherPasskey", destination: "/login", secretDetected: false };
  }

  if (includesAny(normalized, ["authenticator", "what is a passkey", "what's a passkey", "அங்கீகரிப்பான்", "passkey என்றால் என்ன"])) {
    return { state: "START", messageKey: "authenticator", destination: "/login", secretDetected: false };
  }

  if (includesAny(normalized, ["lost", "stolen", "can't access", "cannot access", "phone", "mobile", "கைபேசி", "தொலைந்த", "திருடப்பட்ட", "அணுக முடியவில்லை"])) {
    return { state: "START", messageKey: "lostDevice", destination: "/recover", secretDetected: false };
  }

  return { state: "START", messageKey: "general", destination: "/recover", secretDetected: false };
}
