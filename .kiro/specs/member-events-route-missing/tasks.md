# Implementation Plan

- [x] 1. Write bug condition exploration test
  - **Property 1: Bug Condition** - Member Events Route Renders and Fetches
  - **CRITICAL**: This test MUST FAIL on unfixed code - failure confirms the bug exists
  - **DO NOT attempt to fix the test or the code when it fails**
  - **NOTE**: This test encodes the expected behavior - it will validate the fix when it passes after implementation
  - **GOAL**: Surface counterexamples that demonstrate the bug (navigating to `/events` renders nothing and never calls `listEvents()`)
  - **Scoped PBT Approach**: The bug is deterministic (a single missing route), so scope the property to the concrete failing case: an authenticated non-admin member with initial route `/events`. Optionally parametrize over the `listEvents()` return value (empty array, one event, several events) since the expected view must render for all of them.
  - Create `frontend/src/pages/EventsPage.bugcondition.test.tsx`
  - Render `<App>` (or the routing tree) with an authenticated non-admin session and an initial entry at `/events` (use `MemoryRouter`/`initialEntries` matching the pattern in `App.tasksRoute.test.tsx` / `DocumentsRoute.test.tsx`)
  - Spy/mock `eventService.listEvents` (mock it to resolve with a fixture list of events, following the mocking style in `AdminEventsPage.integration.test.tsx`)
  - Assert a member events view/heading is rendered for `/events` (bug condition: `isBugCondition(input)` where `input.path == '/events'` AND `input.isAuthenticated == true` AND no route exists)
  - Assert `eventService.listEvents()` was called when `/events` mounts
  - Assert the returned event titles/details are rendered read-only (and an empty-state message renders when `listEvents` returns `[]`)
  - Run test on UNFIXED code
  - **EXPECTED OUTCOME**: Test FAILS (this is correct - it proves no component mounts, no `listEvents()` call, blank content area)
  - Document counterexamples found: "Navigating to `/events` renders no page component and no events; `listEvents()` is never called"
  - Mark task complete when test is written, run, and failure is documented
  - _Requirements: 1.1, 1.2, 2.1, 2.2_

- [x] 2. Write preservation property tests (BEFORE implementing fix)
  - **Property 2: Preservation** - Existing Routes and Admin Behavior Unchanged
  - **IMPORTANT**: Follow observation-first methodology — run the UNFIXED code, record actual outputs, then encode them as tests
  - Create `frontend/src/pages/EventsRoute.preservation.test.tsx` (follow patterns in `AdminEventsPage.preservation.test.ts`, `HomePage.viewUrl.preservation.property.test.ts`, `prerequisitesRoutes.test.tsx`)
  - Observe on UNFIXED code and record baseline behavior for non-`/events` navigation (cases where `isBugCondition` returns false):
    - `/admin/events` renders `AdminEventsPage` with create/edit/cancel controls (Requirement 3.1)
    - Unauthenticated access to `/events` (and other protected routes) redirects to `/login` via `ProtectedRoute` (Requirement 3.2)
    - Each existing path renders its same page component (Requirement 3.3)
    - The admin "Events" dropdown shows the "Manage events" link to `/admin/events` (Requirement 3.4)
  - **Property-based test (preservation over existing routes)**: generate navigation over the set of pre-existing route paths (`/`, `/forum`, `/forum/new`, `/forum/topics/:topicId`, `/documents`, `/oracle`, `/admin/users`, `/admin/tasks`, `/admin/configuration`, `/prerequisites/*`, `/account/security`) and assert the mapped page component is unchanged versus the original routing table
  - **Property-based test (auth enforcement)**: generate authenticated vs unauthenticated states for `/events` and assert auth enforcement matches other protected routes (unauthenticated → redirect to `/login`)
  - Run tests on UNFIXED code
  - **EXPECTED OUTCOME**: Tests PASS (this confirms the baseline behavior to preserve). Note: the `/events` route path is deliberately EXCLUDED from the existing-routes property since it is the path being fixed; the unauthenticated `/events` redirect assertion holds on unfixed code because `ProtectedRoute` wrapping is added by the fix — scope the unauthenticated case to routes already protected, and add `/events` to it after the fix.
  - Mark task complete when tests are written, run, and passing on unfixed code
  - _Requirements: 3.1, 3.2, 3.3, 3.4_

