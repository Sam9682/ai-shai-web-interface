# Architecture Document Commentaires & i18n Bugfix Design

## Overview

The "Generate Architecture Document" button on the OPCP installations page produces a self-contained HTML architecture document for a selected installation. Today that document has three defects, all present on every generation:

1. Each question row renders the row's **example value** (`row.exampleValue`, under a column labeled "Exemple") instead of the intended **comments/details value** (`row.commentsHint`, "Commentaires / Détails") the web page shows next to each question.
2. The document is **hardcoded in French** (`<html lang="fr">`, French `<title>`, headers, section names, footer, credential labels), so it cannot be produced in English even when the user's active interface language is English.
3. Several keywords remain **French-only** (for example the QA header cells and the servers-section headings/labels), so they are never localized.

The fix threads the user's **active interface language** (from the Language_Store, `localStorage` key `opcp.language`, normalized to `en`/`fr`) into the document generator, renders `commentsHint` in place of `exampleValue`, and localizes every previously hardcoded French keyword/header/section title/label/footer in both languages.

The fix is deliberately minimal and localized to the document-generation code. All structural behavior — HTML-escaping, mandatory/optional markers, the em-dash placeholder, the answer ("Valeur"/"Value") cell, the full set of QA sections plus the servers/node-inventory section, node/credential fields, and the download filename — is preserved unchanged.

## Glossary

- **Bug_Condition (C)**: The condition that triggers the bug. Here it holds for *every* generation, because the example/comments swap is wrong in both languages and the output language is always French regardless of the active interface language.
- **Property (P)**: The desired behavior — the document renders `commentsHint` (not `exampleValue`), uses `<html lang="{active}">`, and localizes every chrome/header/section/credential label to the active language.
- **Preservation**: The structural and French-language behaviors that must remain identical to the pre-fix builder — HTML-escaping, markers, the answer cell and em-dash placeholder, the section set, node/credential fields, the download filename, and the exact French wording of labels whose meaning is unchanged.
- **`generateArchitectureDocument(installation, language)`**: Entry point in `frontend/src/services/installationExport.ts`. Fetches the installation's values (via the export builder) and renders them to a downloadable HTML file. Gains a `language` parameter.
- **`buildArchitectureDocumentHtml(data, language)`**: Assembles the full HTML string. Gains a `language` parameter and selects a per-language label map.
- **`renderRow` / `renderQaSection` / `renderServersSection`**: Helpers that render a question row, a QA tab, and the servers/node-inventory section respectively. Each is threaded the resolved label map.
- **`QuestionRow.exampleValue` / `QuestionRow.commentsHint`**: Optional per-row strings in `frontend/src/components/prerequisites/types.ts`. The fix reads `commentsHint` where it previously read `exampleValue`.
- **Language**: The `'fr' | 'en'` type exported from `frontend/src/i18n/translations.ts`. Reused for type-safety.
- **Language_Store**: `localStorage` under key `opcp.language`, owned by the `LanguageProvider` in `frontend/src/hooks/useLanguage.tsx`; exposed to components as `language` from `useTranslation()`.
- **DocLabels**: A per-language map of the document's static strings, defined inside `installationExport.ts` (see Fix Implementation).

## Bug Details

### Bug Condition

The bug manifests on every generation of the architecture document. Two independent defects are always present: the row renderer emits `exampleValue` instead of `commentsHint`, and the builder hardcodes French output (`<html lang="fr">`, French title/headers/sections/footer/credential labels) regardless of the active interface language.

**Formal Specification:**
```
FUNCTION isBugCondition(input)
  INPUT: input = { data: InstallationExport, language: 'en' | 'fr' }
  OUTPUT: boolean

  // Defective on every generation:
  //  - renders exampleValue instead of commentsHint (in either language), AND
  //  - emits French regardless of input.language.
  RETURN true
END FUNCTION
```

### Examples

- **Comments vs example (FR)**: A row with `exampleValue = "10.0.0.1"` and `commentsHint = "Adresse du contrôleur"` renders the "Exemple" column `10.0.0.1`. Expected: a "Commentaires / Détails" column showing `Adresse du contrôleur`.
- **English active language**: User has `opcp.language = "en"`, clicks Generate. Document is emitted as `<html lang="fr">` with `<h1>Document d'architecture</h1>`. Expected: `<html lang="en">` with `<h1>Architecture document</h1>`.
- **QA header (EN)**: With English active, the QA table header reads "Paramètre / Question", "Valeur", "Exemple". Expected: "Parameter / Question", "Value", "Comments / Details".
- **Servers section (EN)**: With English active, headings read "Servers nodes", "Configuration OpenStack", "Inventaire des nœuds serveurs"; credential "Certificat CA"; secret status "Enregistré (non exporté)" / "Non configuré"; empty message "Aucune configuration OpenStack enregistrée." Expected: English equivalents.
- **French preserved (edge case)**: With French active, "Document d'architecture" and "Sommaire" must render exactly as before — unchanged wording.

