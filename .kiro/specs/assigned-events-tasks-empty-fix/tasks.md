# Implementation Plan

- [x] 1. Write bug condition exploration test
  - **Property 1: Bug Condition** - Member Tasks Route Renders and Fetches
  - **CRITICAL**: This test MUST FAIL on unfixed code - failure confirms the bug exists
  - **DO NOT attempt to fix the test or the code when it fails**
  - **NOTE**: This test encodes the expected behavior - it will validate the fix when it passes after implementation
  - **GOAL**: Surface counterexamples that demonstrate the bug exists (missing `/tasks` route and missing member-facing `TasksPage`)
  - **Scoped PBT Approach**: This bug is deterministic, so scope the property to the concrete failing case: authenticated navigation to the fixed path `/tasks`. Generate arbitrary auth roles (member, admin) and arbitrary mocked task lists to strengthen the check while keeping the path concrete.
  - Create a test file `frontend/src/App.tasksRoute.test.tsx` (or extend the member-route pattern), modeled on the existing `App.tasksRoute.test.tsx` and `EventsRoute.preservation.test.tsx` render harness
  - Render the full `App` (or a faithful route-table replica) at initial route `/tasks` with an authenticated user, mocking `taskService.listTasks()`
  - Assert that a member-facing Tasks heading/list renders AND that `taskService.listTasks()` is called on mount (from Bug Condition `isBugCondition(input)` where `input.path == '/tasks'` AND `input.authenticated == true` AND route does not exist)
  - The test assertions should match Property 1 Expected Behavior: TasksPage mounts under `ProtectedRoute`, `listTasks()` is invoked, and tasks/empty/loading/error states render appropriately
  - Cover the design test cases: (1) member at `/tasks` renders page and calls `listTasks()`; (2) admin at `/tasks` renders the read-only page; (3) mocked tasks display title/dates/status; (4) empty list shows empty-state message not a blank area
  - Run test on UNFIXED code
  - **EXPECTED OUTCOME**: Test FAILS (this is correct - it proves the bug exists: no component mounts, no Tasks heading found, `listTasks()` never called)
  - Document counterexamples found (e.g., "navigating to `/tasks` mounts no component; `taskService.listTasks()` is never called because there is no `<Route path=\"/tasks\">` and no `TasksPage`")
  - Mark task complete when test is written, run, and failure is documented
  - _Requirements: 1.1, 1.2, 1.3_

- [x] 2. Write preservation property tests (BEFORE implementing fix)
  - **Property 2: Preservation** - Non-`/tasks` Navigation Behavior Unchanged
  - **IMPORTANT**: Follow observation-first methodology - run the UNFIXED code, record actual outputs, then assert them
  - Create/extend a test file `frontend/src/TasksRoute.preservation.test.tsx`, modeled on the existing `EventsRoute.preservation.test.tsx`
  - Observe on UNFIXED code and record: `/events` renders `EventsPage` and calls `eventService.listEvents()`; `/admin/tasks` renders `AdminTasksPage` with its management controls; `/admin/events` renders `AdminEventsPage`; unauthenticated navigation to `/tasks` and other protected routes redirects to `/login`; a sample of `/`, `/forum`, `/documents`, `/oracle`, `/prerequisites/*`, `/account/security` maps to the same component; the nav bar shows the "Tasks" → `/tasks` link and admin "Manage tasks" → `/admin/tasks` link
  - Write property-based tests capturing these observed behaviors (from Preservation Requirements in design): generate arbitrary non-`/tasks` route paths from the known route set and assert each maps to the same component; generate arbitrary auth states and assert `ProtectedRoute` redirect behavior for protected paths is unchanged
  - Property-based testing generates many route/auth combinations for stronger guarantees that mappings are unchanged for all non-`/tasks` navigation
  - Run tests on UNFIXED code
  - **EXPECTED OUTCOME**: Tests PASS (this confirms baseline behavior to preserve)
  - Mark task complete when tests are written, run, and passing on unfixed code
  - _Requirements: 3.1, 3.2, 3.3, 3.4, 3.5, 3.6_

