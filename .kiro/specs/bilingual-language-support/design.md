# Design Document

## Overview

This design adds a lightweight, dependency-free French/English localization layer to the OPCP frontend (React 19 + Vite + TailwindCSS v4, `react-router-dom` v7). It follows the existing conventions already present in the codebase: plain TypeScript data structures for static config (mirroring `prerequisites/types.ts`), a defensive localStorage access pattern with try/catch and validation (mirroring `hooks/usePersistentForm.ts`), and Vitest + `@testing-library/react` for tests.

The localization subsystem (Language_System) consists of four cooperating parts:

1. **Translation dictionaries** — plain TS objects mapping string keys to localized text, one per Supported_Language (`fr`, `en`).
2. **LanguageProvider** — a React Context provider that owns the Active_Language, initializes it from the Language_Store (localStorage), persists changes, and exposes the language plus a `setLanguage` switcher to descendants.
3. **useTranslation hook** — the Translation_Hook that consumer components call to obtain the resolver function `t(key)` and the current Active_Language.
4. **Language_Control UI** — EN/FR controls added to the Top_Banner (both desktop and mobile variants) with an active-language visual indication.

Migration work replaces hardcoded French strings in `Layout.tsx`, the `pages/` components, and the `prerequisites/` components (including navigation labels in `prerequisites/types.ts`) with keyed lookups through `t(...)`.

Only static UI_String content flows through `t(...)`. Dynamic_Content (backend/user-authored data such as forum posts, question answers, stored parameter values) is rendered as-is and never routed through the resolver, satisfying the scope boundary in Requirement 3. No third-party i18n package is added (Requirement 5.4).

### Goals

- Runtime language switching without page reload.
- Persistence across reloads with French default and safe fallback on invalid stored values.
- No new dependencies; only React APIs and the existing runtime.
- Testable, pure resolution logic separable from React rendering.

### Non-Goals

- Localizing backend responses or user-authored data.
- Locale-aware number/date formatting (out of scope; only static string swaps).
- Adding languages beyond `fr` and `en`.

## Architecture

```
                       ┌──────────────────────────────────────┐
   App.tsx  ──────────▶│           LanguageProvider            │
   (wraps <Router/>)   │  state: language: 'fr' | 'en'         │
                       │  init:  read + normalize localStorage │
                       │  effect: persist language on change   │
                       │  value: { language, setLanguage, t }  │
                       └───────────────┬──────────────────────┘
                                       │ React Context
              ┌────────────────────────┼─────────────────────────┐
              ▼                        ▼                          ▼
       Layout.tsx               pages/*.tsx            prerequisites/*.tsx
   (Top_Banner + controls)   (useTranslation → t)   (useTranslation → t)
              │
              ▼
     Language_Control (EN/FR)
   calls setLanguage('en'|'fr')
   marks active via aria-pressed
```

Data + control flow:

1. `LanguageProvider` wraps the app at the root (inside `App.tsx`, wrapping the `Router`) so every route and the shared `Layout` are descendants.
2. On mount, the provider reads the Language_Store, normalizes the value to a Supported_Language (defaulting to `fr`), and seeds React state.
3. Consumers call `useTranslation()` to get `{ t, language, setLanguage }`. `t(key)` looks up `dictionary[language][key]`, falling back to the raw `key` when absent.
4. Activating a Language_Control calls `setLanguage(next)`, which updates state (triggering re-render of all consumers) and persists the value to the Language_Store.

The resolution and normalization logic are implemented as **pure, exported functions** (`resolve`, `normalizeLanguage`) so they can be unit- and property-tested without mounting React.

### Placement (new files)

```
frontend/src/i18n/
  translations.ts     # Language type, SUPPORTED_LANGUAGES, dictionaries, keys
  translations.test.ts
  resolve.ts          # pure resolve(dict, lang, key) + normalizeLanguage(raw)
  resolve.test.ts
  LanguageContext.ts  # React context object + typed value shape
frontend/src/hooks/
  useLanguage.ts      # LanguageProvider component + useTranslation hook
  useLanguage.test.tsx
```

The `i18n` folder groups the dependency-free localization primitives; the provider/hook live under the existing `hooks/` folder to match `usePersistentForm.ts`.

