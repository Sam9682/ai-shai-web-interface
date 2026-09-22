# Implementation Plan

This plan follows the exploratory bugfix workflow: explore the bug first (test that
FAILS on the unfixed build), lock in existing behavior (preservation tests that PASS
on the unfixed build), then apply the fix and verify. Specifications are referenced
from `design.md` (Bug Condition, Expected Behavior / Correctness Properties,
Preservation Requirements).

Test tooling in this repo (from `frontend/package.json`): **Vitest** (`npm run test`),
**@testing-library/react**, and **fast-check** for property-based tests. Tailwind is
**v4** with the PostCSS pipeline (`@tailwindcss/postcss`); `@tailwindcss/typography`
is NOT installed and `tailwind.config.js` has `plugins: []`, so `prose` is a no-op.

---

- [ ] 1. Write bug condition exploration test (BEFORE implementing the fix)
  - **Property 1: Bug Condition** - Formatted content renders unstyled on prose display surfaces
  - **CRITICAL**: This test MUST FAIL on the unfixed code - failure confirms the presentational bug exists
  - **DO NOT attempt to fix the test or the code when it fails** at this step
  - **NOTE**: This test encodes the expected behavior - it will validate the fix when it passes after implementation
  - **GOAL**: Surface counterexamples proving the defect is presentational (missing `prose`/typography styling), NOT a data round-trip failure
  - **Scoped PBT Approach**: The bug is deterministic/presentational, so scope the property to concrete formatted-HTML cases: `<h1>Title</h1>`, `<ul><li>item</li></ul>`, `<hr>` rendered on a `prose`-classed display surface
  - Add a test file, e.g. `frontend/src/pages/TopicDetailPage.formatting.test.tsx` (and/or `frontend/src/components/prerequisites/StaticContentPage.formatting.test.tsx`)
  - Render a display surface (`TopicDetailPage` post render and `StaticContentPage` read-only branch) with known formatted HTML via the existing `dangerouslySetInnerHTML` path
  - Assert **content is present** in the DOM (the `<h1>`/`<ul>`/`<li>`/`<hr>` nodes exist) — these assertions PASS even on the unfixed build (confirms HTML is intact, ruling out escaping/stripping/transit loss)
  - Assert **formatting is visibly styled** (heading is sized/bold, list has markers/indent, block spacing present) — these assertions FAIL on the unfixed build (confirms `prose` is a no-op and Preflight stripped defaults)
  - Include a round-trip content-integrity assertion: the HTML string emitted by the editor equals the HTML rendered on display (PASSES on unfixed build, proves content path is not the cause)
  - Run test on UNFIXED code
  - **EXPECTED OUTCOME**: Styling assertions FAIL (this is correct - it proves the block-level `prose` styling is missing); content/round-trip assertions PASS
  - Document counterexamples found (e.g. "`<h1>` present in DOM but computed font-size equals body text; `<ul>` present but `list-style` is none — prose resolves to nothing")
  - Mark task complete when the test is written, run, and the failure is documented
  - _Bug_Condition: isBugCondition(input) = containsFormattingMarkup(input) AND renderedOn(input, aProseDisplaySurface) AND NOT formattingIsVisiblyStyled(input)_
  - _Requirements: 1.1, 1.2, 1.3, 2.1, 2.2, 2.3, 3.3_

- [ ] 2. Write preservation property tests (BEFORE implementing the fix)
  - **Property 2: Preservation** - Data round-trip and unrelated flows unchanged
  - **IMPORTANT**: Follow the observation-first methodology - observe behavior on the UNFIXED build, then encode it
  - **Why PBT**: preservation is a universal property ("for all non-buggy inputs the result is identical"); `fast-check` generates many content strings and confirms the HTML round-trip is byte-identical, catching any accidental transformation the fix might introduce
  - Add a test file, e.g. `frontend/src/pages/forumRoundTrip.preservation.test.tsx` and reuse/extend existing prerequisites tests
  - **Round-trip preservation (PBT)** — with `fast-check`, generate arbitrary content strings (plain text and formatted HTML); assert the value passed through mocked `forumService.createPost`/`updatePost` and rendered on display is byte-identical (no sanitization/transformation) — observe identical on unfixed build
  - **Plain-text preservation** — a plain-text (unformatted) reply saves and displays identically (Req 3.1)
  - **Deletion / locking preservation** — delete-post and locked-topic flows behave as before (Req 3.2)
  - **Prerequisites navigation preservation** — `/prerequisites/basics` and all other existing prerequisites routes still resolve to their pages; `PREREQ_NAV_ITEMS` routes/slugs/archetypes are unchanged (Req 3.4, 3.5)
  - **Label preservation** — all menu labels other than the one being renamed are unchanged in FR and EN (Req 3.6)
  - Run tests on UNFIXED code
  - **EXPECTED OUTCOME**: Tests PASS (this confirms the baseline behavior to preserve)
  - Mark task complete when tests are written, run, and passing on the unfixed build
  - _Preservation: HTML round-trip identical; plain-text posts, deletion/locking, StaticContentPage data path, existing prereq routes/slugs/archetypes and all other labels unchanged (Preservation Requirements in design)_
  - _Requirements: 3.1, 3.2, 3.4, 3.5, 3.6_

