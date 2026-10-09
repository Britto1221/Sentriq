import { describe, expect, it } from "vitest";
import { guideRecovery } from "./recovery-guide";

describe("deterministic recovery guide", () => {
  it("explains lost-device options in English without echoing the message", () => {
    const reply = guideRecovery("I lost my phone; please help", "en");
    expect(reply.state).toBe("START");
    expect(reply.messageKey).toBe("lostDevice");
    expect(reply.destination).toBe("/recover");
    expect(reply.messageKey.includes("I lost my phone")).toBe(false);
  });

  it("recognizes Tamil recovery questions and returns Tamil guide keys", () => {
    expect(guideRecovery("என் கைபேசி தொலைந்துவிட்டது", "ta").messageKey).toBe("lostDevice");
    expect(guideRecovery("என்னிடம் மீட்பு குறியீடு உள்ளது", "ta").messageKey).toBe("hasRecoveryCode");
  });

  it("never includes a recovery code in assistant output and directs code entry to the secure form", () => {
    const code = "aBcdEF0123456789_XyZ9876543210ab";
    const reply = guideRecovery(`My recovery code is ${code}`, "en");
    expect(reply.secretDetected).toBe(true);
    expect(reply.messageKey).toBe("secretSafety");
    expect(reply.destination).toBe("/recover");
    expect(JSON.stringify(reply).includes(code)).toBe(false);
  });

  it("does not offer a bypass when the user has no registered passkey or recovery method", () => {
    const reply = guideRecovery("I have no passkey and no recovery codes", "en");
    expect(reply.state).toBe("RECOVERY_UNAVAILABLE");
    expect(reply.destination).toBeNull();
  });
});
