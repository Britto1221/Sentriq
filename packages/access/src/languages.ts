export const languageMetadata = [
  { code: "en", name: "English", nativeName: "English", speechLocale: "en-US" },
  { code: "ta", name: "Tamil", nativeName: "தமிழ்", speechLocale: "ta-IN" },
] as const;

export type LanguageCode = (typeof languageMetadata)[number]["code"];

export function isLanguageCode(value: unknown): value is LanguageCode {
  return typeof value === "string" && languageMetadata.some((language) => language.code === value);
}

export function languageInfo(code: LanguageCode) {
  return languageMetadata.find((language) => language.code === code)!;
}