## Expected Behavior

### Preservation Requirements

**Unchanged Behaviors:**
- The mandatory/optional marker per row (🔴 mandatory, ⚪ optional) is rendered exactly as before.
- The answer ("Valeur"/"Value") cell renders the trimmed answer, and the em-dash placeholder (`—`) when the answer is empty.
- All user-supplied values (answers, question text, comments, node fields, credentials) are HTML-escaped.
- The document includes all QA sections and the servers/node-inventory section, and downloads a self-contained HTML file named `{project}-architecture-{date}.html`.
- The servers section renders the same node fields (Node UUID, Serial Number, Instance UUID, Power State, Provision State, Remark) and credential fields (Auth URL, Credential ID, Nova endpoint, CA certificate, Secret).
- When French is active, French labels whose meaning is unchanged (e.g. "Document d'architecture", "Sommaire", "Valeur", "Auth URL") render with exactly their original French text.

**Scope:**
This fix changes only which per-row field is rendered (`commentsHint` instead of `exampleValue`) and the language of the document's static strings. It does not change how values are fetched, escaped, structured, or downloaded. Everything outside the label vocabulary and the single field swap is unaffected.

## Hypothesized Root Cause

Based on the bug description and the current code in `installationExport.ts`, the causes are:

1. **Wrong field read in `renderRow`**: The helper reads `row.exampleValue` and emits it under a fixed "Exemple" column. It should read `row.commentsHint` and emit it under a "Commentaires / Détails" / "Comments / Details" column.

2. **Hardcoded French document chrome in `buildArchitectureDocumentHtml`**: `<html lang="fr">`, the `<title>`, `<h1>Document d'architecture</h1>`, the "Sommaire"/"Projet"/"Généré le" meta, and the "Généré par …" footer are literal French strings with no language input.

3. **Hardcoded French header/section text in `renderQaSection`**: The QA table header ("Paramètre / Question", "Valeur", "Exemple") is inlined in French.

4. **Hardcoded French text in `renderServersSection`**: The "Servers nodes"/"Configuration OpenStack"/"Inventaire des nœuds serveurs" headings, the "Certificat CA" credential label, the "Enregistré (non exporté)"/"Non configuré" secret statuses, and the "Aucune configuration OpenStack enregistrée." empty message are inlined in French.

5. **No language input threaded from the caller**: `generateArchitectureDocument(installation)` takes no language, and the button handler in `InstallationListPage.tsx` does not pass the active `language` from `useTranslation()`. The generator therefore has no way to select a language even if the strings were localized.

## Correctness Properties

Property 1: Bug Condition - Comments rendered in the active language with localized labels

_For any_ input where the bug condition holds (isBugCondition returns true — i.e. every generation), the fixed builder SHALL render each question row's `commentsHint` value (and SHALL NOT render `exampleValue`), SHALL set the document `lang` attribute to the active language, and SHALL emit every document chrome string, QA table header, servers-section heading, credential label, secret-status, and empty-configuration message localized to the active language (English when active is `en`, French when active is `fr`).

**Validates: Requirements 2.1, 2.2, 2.3, 2.4, 2.5**

Property 2: Preservation - French output and document structure preserved

_For any_ input where the active language is French, the fixed builder SHALL produce, for every previously French label whose meaning is unchanged, exactly the same French text as the original builder; and _for any_ input regardless of language, the fixed builder SHALL preserve the answer cell content and em-dash placeholder, the mandatory/optional markers, HTML-escaping of every user-supplied value, the full set of QA and servers sections, the node and credential fields, and the `{project}-architecture-{date}.html` download filename.

**Validates: Requirements 3.1, 3.2, 3.3, 3.4, 3.5, 3.6**

## Fix Implementation

### Changes Required

Assuming the root-cause analysis is correct, all rendering changes live in the export service, plus a one-line change at the call site.

**File**: `frontend/src/services/installationExport.ts`

