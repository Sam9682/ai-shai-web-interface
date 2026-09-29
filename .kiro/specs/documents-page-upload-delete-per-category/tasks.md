# Implementation Plan

- [x] 1. Write bug condition exploration tests (BEFORE implementing the fix)
  - **Property 1: Bug Condition** - Per-Section Upload, Admin Delete, Plain-Text Links
  - **CRITICAL**: These tests MUST FAIL on unfixed code - failure confirms the bug exists
  - **DO NOT attempt to fix the tests or the code when they fail**
  - **NOTE**: These tests encode the expected (post-fix) behavior - they will validate the fix when they pass after implementation
  - **GOAL**: Surface counterexamples that demonstrate the bug exists across the three concerns
  - Create `frontend/src/pages/DocumentsPage.uploadDeleteLinks.bug.test.tsx`
  - Reuse existing conventions: `vi.mock('../services/documentService', ...)` factory extended with a `deleteDocument: vi.fn()` mock; `vi.mock('../services/authService', ...)` with `isAdmin: vi.fn()`; render inside `LanguageProvider` (default French); the `makeDocument(id, original_name, size, category, target_url?)` helper; `fast-check` with `NUM_RUNS = 100`; stub the confirmation via `vi.spyOn(window, 'confirm')`
  - **Scoped PBT Approach**: for deterministic UI states, scope properties to concrete cases (admin with items across multiple categories; a single `links` item with a usable `target_url`) to keep failures reproducible
  - Encode the Bug Condition from design — `isBugCondition(X)` is true when: `(X.isAdmin AND NOT X.hasPerSectionUploadControls)` OR `(X.isAdmin AND X.renderedItem.exists AND NOT X.renderedItem.hasDeleteControl)` OR `(X.renderedItem.category = 'links' AND X.renderedItem.hasUsableTargetUrl AND X.renderedItem.linkRendersAsButton)`
  - Test (a) Per-section upload: with `isAdmin === true` and items across multiple categories, assert every rendered section exposes its own upload control targeted by its per-section accessible label (e.g. `"<upload label> — <category label>"`) — FAILS on unfixed code (only a single global control exists)
  - Test (b) Admin delete control present: with `isAdmin === true` and a rendered item, assert a Delete control (`getByRole('button', { name: /supprimer/i })`) exists next to it — FAILS on unfixed code
  - Test (c) Delete wiring: with `window.confirm` stubbed to return `true`, activating Delete calls `documentService.deleteDocument(doc.id)` then re-fetches via `listDocuments` — FAILS on unfixed code (method/control absent)
  - Test (d) Plain-text link: a `links` item with a usable `target_url` renders a plain hyperlink (`getByRole('link')` with `href`/`target="_blank"`/`rel="noopener noreferrer"` set) and NOT a button-styled anchor (no `bg-[#000E9C]`, `rounded`, padding classes) — FAILS on unfixed code (button styling)
  - Run tests on UNFIXED code
  - **EXPECTED OUTCOME**: Tests FAIL (this is correct - it proves the bug exists)
  - Document counterexamples found: no per-section upload control for admins; no Delete control and `deleteDocument` undefined; the `links` anchor carries button classes instead of plain-hyperlink styling
  - Mark task complete when tests are written, run, and failures are documented
  - _Requirements: 1.1, 1.2, 1.3, 2.1, 2.2, 2.4_