- [ ] 3. Apply the changes (PART 1 fix + PART 2 rename + PART 3 new page)

  - [ ] 3.1 PART 1 — Restore display formatting (the actual bug fix)
    - Install `@tailwindcss/typography` in `frontend/` as a devDependency, pinned to a version compatible with the installed `tailwindcss` v4.x
    - Enable the plugin. Because this project runs Tailwind **v4 via `@tailwindcss/postcss`**, prefer the v4 CSS-first registration: add `@plugin "@tailwindcss/typography";` in `frontend/src/index.css` (next to `@import "tailwindcss";`). If the JS-config path is honored by the toolchain instead, register it in `frontend/tailwind.config.js` as `plugins: [require('@tailwindcss/typography')]`. Verify which the pipeline actually applies by rebuilding.
    - Rationale: every display surface already uses `className="prose prose-sm max-w-none"`, so enabling the plugin fixes Forum posts, `StaticContentPage` read-only, and the editor with a single low-risk change and no JSX edits
    - **Fallback (only if the plugin cannot be used with Tailwind v4)**: add scoped CSS rules in `frontend/src/index.css` for headings, lists, `hr`, and block spacing targeting the rendered content containers, mirroring the editor's existing internal `<style>`; apply consistently to every display surface
    - Make NO changes to `RichTextEditor.tsx`, `TopicDetailPage.tsx` render markup, `forumService.ts`, or any backend file (`app/forum/router.py`, `schemas.py`, `models/forum.py`) — the `dangerouslySetInnerHTML` render stays as-is
    - _Bug_Condition: isBugCondition(input) from design (block-level formatting on a prose display surface)_
    - _Expected_Behavior: Property 1 — saved formatted HTML renders with formatting visibly applied, matching the editor, without altering the stored HTML_
    - _Preservation: storage/transport path untouched; only CSS changes (Preservation Requirements in design)_
    - _Requirements: 2.1, 2.2, 2.3, 3.3_

  - [ ] 3.2 PART 2 — Rename the "Basics" menu label to "Context" (label only)
    - In `frontend/src/i18n/translations.ts`, change the value of `prereq.nav.basics` in the **English** block from `Basics` to `Context`
    - Change the value of `prereq.nav.basics` in the **French** block from `Basics` to `Contexte`
    - Leave UNCHANGED: the key `prereq.nav.basics`, the route `/prerequisites/basics`, the slug `basics`, the `PREREQ_NAV_ITEMS` entry (same route/archetype), the Basics page component, and `prerequisitesService` slug `basics`
    - User decision (naming-collision open question): **two distinct entries** — this is the label-only rename of the existing Basics entry; the new client-environment page is added separately in 3.3
    - _Expected_Behavior: Req 2.4 — menu shows "Context" (EN) / "Contexte" (FR)_
    - _Preservation: Req 3.5 — route/slug `basics` still resolves; Req 3.6 — other labels unchanged_
    - _Requirements: 2.4, 3.5, 3.6_

  - [ ] 3.3 PART 3 — Add the new client-environment page (static read-only)
    - User decision (open question 1): build a **static, read-only display page** following the `HowToUse` archetype (a thin page delegating to a presentational component); no persistence, service methods, or backend endpoints
    - User decision (naming-collision open question): this is a **separate** new entry, proposed label EN "Client Environment" / FR "Environnement client", route `/prerequisites/context`
    - In `frontend/src/i18n/translations.ts`: add a nav label key `prereq.nav.context` — EN "Client Environment", FR "Environnement client"; add page title / section / row labels needed by the page
    - In `frontend/src/components/prerequisites/types.ts`: add an entry to `PREREQ_NAV_ITEMS`: `{ labelKey: 'prereq.nav.context', route: '/prerequisites/context', archetype: 'how-to-use' }` (static read-only archetype)
    - Add a presentational component under `frontend/src/components/prerequisites/` (e.g. `ClientEnvironment.tsx`) plus a thin page component (e.g. `frontend/src/pages/ContextPage.tsx`), following the `HowToUse` read-only pattern
    - Render three sections as label/value rows with the specified pre-filled defaults:
      - **Client Environnement** — Nom du client (empty), Type de déploiement (empty), Site 1 Location (empty), Site 2 Location (empty), Installation wish date (empty), Managed / Air-gapped (default **"Managed"**)
      - **Contacts** — *OVH PSMC Architecte*: Nom (**"Samuel LEPETRE"**), Téléphone (empty), Email (**"samuel.lepetre@ovhcloud.com"**); *Client*: Nom (empty), Téléphone (empty), Email (empty)
      - **Use cases** — VCF (**"Within Scope"**), SUSE Harvester (**"Out of Scope"**), Nutanix (**"Out of Scope"**), IA (**"Out of Scope"**), Kubernetes (**"Out of Scope"**)
    - In `frontend/src/App.tsx`: import the new page and register `path="/prerequisites/context"` wrapped in `<ProtectedRoute>` (matching the other prerequisites routes)
    - _Expected_Behavior: Req 2.5 — page displays the three sections / label-value rows with defaults; Req 2.6 — registered per existing prerequisites patterns_
    - _Preservation: Req 3.4 — existing prereq pages unchanged; Req 3.6 — other labels unchanged_
    - _Requirements: 2.5, 2.6, 3.4, 3.6_

  - [ ] 3.4 Add unit tests for PART 2 and PART 3
    - PART 2: assert `prereq.nav.basics` resolves to "Context" (EN) / "Contexte" (FR) and that the route/slug `basics` is unchanged
    - PART 3: assert the new page renders the three sections with the exact label/value rows and pre-filled defaults, is present in `PREREQ_NAV_ITEMS`, and routes at `/prerequisites/context` in `App.tsx`
    - _Requirements: 2.4, 2.5, 2.6_

  - [ ] 3.5 Verify bug condition exploration test now passes
    - **Property 1: Expected Behavior** - Formatted content renders with visible formatting
    - **IMPORTANT**: Re-run the SAME test from task 1 - do NOT write a new test
    - The test from task 1 encodes the expected behavior; when it passes it confirms the formatting is now visibly styled on the display surfaces while the stored HTML is unchanged
    - Run the bug condition exploration test from task 1
    - **EXPECTED OUTCOME**: Test PASSES (confirms the bug is fixed — headings sized/bold, lists marked/indented, `hr`/block spacing present)
    - _Requirements: 2.1, 2.2, 2.3, 3.3_

  - [ ] 3.6 Verify preservation tests still pass
    - **Property 2: Preservation** - Data round-trip and unrelated flows unchanged
    - **IMPORTANT**: Re-run the SAME tests from task 2 - do NOT write new tests
    - Run the preservation property tests from task 2
    - **EXPECTED OUTCOME**: Tests PASS (confirms no regressions — HTML round-trip byte-identical, plain-text/deletion/locking unchanged, prereq routes/slugs/archetypes and other labels unchanged)
    - _Requirements: 3.1, 3.2, 3.4, 3.5, 3.6_

- [ ] 4. Integration verification
  - Full forum flow: compose a formatted reply → save → reload topic → verify formatting is visible on display (Req 2.1, 2.3)
  - Edit an existing formatted post → save → verify formatting persists and renders (Req 2.2)
  - Navigate the prerequisites dropdown: the renamed "Context/Contexte" entry and the new client-environment page ("Client Environment" / "Environnement client") both appear and route correctly, while existing entries are unchanged (Req 2.4, 2.5, 2.6, 3.4)
  - _Requirements: 2.1, 2.2, 2.3, 2.4, 2.5, 2.6, 3.4_

- [ ] 5. Checkpoint - Ensure the build passes and all tests are green
  - Run `npm run build` in `frontend/` (`tsc -b && vite build`) and confirm it succeeds (verifies the typography plugin is wired without breaking the Tailwind v4 pipeline)
  - Run `npm run test` in `frontend/` and confirm all tests pass, including the Property 1 and Property 2 tests
  - Ensure all tests pass; ask the user if questions arise (e.g. the toolchain does not honor the chosen plugin-registration path, requiring the scoped-CSS fallback)
