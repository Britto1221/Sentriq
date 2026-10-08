import { describe, expect, it } from "vitest";
import { selectLanguageVoice, voiceMatchesLanguage } from "./speech";

describe("allowlisted voice selection", () => {
  const voices = [
    { voiceURI: "en-us", lang: "en-US", name: "English US" },
    { voiceURI: "ta-in", lang: "ta-IN", name: "Tamil" },
  ];

  it("uses only a voice whose locale matches the selected language", () => {
    expect(selectLanguageVoice(voices, "ta")?.voiceURI).toBe("ta-in");
    expect(voiceMatchesLanguage(voices[1]!, "ta")).toBe(true);
    expect(selectLanguageVoice(voices.filter((voice) => voice.lang === "en-US"), "ta")).toBeUndefined();
  });

  it("uses a saved voice only when it still matches the selected language", () => {
    expect(selectLanguageVoice(voices, "en", "en-us")?.name).toBe("English US");
    expect(selectLanguageVoice(voices, "en", "ta-in")?.voiceURI).toBe("en-us");
  });
});
