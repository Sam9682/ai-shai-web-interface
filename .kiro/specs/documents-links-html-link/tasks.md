# Implementation Plan

- [x] 1. Write bug condition exploration tests (BEFORE implementing the fix)
  - **Property 1: Bug Condition** - Links Render As An Anchor To The Target URL
  - **CRITICAL**: These tests MUST FAIL on unfixed code - failure confirms the bug exists
  - **DO NOT attempt to fix the test or the code when it fails at this step**
  - **NOTE**: These tests encode the expected behavior - they will validate the fix when they pass after implementation
  - **GOAL**: Surface counterexamples that demonstrate the bug (unconditional Download rendering + no `target_url` on the list response)
  - **Bug Condition (from design)**: `isBugCondition(doc)` returns true when `doc.category === 'links'`
  - **Scoped PBT Approach**: Use `fast-check` (NUM_RUNS = 100) generating arbitrary `links` documents carrying a `target_url`; scope generators to concrete failing shapes (a `links` doc with a valid https URL) for reproducibility
  - Reuse existing suite conventions in `frontend/src/pages/DocumentsPage.test.tsx`: mock `documentService`/`authService`, render inside `LanguageProvider`, and extend the `makeDocument` helper to accept an optional `target_url`
  - Frontend test: render `DocumentsPage` with a mocked `listDocuments` returning a `links` document with `target_url = 'https://example.com'`; assert an `<a href="https://example.com" target="_blank" rel="noopener noreferrer">` is rendered AND no "Download" button is wired to the download flow for that document (Expected Behavior: `isAnchor(rendered) AND rendered.href = target_url AND rendered.target = "_blank" AND rendered.rel = "noopener noreferrer" AND NOT isDownloadButton(rendered)`)
  - Backend test: seed a `links` document whose `.links` file contains a URL; call `GET /api/documents` and assert the response `target_url` equals that URL
  - Edge-case test: provide a `links` document without a usable `target_url` and assert the page falls back to the Download button rather than rendering a broken anchor
  - Run tests on UNFIXED code
  - **EXPECTED OUTCOME**: Tests FAIL (this is correct - it proves the bug exists; a Download button is rendered and `target_url` is absent/None)
  - Document counterexamples found (e.g., "links document `aws-console.links` renders a Download button and its URL is never present in the DOM")
  - Mark task complete when tests are written, run, and failures are documented
  - _Requirements: 1.1, 1.2, 1.3, 2.1, 2.2, 2.3_

- [x] 2. Write preservation property tests (BEFORE implementing the fix)
  - **Property 2: Preservation** - Non-Links Render Exactly As Before
  - **IMPORTANT**: Follow the observation-first methodology
  - **Non-bug condition (from design)**: `isBugCondition(doc)` returns false, i.e. `doc.category !== 'links'`
  - Observe behavior on UNFIXED code for non-`links` inputs and record it before asserting:
    - A non-`links` document renders a "Download" button; clicking it calls `documentService.downloadDocument(doc.id, doc.original_name)`
    - Category section headings follow `CATEGORY_ORDER = ['docs','links','scripts','trainings']` with any remaining present categories rendered after
    - Search/filter matches `original_name` (case-insensitive substring)
    - The list endpoint returns the same set of documents per role (anonymous → public only; member/visitor → public + members; administrator → all)
  - Reuse existing conventions in `frontend/src/pages/DocumentsPage.preservation.test.tsx`: mock `documentService`/`authService`, render inside `LanguageProvider`, use the `makeDocument` helper, and use `fast-check` with NUM_RUNS = 100
  - Write property-based tests capturing the observed behavior across the input domain:
    - Download-button preservation: for arbitrary lists of non-`links` documents, every item renders a Download button and clicking it calls `documentService.downloadDocument(doc.id, doc.original_name)`
    - Grouping/ordering preservation: section headings follow `CATEGORY_ORDER` with unlisted categories after
    - Search/filter preservation: case-insensitive `original_name` substring filtering is unchanged across arbitrary queries
    - Access-control preservation (backend): the list endpoint returns the same visible set per role, with `target_url` populated only for `links` documents the caller may already see
  - Run tests on UNFIXED code
  - **EXPECTED OUTCOME**: Tests PASS (this confirms the baseline behavior to preserve)
  - Mark task complete when tests are written, run, and passing on unfixed code
  - _Requirements: 3.1, 3.2, 3.3, 3.4, 3.5_

