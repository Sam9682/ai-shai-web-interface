# Implementation Plan

- [x] 1. Write bug condition exploration test
  - **Property 1: Bug Condition** - Comments rendered in the active language with localized labels
  - **CRITICAL**: This test MUST FAIL on unfixed code - failure confirms the bug exists
  - **DO NOT attempt to fix the test or the code when it fails**
  - **NOTE**: This test encodes the expected behavior - it will validate the fix when it passes after implementation
  - **GOAL**: Surface counterexamples that demonstrate the bug exists (wrong field read, hardcoded French, French-only labels)
  - **Scoped PBT Approach**: The bug condition holds for every generation, so scope the property over the two concrete languages (`'fr'`, `'en'`) with a fixture `InstallationExport` whose QA config has rows with distinct `exampleValue` and `commentsHint`. Assert against the produced HTML string via `buildArchitectureDocumentHtml`.
  - Test implementation details from Bug Condition in design (`isBugCondition` returns true for all inputs; `renderRow` emits `exampleValue`; chrome/header/section strings hardcoded French; no `language` threaded):
    - Comments-not-example (FR): assert HTML contains the row's `commentsHint` and NOT its `exampleValue`
    - English language attribute: call with `language = 'en'`, assert `<html lang="en">` and English `<h1>` ("Architecture document")
    - Localized QA header (EN): assert header contains "Parameter / Question", "Value", "Comments / Details"
    - Localized servers section (EN): assert "CA certificate", "Stored (not exported)", "No OpenStack configuration saved." appear
    - Out-of-vocabulary edge case: a row with `commentsHint` undefined renders the muted `—` placeholder rather than crashing
  - The test assertions should match the Expected Behavior Properties from design (renders `commentsHint`, `lang` = active language, all chrome/header/section/credential labels localized)
  - Place the test in `frontend/src/services/installationExport.test.ts`; run with `npm test` (vitest) using `fast-check` for property generation
  - Run test on UNFIXED code
  - **EXPECTED OUTCOME**: Test FAILS (this is correct - it proves the bug exists)
  - Document counterexamples found to understand root cause (e.g. "HTML contains `10.0.0.1` and 'Exemple'; `<html lang=\"fr\">` even when language='en'; QA header and servers text always French")
  - Mark task complete when test is written, run, and failure is documented
  - _Requirements: 2.1, 2.2, 2.3, 2.4, 2.5_

- [x] 2. Write preservation property tests (BEFORE implementing fix)
  - **Property 2: Preservation** - French output and document structure preserved
  - **IMPORTANT**: Follow observation-first methodology
  - Observe behavior on UNFIXED code for the invariants that must not regress, then encode them:
    - Observe: with `language = 'fr'` the document contains "Document d'architecture", "Sommaire", "Valeur" - record exact French text
    - Observe: a row with an answer renders the trimmed answer in the value cell; an empty answer renders the muted `—` placeholder
    - Observe: mandatory rows render 🔴 and optional rows render ⚪
    - Observe: values containing `& < > " '` appear HTML-escaped for answers, question text, comments, node fields, and credentials
    - Observe: all QA sections plus the servers/node-inventory section are present; `generateArchitectureDocument` downloads `{project}-architecture-{date}.html`
    - Observe: node fields (Node UUID, Serial Number, Instance UUID, Power State, Provision State, Remark) and credential fields (Auth URL, Credential ID, Nova endpoint, CA certificate, Secret) are all present
  - Write property-based tests (using `fast-check`) capturing these observed patterns from Preservation Requirements in design:
    - Generate random QA configs/answers and assert each preserves the marker + answer-cell/em-dash logic across both languages
    - Generate random node inventories and credentials and assert every node/credential field is present and HTML-escaped in both languages
    - Generate values with HTML-special characters and assert escaping holds everywhere
    - With `language = 'fr'`, assert unchanged-meaning French labels equal their original French text
  - Property-based testing generates many test cases for stronger guarantees
  - Place the tests in `frontend/src/services/installationExport.test.ts`; run with `npm test`
  - Run tests on UNFIXED code
  - **EXPECTED OUTCOME**: Tests PASS (this confirms baseline behavior to preserve)
  - Mark task complete when tests are written, run, and passing on unfixed code
  - _Requirements: 3.1, 3.2, 3.3, 3.4, 3.5, 3.6_