- [x] 2. Write preservation property tests (BEFORE implementing the fix)
  - **Property 2: Preservation** - Non-Buggy Inputs Behave Identically
  - **IMPORTANT**: Follow observation-first methodology — run the UNFIXED code first, observe actual outputs, then write property-based tests asserting those observed outputs
  - Create `frontend/src/pages/DocumentsPage.uploadDeleteLinks.preservation.test.tsx`
  - Reuse existing conventions: mocked `documentService` (with `deleteDocument` mock) and `authService`, `LanguageProvider`, `makeDocument` helper, `fast-check` with `NUM_RUNS = 100`, `vi.spyOn(window, 'confirm')`
  - Observe on UNFIXED code and capture the following behaviors (cases where `isBugCondition` returns false):
    - Observe: with `isAdmin === false`, no upload control and no Delete control render for any item (property over arbitrary document lists) — capture and assert. Validates 2.3, 3.1
    - Observe: every non-`links` item renders exactly one Download button wired to `downloadDocument(id, original_name)` (property over arbitrary lists) — capture and assert. Validates 3.4
    - Observe: a `links` item with missing/null/empty `target_url` renders the Download fallback and no hyperlink — capture and assert. Validates 3.5
    - Observe: a successful upload refreshes the list and the item appears under its server-derived category; a failed upload (unmapped extension) shows the existing upload error banner and sends no client category param — capture and assert. Validates 3.2, 3.3
    - Observe: sections render in `CATEGORY_ORDER` first then any remaining present categories (grouping-is-a-partition-by-category property) — capture and assert. Validates 3.6
    - Observe: case-insensitive substring filter on `original_name`, all docs shown on empty query, and the empty-state message when nothing matches — capture and assert. Validates 3.7
  - Run tests on UNFIXED code
  - **EXPECTED OUTCOME**: Tests PASS (this confirms the baseline behavior to preserve)
  - Mark task complete when tests are written, run, and passing on unfixed code
  - _Requirements: 2.3, 3.1, 3.2, 3.3, 3.4, 3.5, 3.6, 3.7_

