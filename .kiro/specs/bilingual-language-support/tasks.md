# Implementation Plan: Bilingual Language Support

## Overview

This plan builds a dependency-free French/English localization layer for the OPCP frontend (React 19 + Vite + TypeScript). Work proceeds bottom-up: first the pure i18n primitives (dictionaries, `resolve`/`normalizeLanguage`, the context object), then the `LanguageProvider` + `useTranslation` hook, then wiring the provider into `App.tsx`, then the EN/FR controls in `Layout.tsx`, and finally migration of hardcoded French strings across `Layout`, `pages/`, and `prerequisites/`. Property and unit tests are placed close to the code they validate so regressions surface early. Each step builds on the previous and ends integrated into the running app with no orphaned code.

## Tasks

- [x] 1. Create i18n translation primitives
  - [x] 1.1 Create translation dictionaries and language types (`frontend/src/i18n/translations.ts`)
    - Define `Language` type (`'fr' | 'en'`), `SUPPORTED_LANGUAGES`, `DEFAULT_LANGUAGE = 'fr'`, and `TranslationDictionary` type
    - Add `fr` and `en` dictionaries with the initial nav/auth/lang keys from the design (`nav.*`, `auth.*`, `lang.fr`, `lang.en`) and export `dictionaries: Record<Language, TranslationDictionary>`
    - Keep `fr` and `en` key sets identical
    - _Requirements: 5.3, 5.4_

  - [x]* 1.2 Write structural test for dictionary key parity (`frontend/src/i18n/translations.test.ts`)
    - Assert `fr` and `en` have identical key sets so missing translations are caught
    - _Requirements: 5.3_

  - [x] 1.3 Implement pure resolution and normalization (`frontend/src/i18n/resolve.ts`)
    - Implement `resolve(dicts, language, key)` returning localized text or the raw `key` on miss
    - Implement `normalizeLanguage(raw)` coercing non-supported values (including `null`, empty string) to `DEFAULT_LANGUAGE`
    - _Requirements: 2.1, 2.2, 2.5, 4.3, 4.4_

  - [x]* 1.4 Write property test for key resolution (`frontend/src/i18n/resolve.test.ts`)
    - **Feature: bilingual-language-support, Property 2: Keys resolve to the active language's text**
    - For any Supported_Language `L` and any key present in `dictionaries[L]`, `resolve` returns `dictionaries[L][key]` (min 100 iterations)
    - **Validates: Requirements 2.1, 2.2, 6.2**

  - [x]* 1.5 Write property test for missing-key fallback (`frontend/src/i18n/resolve.test.ts`)
    - **Feature: bilingual-language-support, Property 3: Missing keys fall back to the key text**
    - For any Supported_Language `L` and any random string key absent from `dictionaries[L]`, `resolve` returns the key unchanged (min 100 iterations)
    - **Validates: Requirements 2.5**

  - [x]* 1.6 Write property test for invalid-value normalization (`frontend/src/i18n/resolve.test.ts`)
    - **Feature: bilingual-language-support, Property 5: Invalid or absent stored values normalize to French**
    - For any value `v` not in the Supported_Language set, `normalizeLanguage(v)` yields French (min 100 iterations)
    - **Validates: Requirements 4.3, 4.4, 6.4**

  - [x] 1.7 Create the language context object (`frontend/src/i18n/LanguageContext.ts`)
    - Define `LanguageContextValue` interface (`language`, `setLanguage`, `t`) and create the context with default `null`
    - _Requirements: 5.1, 5.2_

- [x] 2. Implement the LanguageProvider and useTranslation hook
  - [x] 2.1 Implement provider and hook (`frontend/src/hooks/useLanguage.tsx`)
    - Implement `LanguageProvider`: initialize from the Language_Store (`opcp.language`) via `normalizeLanguage`, persist on change in a `useEffect`, expose `{ language, setLanguage, t }` memoized value
    - Wrap all localStorage reads/writes in try/catch (mirror `usePersistentForm.ts`); failed read defaults to French, failed write leaves in-memory state authoritative
    - Implement `useTranslation` reading the context and throwing a descriptive error when used outside the provider
    - _Requirements: 4.1, 4.2, 4.3, 4.4, 5.1, 5.2_

  - [x]* 2.2 Write property test for set-language transition (`frontend/src/hooks/useLanguage.test.tsx`)
    - **Feature: bilingual-language-support, Property 1: Language switch sets the active language**
    - For any Supported_Language `L`, calling `setLanguage(L)` makes the Active_Language exactly `L` (min 100 iterations)
    - **Validates: Requirements 1.3, 1.4, 6.1**

  - [x]* 2.3 Write property test for persistence round-trip (`frontend/src/hooks/useLanguage.test.tsx`)
    - **Feature: bilingual-language-support, Property 4: Language selection round-trips through the store**
    - For any Supported_Language `L`, setting the language writes `L` to the store and re-initializing yields `L` (min 100 iterations)
    - **Validates: Requirements 4.1, 4.2, 6.3**

  - [x]* 2.4 Write example tests for provider behavior (`frontend/src/hooks/useLanguage.test.tsx`)
    - New_Visitor (empty store) initializes to French; provider exposes `language`, `setLanguage`, and `t` to a consumer; a UI_String resolves to French text under `fr` and English text under `en`
    - _Requirements: 4.3, 5.1, 5.2, 6.2, 6.4_

