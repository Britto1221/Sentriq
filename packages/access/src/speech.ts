import { getVoiceGuideText, type VoiceGuideId } from "./catalogs";
import { languageInfo, type LanguageCode } from "./languages";

export type VoiceDescriptor = Pick<SpeechSynthesisVoice, "voiceURI" | "lang" | "name">;

function normalizedLocale(value: string): string {
  return value.replaceAll("_", "-").toLowerCase();
}

export function voiceMatchesLanguage(voice: Pick<VoiceDescriptor, "lang">, language: LanguageCode): boolean {
  const voiceLocale = normalizedLocale(voice.lang);
  const expectedLocale = normalizedLocale(languageInfo(language).speechLocale);
  const languagePrefix = `${language.toLowerCase()}-`;
  return voiceLocale === language.toLowerCase() || voiceLocale.startsWith(languagePrefix) || voiceLocale === expectedLocale;
}

export function selectLanguageVoice<T extends VoiceDescriptor>(
  voices: readonly T[],
  language: LanguageCode,
  preferredVoiceURI = "",
): T | undefined {
  const matching = voices.filter((voice) => voiceMatchesLanguage(voice, language));
  return matching.find((voice) => voice.voiceURI === preferredVoiceURI) ?? matching[0];
}

export function getAllowedVoiceText(language: LanguageCode, guide: VoiceGuideId): string {
  return getVoiceGuideText(language, guide);
}