- [x] 3. Fix for missing member-facing `/tasks` route (mirror the Events solution)

  - [x] 3.1 Create the member-facing `TasksPage` component
    - Create `frontend/src/pages/TasksPage.tsx`, modeled directly on `frontend/src/pages/EventsPage.tsx`
    - On mount (`useEffect`), call `taskService.listTasks()`, store results in a `tasks` state array, toggle a `loading` flag in a `try/catch/finally` (same shape as `EventsPage.loadEvents()`); on failure, log the error and leave `tasks` empty so the page does not crash
    - Render a centered loading indicator while `loading` is true
    - Render a clear empty-state message via a Tasks empty translation key when `tasks.length === 0` (not a blank area)
    - Otherwise render each task in a read-only card (reuse `EventsPage` `card` styling): title; description when present; start/end dates via `toLocaleString('fr-FR')`; location when present; a status badge colored by status (`scheduled` / `cancelled` / other). Use the `Task` type from `taskService.ts` (`title`, `description?`, `start_date`, `end_date`, `location?`, `status`)
    - Use `useTranslation()` and add parallel `page.tasks.*` keys (`page.tasks.title`, `page.tasks.loading`, `page.tasks.empty`, and start/end/location labels) in `frontend/src/i18n/translations.ts` for BOTH the French and English maps, mirroring the existing `page.events.*` entries (reuse existing admin-task label keys where present, otherwise add `page.tasks.*` equivalents)
    - _Bug_Condition: isBugCondition(input) where input.path == '/tasks' AND input.authenticated == true AND NOT routeExists('/tasks', appRouteTable)_
    - _Expected_Behavior: expectedBehavior(result) — TasksPage mounts, calls listTasks(), renders tasks/empty/loading/error states (from design Property 1)_
    - _Preservation: Preservation Requirements from design — no changes to EventsPage, AdminTasksPage, AdminEventsPage, guards, or other routes_
    - _Requirements: 2.1, 2.2, 2.3, 2.4, 2.5_

  - [x] 3.2 Register the `/tasks` route in `App.tsx`
    - Add `import { TasksPage } from './pages/TasksPage';` alongside the other page imports in `frontend/src/App.tsx`
    - Inside the nested `<Routes>` block that contains `/events`, add a `<Route path="/tasks" element={<ProtectedRoute><TasksPage /></ProtectedRoute>} />` adjacent to the `/events` route for symmetry
    - Do NOT modify or remove any existing route entries
    - _Bug_Condition: isBugCondition(input) — authenticated navigation to unmapped `/tasks`_
    - _Expected_Behavior: expectedBehavior(result) — `/tasks` maps to TasksPage under ProtectedRoute (from design Property 1)_
    - _Preservation: Preservation Requirements from design — `/events` and all other route mappings unchanged_
    - _Requirements: 2.1, 3.5_

  - [x] 3.3 Verify bug condition exploration test now passes
    - **Property 1: Expected Behavior** - Member Tasks Route Renders and Fetches
    - **IMPORTANT**: Re-run the SAME test from task 1 - do NOT write a new test
    - The test from task 1 encodes the expected behavior; when it passes, it confirms the expected behavior is satisfied
    - Run the bug condition exploration test from step 1
    - **EXPECTED OUTCOME**: Test PASSES (confirms the bug is fixed — TasksPage mounts, `listTasks()` is called, tasks/empty/loading/error render correctly)
    - _Requirements: 2.1, 2.2, 2.3, 2.4, 2.5_

  - [x] 3.4 Verify preservation tests still pass
    - **Property 2: Preservation** - Non-`/tasks` Navigation Behavior Unchanged
    - **IMPORTANT**: Re-run the SAME tests from task 2 - do NOT write new tests
    - Run the preservation property tests from step 2
    - **EXPECTED OUTCOME**: Tests PASS (confirms no regressions — `/events`, `/admin/tasks`, `/admin/events`, guards, other routes, and nav links unchanged)
    - Confirm all tests still pass after the fix
    - _Requirements: 3.1, 3.2, 3.3, 3.4, 3.5, 3.6_

- [x] 4. Add unit and integration coverage
  - Unit: `TasksPage` renders a loading indicator while `listTasks()` is pending; renders task cards (title, dates, status; description and location when present) when it resolves with tasks; renders the empty-state message when it resolves with `[]`; does not crash when it rejects (error caught, loading resolves)
  - Integration: full nav flow — authenticated user clicks the "Tasks" nav link, lands on `/tasks`, sees their tasks (extends `App.tasksNav.integration.test.tsx`); context switching `/tasks` → `/events` → `/admin/tasks` mounts each correct page; unauthenticated `/tasks` redirects to `/login`, then reaches the page after login
  - _Requirements: 2.3, 2.4, 2.5, 3.1, 3.4_

- [x] 5. Checkpoint - Ensure all tests pass
  - Run the full frontend test suite (single-run mode, not watch) and ensure all tests pass
  - Confirm Property 1 (Bug Condition / Expected Behavior) passes and Property 2 (Preservation) passes
  - Ask the user if questions arise