- [x] 3. Fix for per-category upload, admin delete, and plain-text links on the Documents page

  - [x] 3.1 Add `deleteDocument` to the document service
    - In `frontend/src/services/documentService.ts`, add `deleteDocument(id: string): Promise<void>` issuing `api.delete(\`/documents/${id}\`)` (resolving to `DELETE /api/documents/{document_id}`)
    - Return void and let errors propagate so the page can surface a delete-error banner
    - Keep the existing `uploadDocument(file)` signature for uploads (posts to `/documents/upload`); no client category param
    - _Bug_Condition: isBugCondition(X) where X.isAdmin AND X.renderedItem.exists AND NOT X.renderedItem.hasDeleteControl (deleteDocument absent)_
    - _Expected_Behavior: deleteDocument(id) calls DELETE /api/documents/{id} per expectedBehavior in design_
    - _Preservation: existing listDocuments/uploadDocument/downloadDocument signatures unchanged (Preservation Requirements)_
    - _Requirements: 2.2_

  - [x] 3.2 Add per-section admin-only upload control in DocumentsPage
    - In `frontend/src/pages/DocumentsPage.tsx`, remove the single global upload block and its single `fileInputRef`
    - Inside each rendered `<section>` (when `isAdmin`), render an upload control: a file `<input type="file">` plus an "Upload" button that triggers that section's input
    - Back each section's input with a **per-category callback-ref map** keyed by category (`Record<DocumentCategory, HTMLInputElement | null>`), NOT a single `useRef`, so each button clicks its own input
    - On change, call `documentService.uploadDocument(file)` then `loadDocuments()` to refresh; reset that section's input value so re-selecting the same file re-triggers change
    - Keep a single page-level `uploadError` banner; give each section's input a distinct accessible label incorporating the category (e.g. `"<upload label> — <category label>"`)
    - Category stays server-derived from the file extension; send no client category param
    - _Bug_Condition: isBugCondition(X) where X.isAdmin AND NOT X.hasPerSectionUploadControls_
    - _Expected_Behavior: X.isAdmin IMPLIES result.everyRenderedSection.hasUploadControl (Property 1 in design)_
    - _Preservation: server-derived category derivation and unmapped-extension rejection unchanged (3.2, 3.3); non-admins see no upload control (3.1)_
    - _Requirements: 2.1_

  - [x] 3.3 Add admin-only Delete control with confirmation in DocumentsPage
    - Add a `deleteError` state and a `handleDelete(doc)` handler that requires a `window.confirm` confirmation step, then calls `documentService.deleteDocument(doc.id)` and `loadDocuments()`; on failure set the `deleteError` banner (mirroring the upload/download error pattern)
    - When confirmation is cancelled, make no service call
    - Render a Delete control next to each item, gated by `authService.isAdmin()`, alongside the existing Download/hyperlink control
    - _Bug_Condition: isBugCondition(X) where X.isAdmin AND X.renderedItem.exists AND NOT X.renderedItem.hasDeleteControl_
    - _Expected_Behavior: result.everyRenderedItem.hasDeleteControl = X.isAdmin; activation calls deleteDocument(id) then refreshes (Property 1 in design)_
    - _Preservation: non-admins see no Delete control (2.3, 3.1); Download handling unchanged (3.4)_
    - _Requirements: 2.2, 2.3_

  - [x] 3.4 Restyle the links anchor as a plain hyperlink in DocumentsPage
    - In the `isLink` branch, replace the button classes with plain-hyperlink styling: link color, `hover:underline`, no `bg-*`, no `rounded`, no padding
    - Keep `href={target_url}`, `target="_blank"`, `rel="noopener noreferrer"`, and the accessible name derived from `original_name` so `getByRole('link', { name: /.../ })` still resolves
    - Preserve the Download fallback for `links` items without a usable `target_url` (`doc.category === 'links' && !!doc.target_url` gate unchanged)
    - _Bug_Condition: isBugCondition(X) where X.renderedItem.category = 'links' AND X.renderedItem.hasUsableTargetUrl AND X.renderedItem.linkRendersAsButton_
    - _Expected_Behavior: usable links item isPlainHyperlink AND opensTargetUrl AND NOT linkRendersAsButton (Property 1 in design)_
    - _Preservation: links items without a usable target_url keep the Download fallback (3.5)_
    - _Requirements: 2.4_

  - [x] 3.5 Add delete/confirm translation keys
    - In `frontend/src/i18n/translations.ts`, add `page.documents.delete` (FR "Supprimer" / EN "Delete"), `page.documents.error.delete` (delete failure banner), and `page.documents.delete.confirm` (confirmation prompt) in both FR and EN
    - Reuse existing `page.documents.upload.*`, `page.documents.download`, and `page.documents.openLink` keys
    - _Bug_Condition: supporting change for the Delete control and confirmation from isBugCondition(X)_
    - _Expected_Behavior: Delete control and confirmation prompt display localized copy (Property 1 in design)_
    - _Preservation: existing translation keys and bilingual coverage unchanged_
    - _Requirements: 2.2_

  - [x] 3.6 Verify bug condition exploration tests now pass
    - **Property 1: Expected Behavior** - Per-Section Upload, Admin Delete, Plain-Text Links
    - **IMPORTANT**: Re-run the SAME tests from task 1 - do NOT write new tests
    - The tests from task 1 encode the expected behavior; when they pass, they confirm the expected behavior is satisfied
    - Run the bug condition exploration tests from step 1
    - **EXPECTED OUTCOME**: Tests PASS (confirms the bug is fixed across all three concerns)
    - _Requirements: 2.1, 2.2, 2.4_

  - [x] 3.7 Verify preservation tests still pass
    - **Property 2: Preservation** - Non-Buggy Inputs Behave Identically
    - **IMPORTANT**: Re-run the SAME tests from task 2 - do NOT write new tests
    - Run the preservation property tests from step 2
    - **EXPECTED OUTCOME**: Tests PASS (confirms no regressions for non-admins, non-`links` items, links fallback, category derivation/rejection, grouping/ordering, and search filtering)
    - _Requirements: 2.3, 3.1, 3.2, 3.3, 3.4, 3.5, 3.6, 3.7_

- [x] 4. Checkpoint - Ensure the full frontend suite passes
  - Run the full frontend test suite in single-run mode (e.g. `npm test -- --run` / `vitest --run`) from `frontend/`
  - Confirm the new bug-condition and preservation tests pass alongside the existing DocumentsPage suites (no regressions)
  - Ensure all tests pass, ask the user if questions arise
