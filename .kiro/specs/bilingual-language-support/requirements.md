# Requirements Document

## Introduction

This feature adds bilingual (French and English) support for the user interface of the OPCP web application frontend. Currently the frontend displays hardcoded French strings throughout the top banner (`frontend/src/components/Layout.tsx`), the page components in `frontend/src/pages/`, and the prerequisites components (`frontend/src/components/prerequisites/`, including navigation labels defined in `prerequisites/types.ts`).

The feature introduces a lightweight, dependency-free localization mechanism built on React Context, a provider, and a translation hook backed by plain TypeScript French/English translation dictionaries. Users select their language from EN/FR controls added to the top banner (desktop and mobile variants). The selection persists across reloads via browser local storage, with French as the default for new visitors.

Scope is limited to static UI strings. Dynamic content originating from the Python backend remains in its authored language and is not localized. The backend is out of scope for this feature.

## Glossary

- **Language_System**: The frontend localization subsystem comprising the React Context, provider, translation hook, and translation dictionaries that resolve UI string keys to localized text.
- **Language_Provider**: The React context provider component that holds the active language and exposes it, along with the language-switching function, to descendant components.
- **Translation_Hook**: The `useTranslation`-style React hook that returns the translation lookup function and the active language for the current component.
- **Translation_Dictionary**: A plain TypeScript data structure mapping string keys to localized text for a single language (French or English).
- **Top_Banner**: The sticky navigation header rendered by `frontend/src/components/Layout.tsx`, including both the desktop menu variant and the mobile menu variant.
- **Language_Control**: The EN and FR menu items or buttons added to the Top_Banner that switch the active language when activated.
- **Active_Language**: The language currently selected for rendering UI strings; one of French (`fr`) or English (`en`).
- **Supported_Language**: A language available for selection; the set is French (`fr`) and English (`en`).
- **Language_Store**: The browser localStorage entry that persists the user's selected language across page reloads and browser sessions.
- **UI_String**: A static, application-authored text element such as a label, button, menu item, or static page content that is rendered by the frontend.
- **Dynamic_Content**: Text originating from the backend or user-authored data (for example, forum posts, question answers, and stored parameter values) that is displayed in its authored language.
- **New_Visitor**: A user for whom no valid Active_Language value exists in the Language_Store.

## Requirements

### Requirement 1: Language selection controls in the top banner

**User Story:** As a user, I want EN and FR controls in the top banner, so that I can switch the interface language at any time.

#### Acceptance Criteria

1. THE Top_Banner SHALL display a Language_Control for French and a Language_Control for English in the desktop menu variant.
2. THE Top_Banner SHALL display a Language_Control for French and a Language_Control for English in the mobile menu variant.
3. WHEN a user activates the English Language_Control, THE Language_System SHALL set the Active_Language to English.
4. WHEN a user activates the French Language_Control, THE Language_System SHALL set the Active_Language to French.
5. THE Top_Banner SHALL render a visual indication identifying which Language_Control corresponds to the Active_Language.

### Requirement 2: Localized rendering of UI strings

**User Story:** As a user, I want the interface text to appear in my selected language, so that I can read the application in French or English.

#### Acceptance Criteria

1. WHEN the Active_Language is French, THE Language_System SHALL resolve each UI_String to its French text from the Translation_Dictionary.
2. WHEN the Active_Language is English, THE Language_System SHALL resolve each UI_String to its English text from the Translation_Dictionary.
3. WHEN the Active_Language changes, THE Language_System SHALL re-render the affected UI_String elements in the new Active_Language without a page reload.
4. THE Language_System SHALL resolve UI_String values for the Top_Banner, the page components in `frontend/src/pages/`, and the prerequisites components including the navigation labels defined in `prerequisites/types.ts`.
5. IF a UI_String key has no entry in the Translation_Dictionary for the Active_Language, THEN THE Language_System SHALL render the string key text so that the interface remains readable.

### Requirement 3: Scope boundary for dynamic content

**User Story:** As a coordinator, I want backend and user-authored content to remain in its authored language, so that stored data is displayed unchanged regardless of interface language.

#### Acceptance Criteria

1. THE Language_System SHALL localize UI_String elements only.
2. WHEN the Active_Language changes, THE Language_System SHALL render Dynamic_Content in its authored language unchanged.

### Requirement 4: Language persistence

**User Story:** As a returning user, I want my language choice to be remembered, so that I do not have to reselect it on every visit.

#### Acceptance Criteria

1. WHEN a user sets the Active_Language, THE Language_System SHALL write the selected language to the Language_Store.
2. WHEN the application loads AND a valid Active_Language value exists in the Language_Store, THE Language_System SHALL set the Active_Language to the stored value.
3. WHERE the user is a New_Visitor, THE Language_System SHALL set the Active_Language to French.
4. IF the Language_Store contains a value that is not a Supported_Language, THEN THE Language_System SHALL set the Active_Language to French.

### Requirement 5: Dependency-free implementation

**User Story:** As a developer, I want the localization built without new third-party packages, so that the frontend stays lightweight and maintainable.

#### Acceptance Criteria

1. THE Language_System SHALL provide the Active_Language and the language-switching function to descendant components through the Language_Provider.
2. THE Language_System SHALL expose UI_String resolution to components through the Translation_Hook.
3. THE Language_System SHALL store French and English UI_String text in Translation_Dictionary structures defined in TypeScript.
4. THE Language_System SHALL implement localization using the existing frontend runtime and React APIs without adding a third-party internationalization dependency.

### Requirement 6: Automated test coverage

**User Story:** As a developer, I want automated tests for the localization behavior, so that regressions are detected during development.

#### Acceptance Criteria

1. THE Language_System SHALL include Vitest tests verifying that activating the English Language_Control sets the Active_Language to English and activating the French Language_Control sets the Active_Language to French.
2. THE Language_System SHALL include Vitest tests verifying that a UI_String resolves to its French text when the Active_Language is French and to its English text when the Active_Language is English.
3. THE Language_System SHALL include Vitest tests verifying that the Active_Language is written to and restored from the Language_Store.
4. THE Language_System SHALL include Vitest tests verifying that a New_Visitor receives French as the Active_Language.