- [x] 3. Fix for architecture-document comments field and i18n localization

  - [x] 3.1 Introduce a per-language `DocLabels` map and thread `language` through the builder
    - In `frontend/src/services/installationExport.ts`, define a `DocLabels` interface and a `DOC_LABELS: Record<Language, DocLabels>` constant near the architecture-document section, importing only the `Language` type from `../i18n/translations`
    - Populate `DOC_LABELS` for `fr` and `en`: chrome (`htmlLang`, `title`, `agent`, `summary`, `projectLabel`, `generatedOnLabel`, `footerGeneratedBy`), QA header (`paramQuestion`, `value`, `comments`), servers (`serversNodes`, `openstackConfig`, `nodeInventory`, `authUrl`, `credentialId`, `novaEndpoint`, `caCertificate`, `secret`, `secretStored`, `secretNotConfigured`, `noOpenstackConfig`)
    - `renderRow(row, answer, labels)`: read `row.commentsHint` instead of `row.exampleValue`; keep marker, value cell, em-dash placeholder, and HTML-escaping unchanged
    - `renderQaSection(title, config, answers, labels)`: replace inlined French header cells with `labels.paramQuestion`, `labels.value`, `labels.comments`
    - `renderServersSection(nodes, credentials, labels)`: replace inlined French with `labels.serversNodes`, `labels.openstackConfig`, `labels.nodeInventory`, `labels.caCertificate`, `labels.secret`, `labels.secretStored`, `labels.secretNotConfigured`, `labels.noOpenstackConfig`, and credential row labels (`authUrl`, `credentialId`, `novaEndpoint`); leave node-table column headers as technical identifiers
    - `buildArchitectureDocumentHtml(data, language)`: add `language` parameter, resolve `const labels = DOC_LABELS[language]`, set `<html lang="${labels.htmlLang}">`, swap every chrome literal for `labels.*`, and thread `labels` into `renderQaSection`/`renderServersSection`
    - `generateArchitectureDocument(installation, language)`: add a `language: Language` parameter and pass it to `buildArchitectureDocumentHtml`; keep the `{project}-architecture-{date}.html` filename derivation unchanged
    - In `frontend/src/components/prerequisites/InstallationListPage.tsx`, destructure `language` from `useTranslation()` and change the call to `await generateArchitectureDocument(installation, language)` in `handleGenerateDoc`
    - _Bug_Condition: isBugCondition(X) returns true for every generation (renders exampleValue instead of commentsHint AND emits French regardless of X.language)_
    - _Expected_Behavior: renders commentsHint, sets `<html lang>` to active language, localizes every chrome/header/section/credential label_
    - _Preservation: answer cell + em-dash, markers, HTML-escaping, full section set, node/credential fields, filename, unchanged-meaning French wording_
    - _Requirements: 2.1, 2.2, 2.3, 2.4, 2.5, 3.1, 3.2, 3.3, 3.4, 3.5, 3.6_

  - [x] 3.2 Verify bug condition exploration test now passes
    - **Property 1: Expected Behavior** - Comments rendered in the active language with localized labels
    - **IMPORTANT**: Re-run the SAME test from task 1 - do NOT write a new test
    - The test from task 1 encodes the expected behavior; when it passes it confirms the expected behavior is satisfied
    - Run the bug condition exploration test from step 1
    - **EXPECTED OUTCOME**: Test PASSES (confirms bug is fixed)
    - _Requirements: 2.1, 2.2, 2.3, 2.4, 2.5_

  - [x] 3.3 Verify preservation tests still pass
    - **Property 2: Preservation** - French output and document structure preserved
    - **IMPORTANT**: Re-run the SAME tests from task 2 - do NOT write new tests
    - Run the preservation property tests from step 2
    - **EXPECTED OUTCOME**: Tests PASS (confirms no regressions)
    - Confirm all tests still pass after fix (no regressions)
    - _Requirements: 3.1, 3.2, 3.3, 3.4, 3.5, 3.6_

  - [x] 3.4 Add focused unit tests for the helpers and edge cases
    - `renderRow` renders `commentsHint` (not `exampleValue`) with the correct marker and value cell, in both languages
    - `renderQaSection` header cells localize to the active language
    - `renderServersSection` headings, credential labels, secret statuses, and empty message localize to the active language; node column headers unchanged
    - `buildArchitectureDocumentHtml` sets the correct `<html lang>` and localized chrome per language
    - Edge cases: undefined `commentsHint` yields the muted `—`, empty answers yield `—`, null/empty credentials yield the empty-configuration message
    - _Requirements: 2.1, 2.2, 2.3, 2.4, 2.5, 3.2, 3.4_

- [x] 4. Checkpoint - Ensure all tests pass
  - Run `npm test` (vitest) in `frontend/` and confirm the exploration test (task 1), preservation tests (task 2), and unit tests (task 3.4) all pass
  - Run `npm run build` to confirm the threaded `language` parameter type-checks across the service and `InstallationListPage.tsx`
  - Ensure all tests pass; ask the user if questions arise
