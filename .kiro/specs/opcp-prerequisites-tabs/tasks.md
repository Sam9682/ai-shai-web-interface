# Implementation Plan: OPCP Prerequisites Tabs

## Overview

This plan restructures the "OPCP installation prerequisites" menu into seven data-driven pages under `/prerequisites/{slug}` across three archetypes (how-to-use, static content, question/answer), and migrates persistence from `localStorage` to a shared server-side API via a new `prerequisitesService`.

Work is sequenced bottom-up: shared types and config first, then the frontend service, then the three archetype components, then the thin page wrappers, then router wiring, and finally the test updates and property-based tests. Each step builds on the previous one and ends by wiring the new pieces into `App.tsx` so there is no orphaned code.

The language is TypeScript / React (Vite + React Router + Vitest + fast-check + axios), matching the existing `frontend/` codebase.

> **Backend scope note:** The `Prerequisites_API` endpoints (`GET/PUT /api/prerequisites/{slug}/content`, `GET /api/prerequisites/{slug}/answers`, `PUT /api/prerequisites/{slug}/answers/{rowId}`) are defined in the design as a **contract the frontend targets**. The backend framework was not inspected and its implementation is **out of scope for this frontend feature** — it requires separate backend work. All frontend tasks below mock `prerequisitesService`/`api`, so they are fully testable without a live backend. Requirements 6.1 and 6.3 (server-side persistence, cross-session sharing) are satisfied by that backend work and are not covered by frontend tasks here.

## Tasks

- [x] 1. Extend shared types in `types.ts`
  - [x] 1.1 Add `PrereqNavItem` interface and rewrite `PREREQ_NAV_ITEMS`
    - Define `PrereqNavItem { label; route; archetype: 'how-to-use' | 'static' | 'qa' }`
    - Rewrite `PREREQ_NAV_ITEMS` to the seven entries (How to use, Basics, Network Checklist, Core Control Plane, CloudStore, VCF, Network Flux) as a `readonly ... as const` tuple
    - Exclude the LandingZone entry; map "OPCP Core" to "Core Control Plane" at `/prerequisites/core-control-plane`
    - _Requirements: 1.1, 1.2, 1.3, 1.4_

  - [x] 1.2 Add `PREREQ_MARKERS` shared constant
    - Define `PREREQ_MARKERS` with `mandatory` (`🔴`/`Obligatoire`) and `optional` (`⚪`/`Optionnel`) as a shared `as const`
    - _Requirements: 3.2, 5.4_

  - [x] 1.3 Add question-archetype data model types
    - Add `QuestionRow`, `QuestionSection`, and `QuestionFormConfig` interfaces
    - Add `StaticContent` and `ClientAnswers` model interfaces
    - Keep the legacy `ParameterRow`/`SubSection`/`FormConfig` types intact and unchanged so `TrackingForm` and `configs.test.ts` stay valid
    - _Requirements: 7.4, 8.3, 8.4_

  - [x]* 1.4 Write property test for navigation route well-formedness
    - **Property 2: Every navigation route is well-formed**
    - **Validates: Requirements 1.2**
    - fast-check over `PREREQ_NAV_ITEMS`: non-empty `label`, `route` matches `/^\/prerequisites\/[a-z0-9-]+$/`; `numRuns >= 100`; tag `Feature: opcp-prerequisites-tabs, Property 2`

- [x] 2. Add question configs in `configs.ts`
  - [x] 2.1 Add four `QuestionFormConfig` values
    - Add `networkChecklistConfig`, `coreControlPlaneConfig`, `cloudStoreConfig` (question variant), `vcfConfig`
    - Scaffold each with placeholder/example rows carrying stable, page-unique `id`s plus `questionPrimary`, `questionSecondary`, `mandatory`, `exampleValue`, `commentsHint`
    - Keep the legacy `cloudStoreConfig: FormConfig` export path intact until `TrackingForm` is retired (do not break existing config consumers/tests)
    - _Requirements: 7.1, 7.2, 7.3, 7.4_

  - [x]* 2.2 Write property test for row-id uniqueness across configs
    - **Property 12: Row ids are unique within each page**
    - **Validates: Requirements 7.3**
    - fast-check / `it.each` over each new `QuestionFormConfig` (and legacy `FormConfig`): set of row ids equals total row count; `numRuns >= 100`; tag `Feature: opcp-prerequisites-tabs, Property 12`

  - [x]* 2.3 Write unit tests for config scaffolding
    - Assert each of the four question configs exists, has at least one section and one row, and every row has non-empty `id` and `questionPrimary`
    - _Requirements: 7.1, 7.2_

