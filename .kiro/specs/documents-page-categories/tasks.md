# Implementation Plan

- [x] 1. Write bug condition exploration test
  - **Property 1: Bug Condition** - Files Grouped By Originating Subfolder
  - **CRITICAL**: This test MUST FAIL on unfixed code - failure confirms the bug exists
  - **DO NOT attempt to fix the test or the code when it fails**
  - **NOTE**: This test encodes the expected behavior - it will validate the fix when it passes after implementation
  - **GOAL**: Surface counterexamples that demonstrate the bug and confirm/refute the root-cause hypotheses (non-recursive discovery, hard-coded category, insufficient enum, static frontend grouping)
  - **Scoped PBT Approach**: Scope the property to the concrete originating subfolders in `{docs, links, scripts, trainings}` — for each subfolder, a seeded file must end up with `category == originatingSubfolder`
  - Backend: create a temporary `docs/to_publish` fixture with one file in each of `docs`, `links`, `scripts`, `trainings` (plus `movies`/`images` to confirm exclusion); run the seeder (`seed_docs_folder` / `discover_source_files` in `app/services/document_seed_service.py`) and assert each persisted `Document.category` equals the file's originating subfolder (from Bug Condition `isBugCondition(input)` in design)
  - Backend: assert `discover_source_files` finds files inside `docs/to_publish/trainings` (recursive discovery) and does NOT surface files under `movies`/`images`
  - Frontend: render `DocumentsPage` (`frontend/src/pages/DocumentsPage.tsx`) with documents carrying `docs` and `trainings` categories and assert a section is rendered per category (from Expected Behavior Property 1 in design)
  - Run test on UNFIXED code
  - **EXPECTED OUTCOME**: Test FAILS (this is correct - it proves the bug exists)
  - Document counterexamples found (e.g. "file under trainings persists with category=documents", "trainings section not rendered — category dropped by static CATEGORY_ORDER/grouped", "discover_source_files omits subfolder files")
  - Mark task complete when test is written, run, and failure is documented
  - _Requirements: 1.1, 1.2, 1.3, 1.4, 2.1, 2.2, 2.3, 2.4_

- [x] 2. Write preservation property tests (BEFORE implementing fix)
  - **Property 2: Preservation** - Behavior Unrelated To Subfolder Grouping
  - **IMPORTANT**: Follow observation-first methodology — observe behavior on UNFIXED code first, then encode it
  - Observe on UNFIXED code and capture as tests (property-based where practical):
    - Search: filename search filters displayed files to those whose `original_name` matches the query (Requirement 3.1) — generate randomized queries and assert substring semantics
    - Download: download returns the correct file by `original_name` via the existing endpoint (Requirement 3.2)
    - Upload: an admin upload is accepted and the list refreshes so the new file appears (Requirement 3.3)
    - RBAC: list/download respect public/members/administrators — generate randomized `(role, access_level)` combinations and assert list/download outcomes (Requirement 3.4)
    - Empty-category: a category section with no files after filtering is omitted (Requirement 3.5)
    - Empty-state: when no files match the current view, the existing empty-state message is shown (Requirement 3.6)
    - Exclusion: files under `movies`/`images` do NOT become category sections
  - Run tests on UNFIXED code
  - **EXPECTED OUTCOME**: Tests PASS (this confirms the baseline behavior to preserve)
  - Mark task complete when tests are written, run, and passing on unfixed code
  - _Requirements: 3.1, 3.2, 3.3, 3.4, 3.5, 3.6_

