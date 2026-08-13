/**
 * V6 Part 4 — Multi-language support metadata.
 */
export const SUPPORTED_LOCALES = [
  { code: "en", label: "English" },
  { code: "hi", label: "Hindi" },
  { code: "te", label: "Telugu" },
  { code: "ta", label: "Tamil" },
  { code: "kn", label: "Kannada" },
  { code: "ml", label: "Malayalam" },
  { code: "fr", label: "French" },
  { code: "de", label: "German" },
  { code: "es", label: "Spanish" },
  { code: "ja", label: "Japanese" },
  { code: "zh", label: "Chinese" },
  { code: "ar", label: "Arabic" },
] as const;

export type LocaleCode = (typeof SUPPORTED_LOCALES)[number]["code"];

export interface MultiLanguageMeta {
  primaryLocale: LocaleCode;
  availableLocales: LocaleCode[];
  preserveTechnicalTerms: boolean;
  translationNotes: string;
}

export function resolveMultiLanguageMeta(requestedLocale?: string): MultiLanguageMeta {
  const code = (requestedLocale ?? "en") as LocaleCode;
  const supported = SUPPORTED_LOCALES.some((l) => l.code === code);
  return {
    primaryLocale: supported ? code : "en",
    availableLocales: SUPPORTED_LOCALES.map((l) => l.code),
    preserveTechnicalTerms: true,
    translationNotes: "Preserve API names, code identifiers, and framework terminology in English.",
  };
}