- [x] 3. Create the frontend `prerequisitesService`
  - [x] 3.1 Implement `prerequisitesService.ts`
    - Create `frontend/src/services/prerequisitesService.ts` following `api.ts`/`adminService.ts` patterns (thin axios wrappers returning `response.data`)
    - Implement `loadStaticContent(slug)` → GET `/prerequisites/{slug}/content`
    - Implement `saveStaticContent(slug, content)` → PUT `/prerequisites/{slug}/content` `{ content }`
    - Implement `loadClientAnswers(slug)` → GET `/prerequisites/{slug}/answers`
    - Implement `saveClientAnswer(slug, rowId, answer)` → PUT `/prerequisites/{slug}/answers/{rowId}` `{ answer }`
    - Export `StaticContentResponse` and `ClientAnswersResponse` types
    - _Requirements: 4.4, 5.7, 6.2, 6.4_

  - [x]* 3.2 Write contract tests for `prerequisitesService`
    - Mock `api` and verify each method issues the correct HTTP verb, path, and body
    - Confirm no `localStorage` reads/writes occur (Req 6.4)
    - _Requirements: 4.4, 5.7, 6.2, 6.4_

- [x] 4. Build Archetype 1 — `HowToUse` component (read-only)
  - [x] 4.1 Implement `HowToUse.tsx`
    - Create `frontend/src/components/prerequisites/HowToUse.tsx` as a presentational, no-props, no-persistence component
    - Render the Legend from `PREREQ_MARKERS` (Mandatory/Optional), completion tips/example guidance, and a visually distinct secrets warning (no secrets/PSK/credentials; use a secure channel)
    - Render read-only for every role (no editable controls)
    - _Requirements: 3.1, 3.2, 3.3, 3.4_

  - [x]* 4.2 Write unit tests for `HowToUse`
    - Assert legend (both markers), tips, and secrets warning are present; assert no editable controls render for any role
    - _Requirements: 3.1, 3.2, 3.3, 3.4_

- [x] 5. Build Archetype 2 — `StaticContentPage` component
  - [x] 5.1 Implement `StaticContentPage.tsx`
    - Create `frontend/src/components/prerequisites/StaticContentPage.tsx` with props `{ slug; title }`
    - On mount, load via `prerequisitesService.loadStaticContent(slug)` and render for all authenticated users; on load failure show a non-blocking load-error message
    - Compute `canEdit = authService.isAdmin()`; when true render `RichTextEditor` + Save (calls `saveStaticContent(slug, content)`), otherwise render content read-only with no edit controls
    - On save failure set error state and render a visible error banner, preserving the typed value
    - _Requirements: 4.1, 4.2, 4.3, 4.4, 4.5, 6.2, 6.5_

  - [x]* 5.2 Write property test for admin-only edit controls
    - **Property 5: Static-content edit controls appear exactly for admins**
    - **Validates: Requirements 4.2, 4.3, 4.5**
    - fast-check over authenticated users with varying `isAdmin()`; `numRuns >= 100`; tag `Feature: opcp-prerequisites-tabs, Property 5`

  - [x]* 5.3 Write property tests for save-forwarding and load/error
    - **Property 8: Saving static content forwards it to the service** — **Validates: Requirements 4.4**
    - **Property 10: Opening a page loads persisted data through the service** — **Validates: Requirements 6.2, 6.4**
    - **Property 11: A failed save shows an error indication** — **Validates: Requirements 6.5**
    - Mock `prerequisitesService`/`authService`; `numRuns >= 100`; tag each with `Feature: opcp-prerequisites-tabs, Property {8|10|11}`

- [x] 6. Build Archetype 3 — `QuestionAnswerForm` component
  - [x] 6.1 Implement `QuestionAnswerForm.tsx`
    - Create `frontend/src/components/prerequisites/QuestionAnswerForm.tsx` with props `{ slug; title; config: QuestionFormConfig }` (new sibling to `TrackingForm`, which stays untouched)
    - On mount, load via `prerequisitesService.loadClientAnswers(slug)`
    - Render each section, then each row: two read-only question columns, Mandatory/Optional marker (from `PREREQ_MARKERS`), example value, Comments/Details hint, and one editable Client answer control
    - `canAnswer = authService.isAuthenticated() && !authService.isAdmin()`; Client answer editable only when `canAnswer`, otherwise read-only
    - On save call `saveClientAnswer(slug, rowId, value)`; on failure record a per-row error indication and preserve the typed value
    - _Requirements: 5.1, 5.2, 5.3, 5.4, 5.5, 5.6, 5.7, 6.2, 6.5_

  - [x]* 6.2 Write property test for read-only questions + editable member answer
    - **Property 6: Question pages show read-only questions and an editable member answer**
    - **Validates: Requirements 5.1, 5.2, 5.3**
    - fast-check over generated `QuestionFormConfig`s and member/non-member users; `numRuns >= 100`; tag `Feature: opcp-prerequisites-tabs, Property 6`

  - [x]* 6.3 Write property test for required row annotations
    - **Property 7: Every question row displays its required annotations**
    - **Validates: Requirements 5.4, 5.5, 5.6**
    - Assert correct marker per `row.mandatory`, example value, and hint render for each row; `numRuns >= 100`; tag `Feature: opcp-prerequisites-tabs, Property 7`

  - [x]* 6.4 Write property tests for answer save-forwarding and error
    - **Property 9: Saving a client answer forwards it to the service** — **Validates: Requirements 5.7**
    - **Property 11: A failed save shows an error indication** — **Validates: Requirements 6.5**
    - Mock `prerequisitesService`/`authService`; `numRuns >= 100`; tag each with `Feature: opcp-prerequisites-tabs, Property {9|11}`

