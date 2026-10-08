# Sentriq Access — accessibility and language support

The active Northstar authentication and recovery interface provides English and Tamil through structured `packages/access` dictionaries. The language selector updates the document `lang`, visible copy and browser speech locale. Preferences are nonsensitive and stored locally. Authentication secrets are never saved as preferences.

The login/signup/recovery screens use labels, semantic forms, visible focus styles, status/error announcements, keyboard-operable buttons, responsive layouts and reduced-motion CSS. Browser speech is opt-in, fixed-copy only and has a visible silent fallback if speech or a matching locale voice is unavailable. Speech never reads email addresses, recovery codes, verification codes, session tokens or other personal data.

## Evidence and limits

Catalog tests verify English/Tamil key parity and key content. Playwright covers some keyboard navigation, layout widths, and automated axe checks. That evidence is not a full WCAG 2.2 AA certification. No manual NVDA, VoiceOver or TalkBack pass is claimed. The Tamil catalog is a draft that still needs review by a fluent native speaker familiar with security terminology. Browser voice quality and availability depend on the user's operating system/browser.