- [x] 3. Fix for member `/events` route missing (blank content area, no data fetch)

  - [x] 3.1 Create the read-only `EventsPage` component
    - Create `frontend/src/pages/EventsPage.tsx` as a new functional component
    - Import `eventService` and the `Event` type from `../services/eventService`, and `useTranslation` from `../hooks/useLanguage`
    - Add `useState<Event[]>` for events and a `loading` boolean
    - Add `useEffect(() => { loadEvents(); }, [])` that calls `eventService.listEvents()`, stores the result, and clears loading in a `finally` block (mirror `AdminEventsPage.loadEvents`)
    - Render events read-only reusing the `AdminEventsPage` card layout: title, description, start/end dates via `toLocaleString('fr-FR')`, location, `participant_count`/`max_participants`, and the status badge with the same `scheduled`/`cancelled`/default color logic
    - Render a `<h1>` heading, a loading state, and an empty state ("no events") consistent with existing styling
    - Do NOT render create/edit/cancel controls, create/edit modals, member loading, `adminService`, or `MultiUserPicker`
    - _Bug_Condition: isBugCondition(input) where input.path == '/events' AND input.isAuthenticated == true AND NOT routeExistsFor('/events')_
    - _Expected_Behavior: EventsPage mounts, calls eventService.listEvents(), renders returned events read-only (empty state when none), no management controls_
    - _Preservation: Preservation Requirements from design (no changes to AdminEventsPage or eventService)_
    - _Requirements: 2.1, 2.2_

  - [x] 3.2 Add member events translation keys
    - Edit `frontend/src/i18n/translations.ts`
    - Add `page.events.*` keys for both `fr` and `en` (e.g. `page.events.title`, `page.events.loading`, `page.events.empty`), following the existing `page.adminEvents.*` convention
    - Reuse existing `page.adminEvents.start`/`end`/`location`/`participants` labels where identical, or add `page.events.*` equivalents to keep the member view self-contained
    - _Requirements: 2.1_

  - [x] 3.3 Wire the protected `/events` route in `App.tsx`
    - Edit `frontend/src/App.tsx`
    - Import `EventsPage` from `./pages/EventsPage`
    - Add the following route inside the layout's inner `<Routes>`, alongside other member routes:
      ```tsx
      <Route
        path="/events"
        element={
          <ProtectedRoute>
            <EventsPage />
          </ProtectedRoute>
        }
      />
      ```
    - Do NOT modify or reorder the existing `/admin/events` route or any other route
    - _Bug_Condition: isBugCondition(input) — routeExistsFor('/events') becomes true after this change_
    - _Expected_Behavior: navigation to '/events' mounts a protected EventsPage_
    - _Preservation: all other `<Route>` entries and the `/admin/events` route unchanged_
    - _Requirements: 2.1, 2.2, 3.2_

  - [x] 3.4 Add unit tests for EventsPage and the route mapping
    - Create `frontend/src/pages/EventsPage.test.tsx`
    - `EventsPage` calls `eventService.listEvents()` on mount and renders returned events read-only
    - `EventsPage` renders a loading state, then the list; renders an empty state when no events are returned
    - `EventsPage` renders NO create, edit, or cancel controls (read-only assertion)
    - Assert `App` maps `/events` to a protected `EventsPage` route
    - Add a property-based test: generate random event arrays and assert `EventsPage` renders one read-only card per event with no management controls
    - _Requirements: 2.1, 2.2_

  - [x] 3.5 Verify bug condition exploration test now passes
    - **Property 1: Expected Behavior** - Member Events Route Renders and Fetches
    - **IMPORTANT**: Re-run the SAME test from task 1 - do NOT write a new test
    - The test from task 1 encodes the expected behavior; when it passes it confirms EventsPage mounts, `listEvents()` is called, and events render read-only
    - Run the bug condition exploration test from step 1
    - **EXPECTED OUTCOME**: Test PASSES (confirms the bug is fixed)
    - _Requirements: 2.1, 2.2_

  - [x] 3.6 Verify preservation tests still pass
    - **Property 2: Preservation** - Existing Routes and Admin Behavior Unchanged
    - **IMPORTANT**: Re-run the SAME tests from task 2 - do NOT write new tests
    - After the fix, extend the auth-enforcement assertion to include `/events` (now protected) and re-run
    - Run the preservation property tests from step 2
    - **EXPECTED OUTCOME**: Tests PASS (confirms no regressions to `/admin/events`, auth enforcement, other routes, or the admin dropdown)
    - _Requirements: 3.1, 3.2, 3.3, 3.4_

  - [x] 3.7 Add integration tests for the member events flow
    - Create `frontend/src/pages/EventsPage.integration.test.tsx` (follow `AdminEventsPage.integration.test.tsx`)
    - Full flow: authenticated member clicks the "Events" nav link, lands on `/events`, and sees their assigned and public events rendered
    - Context switching: an admin visits `/events` (read-only view) and `/admin/events` (management view); assert both behave correctly and independently
    - Visual/state feedback: the loading indicator appears during fetch and the list (or empty state) appears after `listEvents()` resolves
    - _Requirements: 2.1, 2.2, 3.1_

- [x] 4. Checkpoint - Ensure all tests pass
  - Run the full frontend test suite (single run, e.g. `vitest --run`) and confirm the exploration test (task 1), preservation tests (task 2), unit tests (3.4), and integration tests (3.7) all pass
  - Ensure no existing tests regressed
  - Ensure all tests pass, ask the user if questions arise
