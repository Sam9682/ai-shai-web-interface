# Implementation Plan

- [x] 1. Write bug condition exploration test
  - **Property 1: Bug Condition** - Default Installation Renders Only Network Checklist
  - **IMPORTANT**: Write this test BEFORE implementing the fix.
  - **CRITICAL**: This test MUST FAIL on unfixed code - failure confirms the bug exists.
  - **DO NOT attempt to fix the test or the code when it fails** - the failure is the expected, correct outcome at this stage.
  - **NOTE**: This test encodes the expected behavior - it will validate the fix when it passes after implementation.
  - **GOAL**: Surface counterexamples that demonstrate the bug exists (only "Network Checklist" renders on the default-installation entry view; Core Control Plane, CloudStore, and VCF are absent).
  - **Scoped PBT Approach**: The bug condition `isBugCondition(X) = X.isDefaultInstallationEntry = true` is a single concrete entry route, so scope the property to that concrete failing case: render the entry route for an authenticated member and quantify the assertion over the set of the four required category headings `{ "Network Checklist", "Core Control Plane", "CloudStore", "VCF" }`.
  - Add the test to `frontend/src/pages/prerequisitesRoutes.test.tsx`, reusing its existing `renderPrereqRoutes` helper, the `prerequisitesService` mock, `INSTALL_ID`, and the authenticated-member setup (`access_token` + `user_role = 'member'`).
  - Render `InstallationPrereqPage` at the default-installation entry route `/prerequisites/installations/${INSTALL_ID}/network-checklist` (the entry slug from `InstallationListPage.FIRST_PREREQ_SLUG`).
  - Assert that ALL FOUR category headings are present: `Network Checklist`, `Core Control Plane`, `CloudStore`, `VCF` (from the Fix Checking Property in design).
  - Run test on UNFIXED code.
  - **EXPECTED OUTCOME**: Test FAILS (this is correct - it proves the bug exists). "Network Checklist" is found, but "Core Control Plane", "CloudStore", and "VCF" are absent on the entry view.
  - Document counterexamples found (e.g., "entry route renders only the 'Network Checklist' heading; 'Core Control Plane', 'CloudStore', and 'VCF' headings are not in the document") to confirm the root cause (single-slug entry + one-config render).
  - Mark task complete when the test is written, run, and the failure is documented.
  - _Requirements: 1.1, 1.2, 1.3, 2.1, 2.2, 2.3_

- [x] 2. Write preservation property tests (BEFORE implementing fix)
  - **Property 2: Preservation** - Non-Entry Views Behave Identically
  - **IMPORTANT**: Follow observation-first methodology - observe behavior on the UNFIXED code first, then write property-based tests asserting that observed behavior.
  - The existing property-based suite in `frontend/src/pages/prerequisitesRoutes.test.tsx` already quantifies over the full set of prerequisites routes for both authenticated and unauthenticated access - it is the anchor for auth-guard preservation (Req 3.3) and per-route rendering. Verify it PASSES on unfixed code and keep it as the preservation baseline.
  - Observe on UNFIXED code and capture as preservation assertions:
    - Static slugs `basics` and `network-flux` each render a single `StaticContentPage` with its title unchanged (Req 3.1).
    - An unknown/unrecognized slug renders the not-found message "Page de prérequis introuvable." (Req 3.2).
    - Unauthenticated access to any prerequisites route redirects to `/login` (Req 3.3) - covered by the existing property suite.
    - Editing a client answer on a single category calls `prerequisitesService.saveClientAnswer(installationId, slug, rowId, value)` with the same `(installationId, slug)` keys (Req 3.4).
    - Each rendered category shows its per-row mandatory/optional markers, example values, comments hints, and role-based read-only vs editable answer inputs (Req 3.5).
  - Write/extend property-based tests capturing these observed patterns:
    - Quantify over slugs and assert the not-found message renders for any slug outside the recognized set (unknown-slug preservation).
    - Generate arbitrary `(rowId, value)` for a chosen category on the aggregate view and assert `saveClientAnswer` is invoked with that category's own slug and the given `rowId`/`value` (persistence-key preservation).
  - Run tests on UNFIXED code.
  - **EXPECTED OUTCOME**: Tests PASS (this confirms the baseline behavior to preserve).
  - Mark task complete when tests are written, run, and passing on unfixed code.
  - _Requirements: 3.1, 3.2, 3.3, 3.4, 3.5_