- [x] 3. Fix subfolder-based category grouping for the Documents page

  - [x] 3.1 Expand the `DocumentCategory` enum
    - In `app/models/document.py`, add `DOCS = "docs"` and `TRAININGS = "trainings"` to `DocumentCategory`
    - Keep the existing `DOCUMENTS`, `SCRIPTS`, `LINKS` members so already-seeded rows and extension-based uploads remain valid
    - Confirm no native DB enum ALTER is required (column uses `SQLEnum(..., native_enum=False)`, values stored as strings); do not add a migration for the grouping fix itself
    - _Bug_Condition: isBugCondition(input) where input.originatingSubfolder IN {docs, links, scripts, trainings}_
    - _Expected_Behavior: result.category = input.originatingSubfolder (from design Property 1)_
    - _Preservation: existing enum members and stored rows unchanged (from Preservation Requirements)_
    - _Requirements: 2.2, 2.4_

  - [x] 3.2 Make discovery recursive and retain the originating subfolder
    - In `app/services/document_seed_service.py`, change `discover_source_files` to walk the four content subfolders (`docs`, `links`, `scripts`, `trainings`) of `docs/to_publish` and return each file paired with its originating subfolder (e.g. a list of `(Path, subfolder_name)` tuples)
    - Restrict discovery to those four subfolders so `movies` and `images` are excluded
    - _Bug_Condition: isBugCondition(input) — subfolder files must be discovered with their originating subfolder retained_
    - _Expected_Behavior: discover surfaces files under docs/links/scripts/trainings and excludes movies/images (from design Property 1)_
    - _Preservation: non-content subfolders (movies/images) do not become categories (from Preservation Requirements)_
    - _Requirements: 2.4_

  - [x] 3.3 Infer category from the originating subfolder and thread it through seeding
    - In `app/services/document_seed_service.py`, change `infer_category` to accept the originating subfolder (or the pair) and return the corresponding `DocumentCategory` member instead of hard-coding `DOCUMENTS`
    - Update `_seed_single_file` (and `seed_docs_folder`'s loop) to pass the originating subfolder so the created `Document.category` reflects it
    - Preserve the existing behavior of leaving `category` untouched on re-sync of an existing row (respect manual reclassification), matching current code
    - _Bug_Condition: isBugCondition(input) — assignedCategory(input) must equal input.originatingSubfolder_
    - _Expected_Behavior: expectedBehavior(result) → result.category = input.originatingSubfolder (from design Property 1)_
    - _Preservation: category left untouched on re-sync of existing rows (from Preservation Requirements)_
    - _Requirements: 2.2, 2.4_

  - [x] 3.4 Widen the frontend `DocumentCategory` type
    - In `frontend/src/services/documentService.ts`, extend the `DocumentCategory` union to `'documents' | 'scripts' | 'links' | 'docs' | 'trainings'`
    - Keep `documents` in the union for backward compatibility with legacy rows
    - _Bug_Condition: isBugCondition(input) — docs/trainings categories must be typeable_
    - _Expected_Behavior: docs and trainings are valid category values (from design Property 1)_
    - _Preservation: existing category values remain valid (from Preservation Requirements)_
    - _Requirements: 2.1, 2.2_

  - [x] 3.5 Render category sections dynamically and add label keys
    - In `frontend/src/pages/DocumentsPage.tsx`, add `docs` and `trainings` entries to `CATEGORY_LABEL_KEYS` mapping to `page.documents.category.docs` and `page.documents.category.trainings`
    - Replace the hard-coded three-value `CATEGORY_ORDER` with the intended subfolder order (`docs`, `links`, `scripts`, `trainings`) while still tolerating a legacy `documents` category (render it if present)
    - Build `grouped` from the categories actually present in `filtered` rather than a fixed literal map, so unknown-but-valid categories are not dropped
    - Continue to omit empty category sections and preserve the existing empty-state branch
    - _Bug_Condition: isBugCondition(input) — docs/trainings sections must render, not be dropped by static grouping_
    - _Expected_Behavior: categorySectionRendered(result.category) = TRUE (from design Property 1)_
    - _Preservation: empty categories omitted (3.5) and empty-state shown (3.6) unchanged_
    - _Requirements: 2.1, 2.3, 3.5, 3.6_

  - [x] 3.6 Add French and English translations for the new categories
    - In `frontend/src/i18n/translations.ts`, add FR and EN strings for `page.documents.category.docs` and `page.documents.category.trainings` alongside the existing category labels
    - _Bug_Condition: isBugCondition(input) — docs/trainings sections need labels_
    - _Expected_Behavior: category sections render with correct labels (from design Property 1)_
    - _Preservation: existing category labels unchanged (from Preservation Requirements)_
    - _Requirements: 2.1, 2.3_

  - [x] 3.7 Verify bug condition exploration test now passes
    - **Property 1: Expected Behavior** - Files Grouped By Originating Subfolder
    - **IMPORTANT**: Re-run the SAME test from task 1 - do NOT write a new test
    - The test from task 1 encodes the expected behavior; when it passes it confirms files group by originating subfolder and each category renders its own section
    - Run bug condition exploration test from step 1
    - **EXPECTED OUTCOME**: Test PASSES (confirms bug is fixed)
    - _Requirements: 2.1, 2.2, 2.3, 2.4_

  - [x] 3.8 Verify preservation tests still pass
    - **Property 2: Preservation** - Behavior Unrelated To Subfolder Grouping
    - **IMPORTANT**: Re-run the SAME tests from task 2 - do NOT write new tests
    - Run preservation property tests from step 2
    - **EXPECTED OUTCOME**: Tests PASS (confirms no regressions in search, download, upload, RBAC, empty-category, empty-state)
    - Confirm all tests still pass after fix (no regressions)
    - _Requirements: 3.1, 3.2, 3.3, 3.4, 3.5, 3.6_

- [x] 4. Checkpoint - Ensure all tests pass
  - Run the backend suite (including `tests/test_document_seed_service.py`) and the frontend suite
  - Ensure all tests pass, ask the user if questions arise
  - _Requirements: 2.1, 2.2, 2.3, 2.4, 3.1, 3.2, 3.3, 3.4, 3.5, 3.6_