## Components and Interfaces

### Language types and dictionaries (`i18n/translations.ts`)

```typescript
export type Language = 'fr' | 'en';

export const SUPPORTED_LANGUAGES: readonly Language[] = ['fr', 'en'] as const;
export const DEFAULT_LANGUAGE: Language = 'fr';

// A dictionary maps UI_String keys to localized text for one language.
export type TranslationDictionary = Record<string, string>;

// Keys are grouped by area for readability but remain a flat string namespace.
// Example excerpt (full set added during migration):
export const fr: TranslationDictionary = {
  'nav.home': 'Accueil',
  'nav.forum': 'Forum',
  'nav.events': 'Événements',
  'nav.events.manage': 'Gérer les événements',
  'nav.documents': 'Documents',
  'nav.oracle': 'Oracle IA',
  'nav.prerequisites': 'OPCP installation prerequisites',
  'nav.users': 'Utilisateurs',
  'auth.logout': 'Déconnexion',
  'auth.login': 'Connexion',
  'auth.register': 'Inscription',
  'auth.accountSecurity': 'Sécurité du compte',
  'lang.fr': 'FR',
  'lang.en': 'EN',
  // ...prerequisites nav labels, page strings, status labels, markers...
};

export const en: TranslationDictionary = {
  'nav.home': 'Home',
  'nav.forum': 'Forum',
  'nav.events': 'Events',
  'nav.events.manage': 'Manage events',
  'nav.documents': 'Documents',
  'nav.oracle': 'AI Oracle',
  'nav.prerequisites': 'OPCP installation prerequisites',
  'nav.users': 'Users',
  'auth.logout': 'Log out',
  'auth.login': 'Log in',
  'auth.register': 'Sign up',
  'auth.accountSecurity': 'Account security',
  'lang.fr': 'FR',
  'lang.en': 'EN',
  // ...
};

export const dictionaries: Record<Language, TranslationDictionary> = { fr, en };
```

Notes:
- `fr` and `en` share the same key set. A structural test asserts key-set parity so a missing translation is caught early (Requirement 5.3).
- Prerequisites nav labels currently defined inline in `PREREQ_NAV_ITEMS` become **translation keys** (e.g. `prereq.nav.basics`) rather than literal labels; `types.ts` stores a `labelKey` instead of `label`, and consumers resolve via `t(item.labelKey)` (Requirement 2.4).

### Pure resolution + normalization (`i18n/resolve.ts`)

```typescript
import type { Language, TranslationDictionary } from './translations';
import { SUPPORTED_LANGUAGES, DEFAULT_LANGUAGE, dictionaries } from './translations';

/**
 * Resolve a UI_String key for a language. Returns the localized text when
 * present; otherwise returns the key itself so the interface stays readable.
 * (Requirement 2.1, 2.2, 2.5)
 */
export function resolve(
  dicts: Record<Language, TranslationDictionary>,
  language: Language,
  key: string,
): string {
  const text = dicts[language]?.[key];
  return text ?? key;
}

/**
 * Normalize an arbitrary stored value to a Supported_Language, defaulting to
 * French for absent/invalid input. (Requirement 4.3, 4.4)
 */
export function normalizeLanguage(raw: unknown): Language {
  return SUPPORTED_LANGUAGES.includes(raw as Language)
    ? (raw as Language)
    : DEFAULT_LANGUAGE;
}
```

These functions are pure and side-effect free, making them the primary targets for property-based tests.

### Context object (`i18n/LanguageContext.ts`)

```typescript
import { createContext } from 'react';
import type { Language } from './translations';

export interface LanguageContextValue {
  language: Language;
  setLanguage: (next: Language) => void;
  t: (key: string) => string;
}

export const LanguageContext = createContext<LanguageContextValue | null>(null);
```

Default `null` lets `useTranslation` throw a clear error if used outside a provider.

### Provider + hook (`hooks/useLanguage.tsx`)