- [x] 3. Wire LanguageProvider into the app root (`frontend/src/App.tsx`)
  - Wrap the existing `<Router>` with `<LanguageProvider>` so all routes and `Layout` are descendants; leave routes unchanged
  - _Requirements: 5.1_

- [x] 4. Checkpoint - Ensure all tests pass
  - Ensure all tests pass, ask the user if questions arise.

- [x] 5. Add EN/FR Language_Control to the Top_Banner (`frontend/src/components/Layout.tsx`)
  - [x] 5.1 Add the desktop and mobile language switcher controls
    - Call `useTranslation()` in `Layout`; render FR and EN buttons in the desktop auth cluster and in the mobile menu block
    - Each button calls `setLanguage(lng)`, sets `aria-pressed={language === lng}`, and applies distinct active/inactive Tailwind styles; label via `t('lang.fr')` / `t('lang.en')`
    - _Requirements: 1.1, 1.2, 1.3, 1.4, 1.5_

  - [x]* 5.2 Write example tests for the language controls (`frontend/src/components/Layout.language.test.tsx`)
    - Assert both FR and EN controls render in desktop and mobile variants; active control has `aria-pressed="true"` and inactive `false` for each selected language; switching re-renders consumer text without reload
    - _Requirements: 1.1, 1.2, 1.5, 2.3_

- [x] 6. Migrate hardcoded French strings in Layout to keyed lookups (`frontend/src/components/Layout.tsx`)
  - Replace literals (`Accueil`, `Forum`, `Événements`, `Gérer les événements`, `Documents`, `Oracle IA`, prerequisites label, `Utilisateurs`, `Déconnexion`, `Connexion`, `Inscription`, `Sécurité du compte`, and the `aria-label="Sécurité du compte"`) with `t('nav.*')` / `t('auth.*')` lookups; add any missing keys to both dictionaries
    - Leave `computeHeaderLabel` output as-is (embeds Dynamic_Content); keep the static `OPCP` prefix unchanged
    - _Requirements: 2.1, 2.2, 2.4, 3.1, 3.2_

- [x] 7. Migrate prerequisites navigation and static labels
  - [x] 7.1 Convert prerequisites nav/status/marker labels to keys (`frontend/src/components/prerequisites/types.ts`)
    - Change `PREREQ_NAV_ITEMS[].label` to `labelKey` (e.g. `prereq.nav.basics`); convert `STATUS_OPTIONS[].label` and `PREREQ_MARKERS[].label` to `labelKey`; keep icons/routes unchanged
    - Add the corresponding `prereq.*` keys to both `fr` and `en` dictionaries
    - _Requirements: 2.4, 5.3_

  - [x] 7.2 Resolve prerequisites labels via `t` at render sites
    - Update consumers of nav/status/marker items (e.g. `configs.ts` usages, prerequisite components) to resolve `t(item.labelKey)` at render time; migrate remaining static section titles/parameter labels in `configs.ts` to keys while leaving authored answer/parameter values as Dynamic_Content
    - _Requirements: 2.1, 2.2, 2.4, 3.1, 3.2_

  - [x]* 7.3 Update prerequisites tests for keyed labels
    - Adjust `navItems.test.ts` / `configs.test.ts` and related component tests to expect `labelKey` and resolved text; wrap rendered components in `LanguageProvider`
    - _Requirements: 2.4_

- [x] 8. Migrate hardcoded French strings in page components (`frontend/src/pages/`)
  - Call `useTranslation()` in each page component and swap literal French JSX text for `t('page.<area>.<key>')`; add the keys to both dictionaries; leave backend/user-authored text (forum posts, question answers, stored values) rendered as-is
  - _Requirements: 2.1, 2.2, 2.4, 3.1, 3.2_

- [x] 9. Final checkpoint - Ensure all tests pass
  - Ensure all tests pass, ask the user if questions arise.

## Notes

- Tasks marked with `*` are optional and can be skipped for a faster MVP.
- Each task references specific requirements for traceability.
- Property tests (Properties 1–5) validate universal correctness properties from the design and use a tiny inline randomized generator (no new dependency), running a minimum of 100 iterations.
- Unit/example tests validate specific examples, edge cases, and accessibility selectors (`aria-pressed`).
- Only static UI_String content flows through `t(...)`; Dynamic_Content is never routed through the resolver (Requirement 3).
- No third-party i18n package is added (Requirement 5.4).

## Task Dependency Graph

```json
{
  "waves": [
    { "id": 0, "tasks": ["1.1", "1.3", "1.7"] },
    { "id": 1, "tasks": ["1.2", "1.4", "1.5", "1.6", "2.1"] },
    { "id": 2, "tasks": ["2.2", "2.3", "2.4", "3"] },
    { "id": 3, "tasks": ["5.1", "7.1"] },
    { "id": 4, "tasks": ["5.2", "6", "7.2", "8"] },
    { "id": 5, "tasks": ["7.3"] }
  ]
}
```