1. **Introduce a per-language `DocLabels` map (co-located, dependency-free)**: Define a `DocLabels` interface and a `DOC_LABELS: Record<Language, DocLabels>` constant near the architecture-document section, importing only the `Language` type from `../i18n/translations`. The map holds every document string:
   - Chrome: `htmlLang` (`'fr'`/`'en'`), `title` ("Document d'architecture" / "Architecture document"), `agent` (kept as the brand string "Export Agent"), `summary` ("Sommaire" / "Summary"), `projectLabel` ("Projet" / "Project"), `generatedOnLabel` ("Généré le" / "Generated on"), `footerGeneratedBy` ("Généré par …" / "Generated by …").
   - QA header: `paramQuestion` ("Paramètre / Question" / "Parameter / Question"), `value` ("Valeur" / "Value"), `comments` ("Commentaires / Détails" / "Comments / Details").
   - Servers: `serversNodes`, `openstackConfig`, `nodeInventory`, `authUrl` (kept "Auth URL"), `credentialId` (kept "Credential ID"), `novaEndpoint` (kept "Nova endpoint"), `caCertificate` ("Certificat CA" / "CA certificate"), `secret` ("Secret"), `secretStored` ("Enregistré (non exporté)" / "Stored (not exported)"), `secretNotConfigured` ("Non configuré" / "Not configured"), `noOpenstackConfig` ("Aucune configuration OpenStack enregistrée." / "No OpenStack configuration saved.").

   Rationale for a local map over the shared `translations.ts` dictionaries: these strings are export-document vocabulary, not app UI_Strings. Keeping them in `installationExport.ts` keeps the service free of a React/i18n coupling, keeps it pure and unit-testable, and avoids expanding the shared `fr`/`en` key-parity set with an unrelated concern. Only the `Language` type is reused, for type-safety.

2. **`renderRow(row, answer, labels)`**: Read `row.commentsHint` instead of `row.exampleValue`. Keep the same cell structure (marker, question, value cell with em-dash placeholder), HTML-escaping, and the muted `—` fallback when the field is empty. The third data column now shows the comments value. (No per-language text is inside `renderRow` itself beyond escaping user content; the column header comes from `renderQaSection`.)

3. **`renderQaSection(title, config, answers, labels)`**: Replace the inlined header cells with `labels.paramQuestion`, `labels.value`, `labels.comments`. Section title and QA titles remain the (data-derived) `title`/`section.title`, escaped as before.

4. **`renderServersSection(nodes, credentials, labels)`**: Replace inlined French with `labels.serversNodes`, `labels.openstackConfig`, `labels.nodeInventory`, `labels.caCertificate`, `labels.secret`, `labels.secretStored`, `labels.secretNotConfigured`, `labels.noOpenstackConfig`, and the credential row labels (`authUrl`, `credentialId`, `novaEndpoint`). Node-table column headers (Node UUID, Serial Number, Instance UUID, Power State, Provision State, Remark) are technical identifiers left as-is per preservation (3.6), matching the current behavior.

5. **`buildArchitectureDocumentHtml(data, language)`**: Add a `language` parameter, resolve `const labels = DOC_LABELS[language]`, set `<html lang="${labels.htmlLang}">`, and swap every chrome literal (`<title>`, `<h1>`, meta `projectLabel`/`generatedOnLabel`, `nav` `summary`, footer `footerGeneratedBy`) for `labels.*`. Thread `labels` into `renderQaSection` and `renderServersSection`.

6. **`generateArchitectureDocument(installation, language)`**: Add a `language: Language` parameter and pass it to `buildArchitectureDocumentHtml(data, language)`. The filename derivation (`{project}-architecture-{date}.html`) is unchanged.

**File**: `frontend/src/components/prerequisites/InstallationListPage.tsx`

7. **Pass the active language at the call site**: The component already calls `const { t } = useTranslation()`. Also destructure `language` and change the call to `await generateArchitectureDocument(installation, language)` inside `handleGenerateDoc`.

## Testing Strategy

### Validation Approach

The testing strategy follows a two-phase approach: first, surface counterexamples that demonstrate the bug on the unfixed code (wrong field, wrong language, French-only labels), then verify the fix renders comments in the active language while preserving all structural and French-language behavior.

### Exploratory Bug Condition Checking

**Goal**: Surface counterexamples that demonstrate the bug BEFORE implementing the fix, and confirm the root-cause analysis (wrong field read + hardcoded French + no language threaded). If a test unexpectedly passes on unfixed code, re-hypothesize.

**Test Plan**: Call `buildArchitectureDocumentHtml` with a fixture `InstallationExport` whose QA config includes rows with distinct `exampleValue` and `commentsHint`, once per language, and assert on the produced HTML string. Run on UNFIXED code to observe failures.