```typescript
import { useCallback, useEffect, useMemo, useState } from 'react';
import type { ReactNode } from 'react';
import { LanguageContext } from '../i18n/LanguageContext';
import type { Language } from '../i18n/translations';
import { dictionaries } from '../i18n/translations';
import { normalizeLanguage, resolve } from '../i18n/resolve';

const STORAGE_KEY = 'opcp.language';

function readInitialLanguage(): Language {
  try {
    return normalizeLanguage(localStorage.getItem(STORAGE_KEY));
  } catch {
    // localStorage unavailable (privacy mode): default to French. (4.3/4.4)
    return normalizeLanguage(null);
  }
}

export function LanguageProvider({ children }: { children: ReactNode }) {
  const [language, setLanguageState] = useState<Language>(readInitialLanguage);

  // Persist on change; write failures must not break the UI (mirrors
  // usePersistentForm's defensive try/catch). (Requirement 4.1)
  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEY, language);
    } catch {
      /* ignore quota/unavailable storage */
    }
  }, [language]);

  const setLanguage = useCallback((next: Language) => {
    setLanguageState(normalizeLanguage(next));
  }, []);

  const t = useCallback(
    (key: string) => resolve(dictionaries, language, key),
    [language],
  );

  const value = useMemo(
    () => ({ language, setLanguage, t }),
    [language, setLanguage, t],
  );

  return (
    <LanguageContext.Provider value={value}>
      {children}
    </LanguageContext.Provider>
  );
}

export function useTranslation() {
  const ctx = useContext(LanguageContext);
  if (ctx === null) {
    throw new Error('useTranslation must be used within a LanguageProvider');
  }
  return ctx; // { language, setLanguage, t }
}
```

(`useContext` imported from `react`.) The provider exposes both the Active_Language and the switcher (Requirement 5.1) and the resolver (Requirement 5.2) through context.

### App integration (`App.tsx`)

`LanguageProvider` wraps the router so all routes and the shared `Layout` consume the context:

```tsx
function App() {
  return (
    <LanguageProvider>
      <Router>
        {/* existing routes unchanged */}
      </Router>
    </LanguageProvider>
  );
}
```

### Language_Control in the Top_Banner (`Layout.tsx`)

A small `LanguageSwitcher` presentational block is rendered in both the desktop auth area and the mobile menu. It reads `{ language, setLanguage, t }` from `useTranslation()`.

```tsx
const { language, setLanguage, t } = useTranslation();

// Desktop (compact, in the right-hand auth cluster)
<div className="flex items-center gap-1" role="group" aria-label="Language">
  {(['fr', 'en'] as const).map((lng) => (
    <button
      key={lng}
      type="button"
      onClick={() => setLanguage(lng)}
      aria-pressed={language === lng}
      className={
        language === lng
          ? 'px-2 py-1 text-xs font-semibold rounded bg-white text-[#000E9C]'
          : 'px-2 py-1 text-xs font-medium rounded text-white/80 hover:bg-white/10'
      }
    >
      {t(`lang.${lng}`)}
    </button>
  ))}
</div>
```

The mobile variant renders the same two controls inside the mobile menu block. The active language is indicated both by a distinct Tailwind style and by `aria-pressed="true"` (Requirement 1.5), which also gives tests a stable, accessible selector.

Existing hardcoded strings in `Layout.tsx` (`Accueil`, `Forum`, `Événements`, `Gérer les événements`, `Documents`, `Oracle IA`, the prerequisites label, `Utilisateurs`, `Déconnexion`, `Connexion`, `Inscription`, `Sécurité du compte`, the `aria-label="Sécurité du compte"`) are replaced with `t(...)` lookups (Requirement 2.4). The `computeHeaderLabel` output stays as-is because it embeds Dynamic_Content (email/name) — only the literal `OPCP` prefix is static and remains unchanged.

### Migration approach for pages and prerequisites

- Each page component calls `useTranslation()` and swaps literal French JSX text for `t('page.<area>.<key>')`.
- `prerequisites/types.ts`: `PREREQ_NAV_ITEMS[].label` → `labelKey`; `STATUS_OPTIONS[].label` and `PREREQ_MARKERS[].label` become `labelKey` referencing dictionary entries. Icons and routes are unchanged.
- Config-driven static strings (e.g. `prerequisites/configs.ts` section titles, parameter labels) that are UI_String content are keyed; content that is authored data (persisted answers/values) stays dynamic and is not routed through `t`.
- Consumers that render config labels resolve them at render time via `t(item.labelKey)`.