- [x] 7. Checkpoint - components and service
  - Ensure all tests pass, ask the user if questions arise.

- [x] 8. Create page wrappers in `frontend/src/pages/`
  - [x] 8.1 Create static/how-to-use page wrappers
    - Add `HowToUsePage.tsx` (renders `<HowToUse />`)
    - Add `BasicsPage.tsx` (`<StaticContentPage slug="basics" title="Basics" />`)
    - Add `NetworkFluxPage.tsx` (`<StaticContentPage slug="network-flux" title="Network Flux" />`)
    - _Requirements: 3.1, 4.1_

  - [x] 8.2 Create question/answer page wrappers
    - Add `NetworkChecklistPage.tsx`, `CoreControlPlanePage.tsx`, `VcfPage.tsx` and retarget `CloudStorePage.tsx` to render `<QuestionAnswerForm slug title config />` with the matching config from step 2
    - _Requirements: 5.1, 5.2_

- [x] 9. Wire routes in `App.tsx`
  - [x] 9.1 Register the seven guarded routes and remove obsolete ones
    - Add seven `<Route path="/prerequisites/{slug}" element={<ProtectedRoute>...</ProtectedRoute>} />` entries matching the page wrappers
    - Remove `OPCPCorePage` and `LandingZonePage` imports and their routes
    - _Requirements: 2.1, 2.2, 2.3, 2.4, 1.3, 1.4_

  - [x]* 9.2 Write property tests for route guarding
    - **Property 3: Authenticated access renders the matching prerequisites page** — **Validates: Requirements 2.1, 2.4**
    - **Property 4: Unauthenticated access redirects to login** — **Validates: Requirements 2.2, 2.3**
    - Mock `prerequisitesService` to isolate route/guard behavior; `numRuns >= 100`; tag each with `Feature: opcp-prerequisites-tabs, Property {3|4}`

- [x] 10. Update existing test suites to stay green
  - [x] 10.1 Update `Layout.prereq.test.tsx`
    - Update any assertions referencing old `OPCP Core`/`LandingZone` labels/routes to the new seven-entry set; keep the config-driven iteration
    - _Requirements: 8.1, 8.5_

  - [x]* 10.2 Add/keep navigation-mapping property test
    - **Property 1: Navigation entries map to their configured routes (desktop and mobile)**
    - **Validates: Requirements 1.5, 1.6**
    - Assert each rendered desktop and mobile link targets its entry `route`; `numRuns >= 100`; tag `Feature: opcp-prerequisites-tabs, Property 1`

  - [x] 10.3 Update `prerequisitesRoutes.test.tsx`
    - Import the new page components; replace `opcp-core`/`landingzone` slugs with the seven new slugs; keep auth-guard assertions; mock `prerequisitesService` where pages call it
    - _Requirements: 8.2, 8.5_

  - [x] 10.4 Update `configs.test.ts`
    - Preserve existing `cloudStoreConfig` structural assertions and the row-id uniqueness test; update the uniqueness `it.each` list to reference the new question configs instead of `opcpCoreConfig`/`landingZoneConfig`
    - Leave `TrackingForm.test.tsx` untouched
    - _Requirements: 8.3, 8.4, 8.5_

- [x] 11. Final checkpoint - full suite green
  - Ensure all tests pass, ask the user if questions arise.

## Notes

- Tasks marked with `*` are optional test sub-tasks and can be skipped for a faster MVP.
- Each task references specific requirement clauses for traceability.
- Property tests use fast-check with `numRuns >= 100` and the tag `Feature: opcp-prerequisites-tabs, Property {n}: {text}` per the design's Testing Strategy.
- `TrackingForm` and `usePersistentForm` are intentionally left untouched so `TrackingForm.test.tsx` stays green (Req 8.4); their removal is out of scope.
- Backend `Prerequisites_API` implementation (Req 6.1, 6.3) is out of scope for this frontend feature and needs separate backend work; frontend tasks mock the service against the documented contract.

## Task Dependency Graph

```json
{
  "waves": [
    { "id": 0, "tasks": ["1.1", "1.2", "1.3"] },
    { "id": 1, "tasks": ["1.4", "2.1", "3.1"] },
    { "id": 2, "tasks": ["2.2", "2.3", "3.2", "4.1", "5.1", "6.1"] },
    { "id": 3, "tasks": ["4.2", "5.2", "5.3", "6.2", "6.3", "6.4", "8.1", "8.2"] },
    { "id": 4, "tasks": ["9.1", "10.1", "10.3", "10.4"] },
    { "id": 5, "tasks": ["9.2", "10.2"] }
  ]
}
```
