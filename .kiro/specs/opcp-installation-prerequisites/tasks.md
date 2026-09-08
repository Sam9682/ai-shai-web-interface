# Implementation Plan: OPCP Installation Prerequisites

## Overview

The feature is frontend-only (React + TypeScript + Vite). It is built bottom-up: shared types and configs first, then the persistence hook, then the shared `TrackingForm` component, then the three thin page wrappers, then route registration in `App.tsx`, and finally navigation in `Layout.tsx`. Tests (Vitest + React Testing Library + fast-check) accompany each layer and cover the seven correctness properties from the design. Each task builds on the previous ones and ends with wiring everything into the running application.

## Tasks

- [x] 1. Establish prerequisites module foundation (types, status options, nav config)
  - [x] 1.1 Create shared types and status options in `frontend/src/components/prerequisites/types.ts`
    - Define `Status`, `StatusMeta`, and the `STATUS_OPTIONS` array (Reçu ✅, En attente ⏳, Bloqué ❌, N/A —)
    - Define `ParameterRow`, `SubSection`, `FormConfig`, `RowState`, `RowField`, and `FormState`
    - _Requirements: 5.1, 5.2, 5.3, 8.2_

  - [x] 1.2 Create shared navigation config `PREREQ_NAV_ITEMS` in `frontend/src/components/prerequisites/types.ts`
    - Export the three entries (OPCP Core, CloudStore, LandingZone) each with `label` and `route`
    - Routes: `/prerequisites/opcp-core`, `/prerequisites/cloudstore`, `/prerequisites/landingzone`
    - _Requirements: 1.3, 1.5, 1.6, 1.7, 2.1_

- [x] 2. Build the page configurations
  - [x] 2.1 Create `cloudStoreConfig` with the seven reference sub-sections in `frontend/src/components/prerequisites/configs.ts`
    - Configuration réseau, Serveur (Standalone), Configuration DNS, Configuration NTP, Sécurité & Certificats, Sauvegarde (S3), Actions côté client
    - Every row has a stable slug `id` and a French `label`; "Chemin de sauvegarde" row carries `defaultValue: 'cs-backups'`
    - _Requirements: 4.1, 4.2, 4.3, 4.4, 4.5, 4.6, 4.7, 8.2_

  - [x] 2.2 Create placeholder `opcpCoreConfig` and `landingZoneConfig` in `frontend/src/components/prerequisites/configs.ts`
    - Each with one sub-section containing placeholder rows marked for later refinement
    - _Requirements: 6.1, 6.2, 8.2_

  - [x]* 2.3 Write unit tests for configs
    - Assert CloudStore config exposes all seven sub-sections and the expected row ids
    - Assert row ids are unique across each config and the S3 backup-path default is `cs-backups`
    - _Requirements: 4.1, 4.2, 4.3, 4.4, 4.5, 4.6, 4.7_

- [x] 3. Implement the persistence hook `frontend/src/hooks/usePersistentForm.ts`
  - [x] 3.1 Implement `buildDefaults`, `isValidFormState`, and `usePersistentForm`
    - Lazy initializer reads `localStorage[storageKey]`; null → defaults; parse in try/catch; invalid shape → defaults; merge parsed rows over defaults
    - `updateField(rowId, field, value)` updates state and writes `JSON.stringify(next)` to storage, guarding write failures
    - Defaults set each row `value`/`comments`/`dateReceived` to `''` (or config default) and `status` to `pending`
    - _Requirements: 5.4, 7.1, 7.2, 7.3, 7.4, 7.5_

  - [x]* 3.2 Write property test for persist-then-load round trip
    - **Property 5: Persist-then-load round trip**
    - **Validates: Requirements 7.1, 7.2**

  - [x]* 3.3 Write property test for unparseable-storage fallback
    - **Property 6: Unparseable storage falls back to defaults**
    - **Validates: Requirements 7.4**

  - [x]* 3.4 Write property test for editing a field updating in-memory value
    - **Property 4: Editing a field updates the in-memory value**
    - **Validates: Requirements 5.4**

  - [x]* 3.5 Write property test for per-page storage isolation
    - **Property 7: Per-page storage isolation**
    - **Validates: Requirements 7.5**

- [x] 4. Checkpoint - Ensure all tests pass
  - Ensure all tests pass, ask the user if questions arise.