- [x] 3. Fix for links documents rendered as Download buttons instead of anchors

  - [x] 3.1 Backend - expose `target_url` on the list response
    - In `app/documents/schemas.py`, add `target_url: Optional[str] = None` to `DocumentResponse` (additive, optional, backward compatible)
    - In `app/documents/router.py`, add a read helper `_read_link_target(filename) -> str | None` that resolves the stored file via `storage_service.get_file_path(filename)` and returns the first non-empty, stripped line of the `.links` file; it returns `None` on missing/unreadable/empty files and MUST NOT raise (a read failure still returns the document, just without `target_url`)
    - In `list_documents`, after the existing access-controlled query and ordering, for each document where `category == DocumentCategory.LINKS` populate `target_url` via `_read_link_target(document.filename)`; leave `target_url` as `None` for all other categories
    - Leave the query, category filter, access-control branches, and `order_by(created_at.desc())` unchanged; populate `target_url` only for rows the caller may already see
    - _Bug_Condition: isBugCondition(doc) where doc.category == 'links'_
    - _Expected_Behavior: expectedBehavior(result) from design - links documents expose the target URL from the `.links` file's first non-empty line_
    - _Preservation: Preservation Requirements from design - every existing DocumentResponse field returned unchanged; access control, filter, and ordering untouched_
    - _Requirements: 2.3, 3.5_

  - [x] 3.2 Frontend - render an anchor for links documents
    - In `frontend/src/services/documentService.ts`, add `target_url?: string | null;` to the `Document` interface; leave `listDocuments`, `downloadDocument`, and `uploadDocument` unchanged
    - In `frontend/src/pages/DocumentsPage.tsx`, within the `docs.map((doc) => ...)` body branch on the bug condition: when `doc.category === 'links'` and `doc.target_url` is present, render an `<a>` anchor with `href={doc.target_url}`, `target="_blank"`, `rel="noopener noreferrer"`, reusing the existing button styling classes and an appropriate link label (reuse an existing translation key or add one)
    - For every other document, and for a `links` document missing a usable `target_url`, render the existing "Download" button wired to `handleDownload` exactly as today (graceful fallback)
    - Leave `filtered`, `grouped`, `orderedCategories`, `handleDownload`, `handleUpload`, and the search input unchanged
    - _Bug_Condition: isBugCondition(doc) where doc.category == 'links'_
    - _Expected_Behavior: expectedBehavior(result) from design - anchor with href = target_url, target="_blank", rel="noopener noreferrer", and NOT a Download button_
    - _Preservation: Preservation Requirements from design - non-links documents keep the Download button and download flow; grouping/ordering/search unchanged_
    - _Requirements: 2.1, 2.2, 2.3, 3.1, 3.2, 3.3, 3.4_

  - [x] 3.3 Verify bug condition exploration tests now pass
    - **Property 1: Expected Behavior** - Links Render As An Anchor To The Target URL
    - **IMPORTANT**: Re-run the SAME tests from task 1 - do NOT write new tests
    - The tests from task 1 encode the expected behavior; when they pass, they confirm links render as anchors and expose the target URL
    - Run the frontend and backend bug condition exploration tests from step 1
    - **EXPECTED OUTCOME**: Tests PASS (confirms the bug is fixed - anchor rendered with correct `href`/`target`/`rel`, no Download button for links, `target_url` present on the list response)
    - _Requirements: 2.1, 2.2, 2.3_

  - [x] 3.4 Verify preservation tests still pass
    - **Property 2: Preservation** - Non-Links Render Exactly As Before
    - **IMPORTANT**: Re-run the SAME tests from task 2 - do NOT write new tests
    - Run the preservation property tests from step 2
    - **EXPECTED OUTCOME**: Tests PASS (confirms no regressions - non-links documents keep the Download button and download flow; grouping, ordering, search, and access control unchanged)
    - Confirm all preservation tests still pass after the fix
    - _Requirements: 3.1, 3.2, 3.3, 3.4, 3.5_

- [x] 4. Checkpoint - Ensure all tests pass
  - Run the full frontend and backend test suites and ensure all tests pass (bug condition, preservation, and existing suites)
  - Confirm no regressions were introduced in the document list, download, grouping, search, or access-control behavior
  - Ask the user if questions arise.