- [x] 3. Fix for default installation showing only the Network Checklist

  - [x] 3.1 Implement the aggregate default-installation view
    - In `frontend/src/pages/InstallationPrereqPage.tsx`, define an ordered checklist set as the single source of truth: `[{ slug: 'network-checklist', title: 'Network Checklist', config: networkChecklistConfig }, { slug: 'core-control-plane', title: 'Core Control Plane', config: coreControlPlaneConfig }, { slug: 'cloudstore', title: 'CloudStore', config: cloudStoreQuestionConfig }, { slug: 'vcf', title: 'VCF', config: vcfConfig }]`, reusing the existing exports from `configs.ts`.
    - When the resolved slug is the default-installation entry slug (`FIRST_PREREQ_SLUG` = `network-checklist`), render one `QuestionAnswerForm` per category in order, each stacked as its own section. Reuse `QuestionAnswerForm` as-is (one instance per category).
    - Pass each `QuestionAnswerForm` its own canonical `slug` so answer persistence stays keyed on `(installationId, slug)` exactly as today (Network Checklist under `network-checklist`, etc.), keeping `prerequisitesService` calls unchanged per category.
    - Preserve the static path (`basics`, `network-flux` → single `StaticContentPage`), the not-found path (missing/unrecognized slug → "Page de prérequis introuvable."), and single-category direct access (e.g. `/…/vcf` renders just that one category).
    - In `frontend/src/components/prerequisites/InstallationListPage.tsx`, keep `installationRoute(id)` pointing at the entry slug (`FIRST_PREREQ_SLUG` = `network-checklist`) so the list-page link and the page's aggregate branch agree in one place; no change to `App.tsx` route shape, `QuestionAnswerForm.tsx`, `configs.ts`, `prerequisitesService.ts`, or `StaticContentPage.tsx`.
    - _Bug_Condition: isBugCondition(X) where X.isDefaultInstallationEntry = true (entry route resolves to a single checklist category)_
    - _Expected_Behavior: renderedCategories(result) = { "Network Checklist", "Core Control Plane", "CloudStore", "VCF" }, each with its own section content_
    - _Preservation: static content pages, not-found message, auth-guard redirect, and per-slug answer persistence remain unchanged (Preservation Requirements from design)_
    - _Requirements: 2.1, 2.2, 2.3_

  - [x] 3.2 Verify bug condition exploration test now passes
    - **Property 1: Expected Behavior** - Default Installation Renders All Four Checklists
    - **IMPORTANT**: Re-run the SAME test from task 1 - do NOT write a new test. The test from task 1 encodes the expected behavior; when it passes, it confirms the expected behavior is satisfied.
    - Run the bug condition exploration test from task 1 against the fixed code.
    - **EXPECTED OUTCOME**: Test PASSES - all four category headings (Network Checklist, Core Control Plane, CloudStore, VCF) render on the default-installation entry view (confirms the bug is fixed).
    - _Requirements: 2.1, 2.2, 2.3_

  - [x] 3.3 Verify preservation tests still pass
    - **Property 2: Preservation** - Non-Entry Views Behave Identically
    - **IMPORTANT**: Re-run the SAME tests from task 2 - do NOT write new tests.
    - Run the preservation property tests from task 2, including the existing route/guard suite in `frontend/src/pages/prerequisitesRoutes.test.tsx`.
    - **EXPECTED OUTCOME**: Tests PASS (confirms no regressions) - static content pages, not-found message, auth-guard redirect, and per-slug answer persistence are unchanged.
    - Confirm all tests still pass after the fix (no regressions).
    - _Requirements: 3.1, 3.2, 3.3, 3.4, 3.5_

- [x] 4. Checkpoint - Ensure all tests pass
  - Run the full frontend test suite (single run, e.g. `vitest --run`) and ensure all tests pass, including the exploration test (now passing), the preservation tests, and the existing `prerequisitesRoutes.test.tsx` property suite.
  - Ask the user if questions arise.