- [x] 5. Implement the shared `TrackingForm` component `frontend/src/components/prerequisites/TrackingForm.tsx`
  - [x] 5.1 Implement `TrackingForm` rendering title, status legend, sub-sections and four-field rows
    - Props: `title`, `storageKey`, `config`; calls `usePersistentForm(storageKey, config)`
    - Render title in `text-2xl font-bold text-[#000E9C]` inside a `card p-6`; render `StatusLegend` from `STATUS_OPTIONS`
    - Each row renders Value (`input text`), Status (`select` from `STATUS_OPTIONS`), Date Received (`input date`), Comments (`textarea`), each `onChange` calling `updateField`
    - Reuse border / `focus:ring-[#4949FF]` styling from `NewTopicPage.tsx`
    - _Requirements: 5.1, 5.2, 5.3, 6.3, 6.4, 8.1, 8.2, 8.3_

  - [x]* 5.2 Write property test that every parameter row renders all four fields
    - **Property 2: Every parameter row renders all four fields**
    - **Validates: Requirements 5.1, 6.3, 6.4**

  - [x]* 5.3 Write property test that the status field offers exactly the four choices
    - **Property 3: Status field offers exactly the four status choices**
    - **Validates: Requirements 5.2**

  - [x]* 5.4 Write unit test for the status legend and French labels
    - Assert the legend maps Reçu→✅, En attente→⏳, Bloqué→❌, N/A and headings render in French
    - _Requirements: 5.3, 8.2_

- [x] 6. Create the three page wrappers in `frontend/src/pages`
  - [x] 6.1 Create `OPCPCorePage.tsx`, `CloudStorePage.tsx`, and `LandingZonePage.tsx`
    - Each renders `<TrackingForm>` with its own title, distinct storage key (`opcp_prereq_core`, `opcp_prereq_cloudstore`, `opcp_prereq_landingzone`), and config
    - _Requirements: 4.1, 6.1, 6.2, 6.3, 6.4, 7.5_

- [x] 7. Register the protected routes in `frontend/src/App.tsx`
  - [x] 7.1 Add three `ProtectedRoute`-wrapped routes inside the nested `<Routes>`
    - `/prerequisites/opcp-core` → OPCPCorePage, `/prerequisites/cloudstore` → CloudStorePage, `/prerequisites/landingzone` → LandingZonePage
    - _Requirements: 3.1, 3.2, 3.3, 3.4_

  - [x]* 7.2 Write unit tests for route wiring and auth guard
    - Assert each route renders its page when authenticated and redirects to `/login` when not
    - _Requirements: 3.1, 3.2, 3.3, 3.4_

- [x] 8. Add prerequisites navigation to `frontend/src/components/Layout.tsx`
  - [x] 8.1 Add the desktop hover-dropdown mirroring the Événements pattern
    - New `showPrereqMenu` state; `onMouseEnter`/`onMouseLeave` toggling; render `PREREQ_NAV_ITEMS` as `<Link>`s inside the existing `isAuthenticated` guard
    - Apply the `#000E9C` theme styling consistent with existing nav
    - _Requirements: 1.1, 1.2, 1.3, 1.4, 1.5, 1.6, 1.7, 8.1_

  - [x] 8.2 Add the mobile nested section from `PREREQ_NAV_ITEMS`
    - Render a section heading plus nested `pl-6` `<Link>`s inside the `isAuthenticated` mobile block; each closes the menu (`setMobileMenuOpen(false)`) on click
    - _Requirements: 2.1, 2.2, 2.3, 8.1_

  - [x]* 8.3 Write property test that navigation entries map to their configured routes
    - **Property 1: Navigation entries map to their configured routes**
    - **Validates: Requirements 1.5, 1.6, 1.7**

  - [x]* 8.4 Write unit tests for auth-gated visibility of the menu
    - Assert the prerequisites menu appears when authenticated and is hidden otherwise (desktop and mobile)
    - _Requirements: 1.1, 1.2, 2.1, 2.2_

- [x] 9. Final checkpoint - Ensure all tests pass
  - Ensure all tests pass, ask the user if questions arise.

## Notes

- Tasks marked with `*` are optional (tests) and can be skipped for a faster MVP.
- Each task references specific requirements for traceability; property-test tasks reference their design property number.
- If a Vitest / React Testing Library / fast-check setup is not already present, the first test task will add the minimal configuration.
- Checkpoints ensure incremental validation as layers are wired together.

## Task Dependency Graph

```json
{
  "waves": [
    { "id": 0, "tasks": ["1.1", "1.2"] },
    { "id": 1, "tasks": ["2.1", "2.2"] },
    { "id": 2, "tasks": ["2.3", "3.1"] },
    { "id": 3, "tasks": ["3.2", "3.3", "3.4", "3.5", "5.1"] },
    { "id": 4, "tasks": ["5.2", "5.3", "5.4", "6.1"] },
    { "id": 5, "tasks": ["7.1"] },
    { "id": 6, "tasks": ["7.2", "8.1", "8.2"] },
    { "id": 7, "tasks": ["8.3", "8.4"] }
  ]
}
```