## Data Models

```typescript
type Language = 'fr' | 'en';                                   // Supported_Language
type TranslationDictionary = Record<string, string>;           // Translation_Dictionary
type Dictionaries = Record<Language, TranslationDictionary>;

interface LanguageContextValue {                               // Language_Provider value
  language: Language;                                          // Active_Language
  setLanguage: (next: Language) => void;                       // switcher
  t: (key: string) => string;                                 // Translation_Hook resolver
}
```

Language_Store: a single localStorage entry under key `opcp.language` holding the raw language string (`'fr'` or `'en'`).

## Error Handling

- **Missing translation key**: `resolve` returns the raw key rather than throwing, keeping the UI readable (Requirement 2.5).
- **Invalid / absent stored value**: `normalizeLanguage` coerces anything outside `{ 'fr', 'en' }` (including `null`, empty string, stale codes) to French (Requirements 4.3, 4.4).
- **localStorage unavailable** (privacy mode, disabled storage, quota): all reads/writes are wrapped in try/catch. A failed read defaults to French; a failed write leaves in-memory state authoritative for the session and does not surface an error (mirrors `usePersistentForm.ts`).
- **Hook misuse**: calling `useTranslation` outside a `LanguageProvider` throws a descriptive error, surfacing wiring mistakes during development.

## Testing Strategy

Tests use Vitest + `@testing-library/react`, matching the existing suites (e.g. `usePersistentForm.test.ts`, `Layout.*.test.tsx`). Property tests use randomized inputs and run a minimum of 100 iterations; a tiny inline generator suffices (no new dependency) — e.g. random supported-language picks and random strings for missing-key and invalid-value cases.

Unit / example tests:
- Layout renders both FR and EN controls in desktop and mobile variants (Requirements 1.1, 1.2).
- Active control carries `aria-pressed="true"` and the inactive one `false`, for each selected language (Requirement 1.5).
- Switching language re-renders consumer text without reload (Requirement 2.3).
- Dynamic_Content passed as data is unchanged across a language switch (Requirement 3.2).
- New_Visitor (empty store) initializes to French (Requirement 4.3).
- Provider exposes `language`, `setLanguage`, and `t` to a consumer (Requirements 5.1, 5.2).
- Structural: `fr` and `en` dictionaries have identical key sets (Requirement 5.3).

Property tests (see Correctness Properties): resolution, missing-key fallback, set-language transition, persistence round-trip, invalid-value normalization. These directly satisfy the Vitest coverage mandates in Requirements 6.1–6.4.

Property test tag format: **Feature: bilingual-language-support, Property {number}: {property_text}**

## Correctness Properties

*A property is a characteristic or behavior that should hold true across all valid executions of a system-essentially, a formal statement about what the system should do. Properties serve as the bridge between human-readable specifications and machine-verifiable correctness guarantees.*

### Property 1: Language switch sets the active language

*For any* Supported_Language `L`, activating the Language_Control for `L` (invoking `setLanguage(L)`) results in the Active_Language being exactly `L`.

**Validates: Requirements 1.3, 1.4, 6.1**

### Property 2: Keys resolve to the active language's text

*For any* Supported_Language `L` and *any* key present in `dictionaries[L]`, `resolve(dictionaries, L, key)` returns `dictionaries[L][key]`.

**Validates: Requirements 2.1, 2.2, 6.2**

### Property 3: Missing keys fall back to the key text

*For any* Supported_Language `L` and *any* string `key` that is not present in `dictionaries[L]`, `resolve(dictionaries, L, key)` returns `key` unchanged.

**Validates: Requirements 2.5**

### Property 4: Language selection round-trips through the store

*For any* Supported_Language `L`, setting the Active_Language to `L` writes `L` to the Language_Store, and re-initializing the Language_System from that store yields Active_Language `L`.

**Validates: Requirements 4.1, 4.2, 6.3**

### Property 5: Invalid or absent stored values normalize to French

*For any* value `v` that is not a Supported_Language (including `null`, empty string, and arbitrary strings), initializing the Language_System with `v` in the Language_Store yields Active_Language French.

**Validates: Requirements 4.3, 4.4, 6.4**
