# Implementation Plan

- [x] 1. Write bug condition exploration test
  - **Property 1: Bug Condition** - Tasks Navigation Is Not Wired Like Events
  - **CRITICAL**: This test MUST FAIL on unfixed code - failure confirms the bug exists
  - **DO NOT attempt to fix the test or the code when it fails**
  - **NOTE**: This test encodes the expected behavior - it will validate the fix when it passes after implementation
  - **GOAL**: Surface counterexamples that demonstrate the missing Tasks wiring (absent nav item, absent translation key, absent route) per the Bug Condition in design
  - **Scoped PBT Approach**: The bug is deterministic (wiring is present or absent), so scope the property to the concrete failing navigation interactions rather than random generation: desktop nav render, admin dropdown hover, mobile nav render, label resolution, and route navigation
  - Create `frontend/src/components/Layout.tasksBug.test.tsx` (and a router test for the `/admin/tasks` case) using Vitest + `@testing-library/react`
  - Test implementation details from Bug Condition (`isBugCondition`) in design:
    - `RENDER_DESKTOP_NAV`: render `Layout` as an authenticated user, assert a "Tasks" nav item renders alongside "Events" — asserts Expected Behavior Property 1
    - `RENDER_DESKTOP_NAV` (admin): render `Layout` as an authenticated admin, hover/reveal the Tasks dropdown, assert a "Manage tasks" link to `/admin/tasks`
    - `RENDER_MOBILE_NAV`: open the mobile menu as authenticated user, assert a "Tasks" entry; as admin assert a "Manage tasks" sub-entry to `/admin/tasks`
    - `RESOLVE_LABEL`: assert `t('nav.tasks.manage')` returns "Gérer les tâches" (FR) and "Manage tasks" (EN), and `t('nav.tasks')` returns "Tâches" (FR) / "Tasks" (EN)
    - `NAVIGATE` (edge case): render the app router at `/admin/tasks`, assert the Tasks admin page renders under `ProtectedRoute`
  - The test assertions match the Expected Behavior Properties (Property 1) from design
  - Run test on UNFIXED code with `npm run test`
  - **EXPECTED OUTCOME**: Test FAILS (this is correct - it proves the Tasks wiring is absent)
  - Document counterexamples found to confirm root cause (e.g. "no element with label 'Tasks' in desktop nav", "t('nav.tasks.manage') does not resolve", "/admin/tasks renders nothing")
  - Mark task complete when test is written, run, and failure is documented
  - _Requirements: 1.1, 1.2, 1.3, 1.4, 1.5_

- [x] 2. Write preservation property tests (BEFORE implementing fix)
  - **Property 2: Preservation** - Existing Navigation, Routes, Gating, and Language Switching
  - **IMPORTANT**: Follow observation-first methodology — observe behavior on UNFIXED code for non-Tasks interactions first, then encode it
  - Create `frontend/src/components/Layout.preservation.test.tsx` using Vitest + `@testing-library/react` + `fast-check` for property-based coverage
  - Observe on UNFIXED code and record actual outputs for non-bug-condition (`isBugCondition` returns false) interactions:
    - Events menu + "Manage events" → `/admin/events` dropdown render (desktop and mobile)
    - Home, Forum, Documents, AI Oracle, OPCP installations, Users, Configuration render with their routes and admin gating
    - FR↔EN resolution of all existing nav labels including `nav.events` / `nav.events.manage`
    - `/admin/events` and other existing routes render under their protection
    - A non-admin authenticated user sees no admin-only dropdowns
  - Write property-based tests capturing observed behavior patterns from Preservation Requirements in design:
    - Generate random combinations of (authenticated, admin, language FR/EN) and assert every existing nav item, label, and dropdown gating renders exactly as observed
    - Generate random FR/EN toggle sequences and assert all existing labels resolve unchanged
    - Assert non-admin authenticated user sees neither "Manage events" nor "Manage tasks"
  - Property-based testing generates many test cases for stronger preservation guarantees
  - Run tests on UNFIXED code with `npm run test`
  - **EXPECTED OUTCOME**: Tests PASS (this confirms baseline behavior to preserve)
  - Mark task complete when tests are written, run, and passing on unfixed code
  - _Requirements: 3.1, 3.2, 3.3, 3.4, 3.5_