**Test Cases**:
1. **Comments-not-example (FR)**: Assert the HTML contains the row's `commentsHint` and not its `exampleValue` (will fail on unfixed code).
2. **English language attribute**: Call with `language = 'en'`, assert `<html lang="en">` and English `<h1>` (will fail on unfixed code).
3. **Localized QA header (EN)**: Assert the header contains "Parameter / Question", "Value", "Comments / Details" (will fail on unfixed code).
4. **Localized servers section (EN)**: Assert "CA certificate", "Stored (not exported)", "No OpenStack configuration saved." appear for English (will fail on unfixed code).
5. **Out-of-vocabulary edge case**: A row with `commentsHint` undefined renders the muted `—` placeholder rather than crashing (may fail/behave differently on unfixed code, which reads `exampleValue`).

**Expected Counterexamples**:
- HTML contains `exampleValue` text and "Exemple"; `<html lang="fr">` even when `language = 'en'`; QA header and servers text always French.
- Possible causes: `renderRow` reads `exampleValue`; chrome/header/section strings hardcoded; no `language` parameter threaded.

### Fix Checking

**Goal**: Verify that for all inputs where the bug condition holds (every generation), the fixed builder produces the expected behavior.

**Pseudocode:**
```
FOR ALL input WHERE isBugCondition(input) DO
  html := buildArchitectureDocumentHtml_fixed(input.data, input.language)
  ASSERT html renders commentsHint (not exampleValue) for each question row
  ASSERT html lang attribute = input.language
  ASSERT every chrome/header/section/credential label is localized to input.language
END FOR
```

### Preservation Checking

**Goal**: Verify that for the behaviors that must not regress, the fixed builder matches the original — the exact French wording (when French is active) and the structural invariants regardless of language.

**Pseudocode:**
```
FOR ALL input WHERE input.language = 'fr' DO
  ASSERT unchanged-meaning French labels equal their original French text  // 3.1
END FOR

FOR ALL input (any language) DO
  ASSERT answer cell + em-dash placeholder identical to original           // 3.2
  ASSERT mandatory/optional markers identical to original                  // 3.3
  ASSERT every user-supplied value is HTML-escaped                         // 3.4
  ASSERT full QA + servers section set present; filename unchanged         // 3.5
  ASSERT node fields + credential fields identical to original             // 3.6
END FOR
```

**Testing Approach**: Property-based testing is recommended for preservation checking because:
- It generates many QA configs, answers, node inventories, and credential values automatically across the input domain.
- It catches escaping and placeholder edge cases (empty answers, special characters, missing fields) that hand-written cases miss.
- It provides strong guarantees that structure and French wording are unchanged for all inputs.

**Test Plan**: Capture the current French output and structure on UNFIXED code, then write property-based tests that assert those invariants hold for the fixed builder (with the single, intended field-swap and language-selection difference).

**Test Cases**:
1. **French wording preserved**: With `language = 'fr'`, assert "Document d'architecture", "Sommaire", "Valeur" render exactly as originally.
2. **Answer cell & placeholder**: For rows with and without answers, assert the trimmed answer appears and empty answers yield the muted `—`.
3. **HTML-escaping**: For values containing `& < > " '`, assert they appear escaped in the output for answers, question text, comments, node fields, and credentials.
4. **Section set & filename**: Assert every QA section and the servers section are present, and `generateArchitectureDocument` downloads `{project}-architecture-{date}.html`.
5. **Node/credential fields**: Assert Node UUID, Serial Number, Instance UUID, Power State, Provision State, Remark, and Auth URL/Credential ID/Nova endpoint/CA certificate/Secret rows are all present.

### Unit Tests

- `renderRow` renders `commentsHint` (not `exampleValue`), with the correct marker and value cell, in both languages.
- `renderQaSection` header cells localize to the active language.
- `renderServersSection` headings, credential labels, secret statuses, and empty message localize to the active language; node column headers unchanged.
- `buildArchitectureDocumentHtml` sets the correct `<html lang>` and localized chrome per language.
- Edge cases: undefined `commentsHint`, empty answers, null credentials (empty-configuration message).

### Property-Based Tests

- Generate random QA configs/answers and assert each row shows its `commentsHint` and preserves the marker + answer-cell/placeholder logic across both languages.
- Generate random node inventories and credentials and assert every node/credential field is present and HTML-escaped, in both languages (preservation).
- Generate values with HTML-special characters and assert escaping holds everywhere across many scenarios.

### Integration Tests

- Full flow: from `InstallationListPage`, generating with French active produces a French document; generating with English active produces an English document.
- Switching the interface language and regenerating produces a document in the newly active language.
- The generated file downloads with the expected filename and renders the servers/node inventory alongside all QA sections.
