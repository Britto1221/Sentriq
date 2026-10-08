import { describe, expect, it } from "vitest";
import { languageCatalogs, getVoiceGuideText, isVoiceGuideId, VOICE_GUIDE_IDS } from "./catalogs";
import { languageMetadata } from "./languages";

function nestedKeys(value: unknown): string[] {
  if (!value || typeof value !== "object" || Array.isArray(value)) return [];
  return Object.entries(value).flatMap(([key, child]) => {
    const descendants = nestedKeys(child);
    return descendants.length ? descendants.map((path) => `${key}.${path}`) : [key];
  }).sort();
}

describe("access language catalogs", () => {
  it("keeps the supported English and Tamil catalogs structurally identical", () => {
    expect(languageMetadata.map(({ code }) => code)).toEqual(["en", "ta"]);
    const baseline = nestedKeys(languageCatalogs.en);
    for (const { code } of languageMetadata) expect(nestedKeys(languageCatalogs[code])).toEqual(baseline);
  });

  it("provides fixed spoken guidance in every supported language", () => {
    expect(VOICE_GUIDE_IDS).toEqual(["authPreview", "accessPreview", "keyboardGuide", "formErrors", "liveAuth", "authError", "otpTotp"]);
    for (const { code } of languageMetadata) {
      expect(getVoiceGuideText(code, "authPreview")).toBeTruthy();
      expect(getVoiceGuideText(code, "accessPreview")).toBeTruthy();
      expect(getVoiceGuideText(code, "keyboardGuide")).toBeTruthy();
      expect(getVoiceGuideText(code, "formErrors")).toBeTruthy();
      expect(getVoiceGuideText(code, "liveAuth")).toBeTruthy();
      expect(getVoiceGuideText(code, "authError")).toBeTruthy();
      expect(getVoiceGuideText(code, "otpTotp")).toBeTruthy();
    }
    expect(isVoiceGuideId("authError")).toBe(true);
    expect(isVoiceGuideId("developer input" as never)).toBe(false);
  });

  it("keeps the real-auth copy complete and recovery codes distinct from email verification", () => {
    for (const { code } of languageMetadata) {
      const auth = languageCatalogs[code].auth.live;
      expect(auth.emailLabel).toBeTruthy();
      expect(auth).not.toHaveProperty("passwordLabel");
      expect(auth.displayNameLabel).toBeTruthy();
      expect(auth.invalidEmail).toBeTruthy();
      expect(auth.requiredName).toBeTruthy();
      expect(auth.correctFields).toBeTruthy();
      expect(auth.loginTitle).toBeTruthy();
      expect(auth.loginIntro).toBeTruthy();
      expect(auth.signupTitle).toBeTruthy();
      expect(auth.signupIntro).toBeTruthy();
      expect(auth.signIn).toBeTruthy();
      expect(auth.signUp).toBeTruthy();
      expect(auth.passkeyLogin).toBeTruthy();
      expect(auth.passkeyEnroll).toBeTruthy();
      expect(auth.passkeyPrompt).toBeTruthy();
      expect(auth.passkeyLoading).toBeTruthy();
      expect(auth.passkeyCancel).toBeTruthy();
      expect(auth).not.toHaveProperty("showPassword");
      expect(auth).not.toHaveProperty("hidePassword");
      expect(auth.recoveryCodeLabel).toBeTruthy();
      expect(auth.recoveryCodeHint).toBeTruthy();
      expect(auth.recoveryLink).toBeTruthy();
      expect(auth.recoveryTitle).toBeTruthy();
      expect(auth.recoveryIntro).toBeTruthy();
      expect(auth.beginRecovery).toBeTruthy();
      expect(auth.completeRecovery).toBeTruthy();
      expect(auth.backToSignIn).toBeTruthy();
      expect(auth.recoveryRequestAccepted).toBeTruthy();
      expect(auth).not.toHaveProperty("newPasswordLabel");
      expect(auth).not.toHaveProperty("passwordMinimum");
      expect(auth.genericFailure).toBeTruthy();
      expect(auth.rateLimited).toBeTruthy();
      expect(auth.networkError).toBeTruthy();
      expect(auth.sessionExpired).toBeTruthy();
      expect(auth.passkeyEnrollmentTitle).toBeTruthy();
      expect(auth.passkeyEnrollmentDescription).toBeTruthy();
      expect(auth.stepUpTitle).toBeTruthy();
      expect(auth.stepUpIntro).toBeTruthy();
      expect(auth.stepUpButton).toBeTruthy();
      expect(auth.stepUpWorking).toBeTruthy();
      expect(auth.stepUpCancel).toBeTruthy();
      expect(auth.exportTitle).toBeTruthy();
      expect(auth.exportDescription).toBeTruthy();
      expect(auth.policyDenied).toBeTruthy();
      expect(auth.exportSuccess).toBeTruthy();
      expect(auth.deleteTitle).toBeTruthy();
      expect(auth.deleteDescription).toBeTruthy();
      expect(auth.deletePrompt).toBeTruthy();
      expect(auth.deleteConfirmLabel).toBeTruthy();
      expect(auth.exportFormat).toBeTruthy();
      expect(auth.jsonFormatHint).toBeTruthy();
      expect(auth.csvFormatHint).toBeTruthy();
      expect(auth.requestExport).toBeTruthy();
      expect(auth.policyTitle).toBeTruthy();
      expect(auth.haveAccount).toBeTruthy();
      expect(auth.needAccount).toBeTruthy();
      expect(auth.or).toBeTruthy();
      expect(auth.returnHome).toBeTruthy();
      expect(auth.working).toBeTruthy();
      expect(auth.voiceGuidanceHint).toBeTruthy();
      expect(auth.loginSuccess).toBeTruthy();
      expect(auth.signupSuccess).toBeTruthy();
      expect(auth.recoverySuccess).toBeTruthy();
      expect(auth.recoveryManagementTitle).toBeTruthy();
      expect(auth.recoveryManagementDescription).toBeTruthy();
      expect(auth.recoveryCodesGenerate).toBeTruthy();
      expect(auth.recoveryCodesNotice).toBeTruthy();
      expect(auth.recoveryGuideLabel).toBeTruthy();
      expect(auth.recoveryGuideDisclosure).toBeTruthy();
      expect(auth.recoveryGuideLostDevice).toBeTruthy();
      expect(auth.recoveryGuideHasCode).toBeTruthy();
      expect(auth.recoveryGuideUnavailable).toBeTruthy();
      expect(auth.recoveryGuideSecretSafety).toBeTruthy();
      expect(auth.recoveryGuideDestinationRecovery).toBeTruthy();
      expect(auth.recoveryCodeHint).not.toMatch(/\botp\b/i);
      expect(getVoiceGuideText(code, "otpTotp")).toMatch(/OTP|TOTP/i);
    }
    expect(languageCatalogs.en.auth.live.signupSuccess).toMatch(/request was accepted/i);
    expect(languageCatalogs.en.auth.live.signupSuccess).not.toMatch(/account (?:was )?created/i);
    expect(languageCatalogs.en.auth.live.recoveryRequestAccepted).toMatch(/if the details match/i);
    expect(languageCatalogs.en.auth.live.recoverySuccess).toMatch(/does not sign you in automatically/i);
    expect(languageCatalogs.ta.auth.live.recoverySuccess).toMatch(/தானாக உள்நுழையப்படமாட்டீர்கள்/);
    expect(languageCatalogs.en.auth.live.recoveryGuideDisclosure).toMatch(/no AI model is connected/i);
  });

  it("does not claim the draft translations had native review", () => {
    expect(languageCatalogs.en.settings.translationNotice).toMatch(/not been reviewed by native speakers/i);
    for (const { code } of languageMetadata) {
      expect(languageCatalogs[code].settings.translationNotice).not.toMatch(/\b(?:translations|drafts)\s+(?:were|have been|are)\s+(?:reviewed|approved|verified) by native speakers\b|\bnative speakers\s+(?:reviewed|approved|verified)\b/i);
    }
  });
});