- [x] 3. Fix for missing Tasks navigation wiring

  - [x] 3.1 Add Tasks translation keys
    - In `frontend/src/i18n/translations.ts`, add to the French block adjacent to `nav.events` / `nav.events.manage`: `'nav.tasks': 'Tâches'` and `'nav.tasks.manage': 'Gérer les tâches'`
    - Add to the English block adjacent to the EN `nav.events` / `nav.events.manage`: `'nav.tasks': 'Tasks'` and `'nav.tasks.manage': 'Manage tasks'`
    - _Bug_Condition: isBugCondition(input) where input.kind == RESOLVE_LABEL AND input.key == 'nav.tasks.manage' AND NOT translationKeyExists(input.key, language)_
    - _Expected_Behavior: expectedBehavior(result) — t('nav.tasks') and t('nav.tasks.manage') resolve in FR and EN_
    - _Preservation: existing FR/EN keys including nav.events / nav.events.manage unchanged_
    - _Requirements: 2.4_

  - [x] 3.2 Wire the Tasks menu into Layout (desktop and mobile)
    - In `frontend/src/components/Layout.tsx`, add `const [showTasksMenu, setShowTasksMenu] = useState(false);` alongside the existing `showEventsMenu` state
    - Desktop: directly after the Events relative container, add a matching relative container with `onMouseEnter`/`onMouseLeave` toggling `showTasksMenu`, a `<Link to="/tasks">` rendering `t('nav.tasks')` (with the `▾` caret shown only when `isAdmin`), and an admin-gated dropdown containing `<Link to="/admin/tasks">{t('nav.tasks.manage')}</Link>` — identical structure to the Events dropdown
    - Mobile: directly after the mobile Events `<Link to="/events">` (and its admin `/admin/events` sub-entry), add a mobile `<Link to="/tasks">{t('nav.tasks')}</Link>` and, gated by `isAdmin`, a `<Link to="/admin/tasks">{t('nav.tasks.manage')}</Link>` sub-entry, closing the mobile menu on click like surrounding entries
    - _Bug_Condition: isBugCondition(input) where input.kind in {RENDER_DESKTOP_NAV, RENDER_MOBILE_NAV} AND NOT tasksMenuItemExists()/tasksMobileEntryExists()_
    - _Expected_Behavior: expectedBehavior(result) — Tasks item renders like Events; admin sees "Manage tasks" → /admin/tasks; mobile Tasks + admin sub-entry present_
    - _Preservation: Events menu + all other nav items, routes, and admin gating unchanged (design Preservation Requirements)_
    - _Requirements: 2.1, 2.2, 2.3, 3.1, 3.2, 3.5_

  - [x] 3.3 Register the /admin/tasks route and page
    - In `frontend/src/App.tsx`, add `import { AdminTasksPage } from './pages/AdminTasksPage';` alongside the `AdminEventsPage` import
    - If `AdminTasksPage` does not yet exist, create `frontend/src/pages/AdminTasksPage.tsx` per the `manage-tasks` design so the route resolves to a real page
    - Add `<Route path="/admin/tasks" element={<ProtectedRoute><AdminTasksPage /></ProtectedRoute>} />` directly after the existing `/admin/events` route, using identical `ProtectedRoute` protection
    - _Bug_Condition: isBugCondition(input) where input.kind == NAVIGATE AND input.path == '/admin/tasks' AND NOT routeExists(input.path)_
    - _Expected_Behavior: expectedBehavior(result) — /admin/tasks renders AdminTasksPage under ProtectedRoute_
    - _Preservation: /admin/events and all other routes render under existing protection unchanged_
    - _Requirements: 2.5, 3.4_

  - [x] 3.4 Verify bug condition exploration test now passes
    - **Property 1: Expected Behavior** - Tasks Navigation Is Wired Like Events
    - **IMPORTANT**: Re-run the SAME test from task 1 - do NOT write a new test
    - The test from task 1 encodes the expected behavior; when it passes it confirms Tasks is wired analogously to Events
    - Run the bug condition exploration test from step 1 with `npm run test`
    - **EXPECTED OUTCOME**: Test PASSES (confirms the bug is fixed)
    - _Requirements: 2.1, 2.2, 2.3, 2.4, 2.5_

  - [x] 3.5 Verify preservation tests still pass
    - **Property 2: Preservation** - Existing Navigation, Routes, Gating, and Language Switching
    - **IMPORTANT**: Re-run the SAME tests from task 2 - do NOT write new tests
    - Run the preservation property tests from step 2 with `npm run test`
    - **EXPECTED OUTCOME**: Tests PASS (confirms no regressions to Events, other nav items, routes, gating, or FR/EN switching)
    - Confirm all tests still pass after fix (no regressions)
    - _Requirements: 3.1, 3.2, 3.3, 3.4, 3.5_

- [x] 4. Add integration coverage for the Tasks navigation flow
  - Full flow: authenticated admin opens the app, sees Tasks alongside Events, reveals the Tasks dropdown, clicks "Manage tasks", and lands on `/admin/tasks` rendering the Tasks admin page
  - Context switching: toggle FR/EN and verify both Events and Tasks labels update correctly while all other nav labels remain correct
  - Regression flow: navigate to `/admin/events` and other existing routes after the fix and confirm they render unchanged under their existing protection
  - _Requirements: 2.1, 2.2, 2.5, 3.1, 3.3, 3.4_

- [x] 5. Checkpoint - Ensure all tests pass
  - Run the full suite with `npm run test` and the type/build check with `npm run build`
  - Ensure all exploration, preservation, unit, property-based, and integration tests pass
  - Ask the user if questions arise.
  - _Requirements: 1.1, 1.2, 1.3, 1.4, 1.5, 2.1, 2.2, 2.3, 2.4, 2.5, 3.1, 3.2, 3.3, 3.4, 3.5_
