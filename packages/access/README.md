# `@sentriq/access`

Shared design and accessibility foundations for the Sentriq applications.

## Imports

```tsx
import {
  AccessProvider,
  AccessPreferencesPanel,
  AccessLanguageSelect,
  DESIGN_TOKENS,
  NORTHSTAR_ACCESS_THEME,
  SENTRIQ_ACCESS_THEME,
  languageCatalogs,
  languageMetadata,
  useAccessPreferences,
  useAccessVoice,
  useNorthstarTheme,
  useSentriqTheme,
  useTranslation,
} from "@sentriq/access";
import "@sentriq/access/tokens.css";
import "@sentriq/access/components.css";
```

Wrap the application once in `AccessProvider`. It has no router dependency. Pass the current route as `navigationKey` from the app shell so ongoing speech is canceled when navigation changes. Sentriq Console does this in `src/components/access-provider.tsx`.

`useAccessPreferences()` exposes the allowlisted local preferences and `setPreference`. `useAccessVoice()` supports `speak(guideId)`, `repeat()`, `pause()`, `resume()`, and `stop()`. The only accepted speech input is the `VoiceGuideId` union; it contains static localized guides such as `authPreview`, `liveAuth`, and `otpTotp`. It does not accept arbitrary text, form values, or server responses. Spoken guidance is disabled by default and requires a user to enable it and explicitly select Speak. No speech autoplays. The OTP/TOTP entry is spoken safety guidance only; it adds no OTP/TOTP UI or API.

## Localization and review status

Catalogs are available for `en`, `ta`, `hi`, `te`, `ml`, and `kn`. The catalogs have structural parity tests. Translation text is a deterministic draft and has not been reviewed by native speakers. Apps should keep this status visible where users rely on translated authentication or safety guidance.

`languageCatalogs[language]` exposes the Console/common catalog, the current development-only auth copy, a separate `auth.live` subtree for live authentication interfaces, settings and Access labels, and static Console voice guides. `getVoiceGuideText(language, id)` resolves only allowlisted guide IDs.

## Preferences and configuration adapter

The browser preference store writes only the fields in `AccessPreferences` to `sentriq.access.preferences.v1`: language, voice URI, speech rate, voice-enabled toggle, contrast, text size, reduced motion, and keyboard guide. It never accepts arbitrary object fields into storage. Passwords, recovery codes, API keys, and form values are not preferences.

`AccessConfigurationAdapter` is a read-only preview seam. Console's implementation returns a typed local `development-sample` snapshot with `remotePersistence: false`; it does not call a service or save configuration.

## Theme and tokens

`DESIGN_TOKENS` and `tokens.css` define spacing, typography, weight, line height, border, radius, shadow, motion, focus, and breakpoint values. `SENTRIQ_ACCESS_THEME` maps those primitives to Sentriq's dark green shell and signal lime. `NORTHSTAR_ACCESS_THEME` maps the same semantic roles to Northstar's blue, teal, and light-surface palette. The Northstar export supplies the mapping only; this package does not modify or restyle `apps/demo-web`.

Use `data-access-theme="sentriq"` or `data-access-theme="northstar"` on the relevant app root for the semantic CSS properties. `AccessPreferencesPanel` and `AccessLanguageSelect` are shared React controls styled by `components.css`.
