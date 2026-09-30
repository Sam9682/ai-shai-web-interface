# Member Events Route Missing Bugfix Design

## Overview

The application's navigation bar renders an "Events" link to `/events` for every authenticated user, but `frontend/src/App.tsx` defines no `<Route path="/events">`. Only `/admin/events` exists, rendering the admin-only `AdminEventsPage`. When a non-admin member follows the "Events" link, the layout's inner `<Routes>` matches nothing, no component mounts, `eventService.listEvents()` is never called, and the member sees a blank content area.

The backend is confirmed correct: `GET /api/events` returns public events plus events assigned to the requesting non-admin user. The defect is purely frontend routing/UI.

The fix has two parts, both scoped to `/events`:
1. Add a new member-facing page component (`EventsPage`) that calls `eventService.listEvents()` on mount and renders the returned events read-only (no create, edit, or cancel controls).
2. Wire a protected `<Route path="/events" element={<ProtectedRoute><EventsPage /></ProtectedRoute>}>` inside the layout's inner `<Routes>` in `App.tsx`.

The events list rendering (cards showing title, description, dates, location, participants, status) is reused from `AdminEventsPage` in read-only form. All existing routes and the admin `/admin/events` behavior are preserved unchanged.

## Glossary

- **Bug_Condition (C)**: The condition that triggers the bug — an authenticated non-admin member navigating to the `/events` path, for which no route is defined, producing a blank content area and no data fetch.
- **Property (P)**: The desired behavior — navigating to `/events` mounts a member-facing events view that calls `eventService.listEvents()` and renders the returned assigned and public events read-only.
- **Preservation**: All existing routing and behavior that must remain unchanged — `/admin/events` admin management, `ProtectedRoute` auth enforcement, every other route (`/`, `/forum`, `/documents`, `/oracle`, `/admin/*`, etc.), and the admin "Manage events" dropdown link.
- **EventsPage**: The new member-facing component in `frontend/src/pages/EventsPage.tsx` that fetches and renders events read-only.
- **AdminEventsPage**: The existing admin component in `frontend/src/pages/AdminEventsPage.tsx` that fetches events and provides create/edit/cancel management (unchanged by this fix).
- **listEvents()**: `eventService.listEvents()` in `frontend/src/services/eventService.ts`, which issues `GET /events` and returns `response.data.events`. The backend scopes results to public + assigned events for the requesting user.
- **Inner Routes**: The `<Routes>` block nested inside `<Layout>` in `App.tsx` where all authenticated page routes are declared.

## Bug Details

### Bug Condition

The bug manifests when an authenticated member navigates to the `/events` path. The layout's inner `<Routes>` contains no matching `<Route>`, so React Router mounts no page component for that path, the content area renders empty, and `eventService.listEvents()` is never invoked.

**Formal Specification:**
```
FUNCTION isBugCondition(input)
  INPUT: input of type Navigation { path: string, isAuthenticated: boolean }
  OUTPUT: boolean

  RETURN input.path == '/events'
         AND input.isAuthenticated == true
         AND NOT routeExistsFor('/events')   // no <Route path="/events"> in inner Routes
END FUNCTION
```

### Examples

- An authenticated non-admin member clicks the "Events" nav link (`/events`) → expected: their assigned and public events are listed; actual: blank content area, no API call.
- An authenticated non-admin member types `/events` in the address bar → expected: events view renders; actual: no component mounts, empty main region.
- An authenticated admin clicks the "Events" nav link (`/events`, not the "Manage events" sub-link) → expected: read-only events view renders; actual: blank content area.
- Edge case: an authenticated member with no assigned events and no public events navigates to `/events` → expected: the events view renders with an empty state (not blank, not an error).

## Expected Behavior

### Preservation Requirements

**Unchanged Behaviors:**
- `/admin/events` continues to render `AdminEventsPage` with full create, edit, and cancel management capabilities (Requirement 3.1).
- `ProtectedRoute` continues to enforce authentication on protected paths, redirecting unauthenticated users to `/login` (Requirement 3.2).
- Every other existing route (`/`, `/forum`, `/forum/new`, `/forum/topics/:topicId`, `/admin/users`, `/admin/tasks`, `/admin/configuration`, `/oracle`, `/prerequisites/*`, `/documents`, `/account/security`) continues to render the same component and behavior as before (Requirement 3.3).
- The admin "Events" navigation dropdown continues to show the "Manage events" link to `/admin/events` (Requirement 3.4).

**Scope:**
All inputs that do NOT involve navigating to `/events` should be completely unaffected by this fix. This includes:
- Navigation to `/admin/events` and all other existing routes.
- Authentication enforcement on any protected route.
- The navigation bar's rendering of links and the admin dropdown.

**Note:** The expected correct behavior for the `/events` path itself is defined in the Correctness Properties section (Property 1).

## Hypothesized Root Cause

Based on the bug analysis, the cause is well understood and structural rather than logical:

1. **Missing Route Declaration**: `App.tsx`'s inner `<Routes>` has no `<Route path="/events">`. React Router therefore matches nothing for `/events` and renders no page component. This is the primary and confirmed cause.

2. **No Member-Facing Component**: The only code that calls `eventService.listEvents()` and renders the results lives inside `AdminEventsPage`, which is coupled to admin management (create/edit/cancel modals, member picker). There is no standalone read-only component suitable for members, so even adding a route would have nothing appropriate to mount.

3. **Nav/Route Mismatch**: `Layout.tsx` unconditionally renders the `/events` link for all authenticated users, creating an expectation the routing layer never fulfilled. The link is correct; the route and component are what is missing.

Root causes 1 and 2 are the actionable defects. Root cause 3 is context confirming the link should resolve to a real view.

## Correctness Properties

Property 1: Bug Condition - Member Events Route Renders and Fetches

_For any_ input where the bug condition holds (an authenticated member navigates to `/events`), the fixed application SHALL mount the member-facing `EventsPage`, call `eventService.listEvents()`, and render the returned assigned and public events in a read-only view (with an empty state when the list is empty), instead of a blank content area.

**Validates: Requirements 2.1, 2.2**

Property 2: Preservation - Existing Routes and Admin Behavior Unchanged

_For any_ input where the bug condition does NOT hold (navigation to any path other than `/events`, or an unauthenticated request to `/events`), the fixed application SHALL produce the same result as the original application, preserving `/admin/events` admin management, `ProtectedRoute` authentication enforcement, all other route mappings, and the admin "Manage events" dropdown link.

**Validates: Requirements 3.1, 3.2, 3.3, 3.4**

## Fix Implementation

### Changes Required

Assuming our root cause analysis is correct:

**File**: `frontend/src/pages/EventsPage.tsx` (new)

**Component**: `EventsPage`

**Specific Changes**:
1. **Create the member-facing component**: A new functional component that mirrors `AdminEventsPage`'s data-loading pattern.
   - `useState<Event[]>` for events and a `loading` boolean.
   - `useEffect(() => { loadEvents(); }, [])` that calls `eventService.listEvents()`, stores the result, and clears loading in a `finally` block, matching `AdminEventsPage.loadEvents`.
   - Import `eventService` and the `Event` type from `../services/eventService`, and `useTranslation` from `../hooks/useLanguage`.

2. **Render events read-only**: Reuse the card layout from `AdminEventsPage` (title, description, start/end dates via `toLocaleString('fr-FR')`, location, `participant_count`/`max_participants`, and the status badge with the same `scheduled`/`cancelled`/default color logic).
   - Do NOT render the edit or cancel buttons.
   - Do NOT render the create button, create modal, or edit modal.
   - Do NOT load members or import `adminService`/`MultiUserPicker`.

3. **Add a page heading and states**: A `<h1>` title, a loading state, and an empty state ("no events") consistent with the app's existing styling.

**File**: `frontend/src/i18n/translations.ts`

**Specific Changes**:
4. **Add member events translation keys** for both `fr` and `en` (e.g. `page.events.title`, `page.events.loading`, `page.events.empty`), following the existing `page.adminEvents.*` convention. Reuse existing `page.adminEvents.start`/`end`/`location`/`participants` labels where identical, or add `page.events.*` equivalents to keep the member view self-contained.

**File**: `frontend/src/App.tsx`

**Function**: `App`

**Specific Changes**:
5. **Import** `EventsPage` from `./pages/EventsPage`.
6. **Add the protected route** inside the layout's inner `<Routes>`:
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
   Place it alongside the other member routes; do not modify or reorder the existing `/admin/events` route or any other route.

## Testing Strategy

### Validation Approach

The testing strategy follows a two-phase approach: first, surface counterexamples that demonstrate the bug on the unfixed code (navigating to `/events` renders nothing and issues no `listEvents()` call), then verify the fix renders the member events view and fetches data while preserving every other route and the admin behavior.

### Exploratory Bug Condition Checking

**Goal**: Surface counterexamples that demonstrate the bug BEFORE implementing the fix. Confirm or refute the root cause analysis (missing route + missing member component). If refuted, re-hypothesize.

**Test Plan**: Render `<App>` (or the routing tree) with an authenticated member session, navigate to `/events` using an initial route, and assert that a member events view is present and that `eventService.listEvents()` was called. Run against the UNFIXED code to observe failures.

**Test Cases**:
1. **Member Navigates to /events**: Authenticated non-admin lands on `/events`; assert an events view/heading is rendered (will fail on unfixed code — blank area).
2. **listEvents Is Called**: Spy on `eventService.listEvents`; assert it is invoked when `/events` mounts (will fail on unfixed code — never called).
3. **Assigned/Public Events Displayed**: With `listEvents` mocked to return events, assert the event titles/details appear (will fail on unfixed code — nothing renders).
4. **Empty State (edge case)**: With `listEvents` returning `[]`, assert an empty-state message renders rather than a blank area (may fail on unfixed code).

**Expected Counterexamples**:
- Navigating to `/events` renders no page component and no events.
- Possible causes: missing `<Route path="/events">`, no member-facing component calling `listEvents()`, nav link resolving to an unhandled path.

### Fix Checking

**Goal**: Verify that for all inputs where the bug condition holds, the fixed application produces the expected behavior.

**Pseudocode:**
```
FOR ALL input WHERE isBugCondition(input) DO
  result := renderApp(input)   // authenticated navigation to '/events'
  ASSERT expectedBehavior(result)
  // expectedBehavior: EventsPage mounted
  //   AND eventService.listEvents() was called
  //   AND returned events rendered read-only (empty state if none)
  //   AND no create/edit/cancel controls present
END FOR
```

### Preservation Checking

**Goal**: Verify that for all inputs where the bug condition does NOT hold, the fixed application produces the same result as the original application.

**Pseudocode:**
```
FOR ALL input WHERE NOT isBugCondition(input) DO
  ASSERT renderApp_original(input) = renderApp_fixed(input)
  // e.g. navigation to '/admin/events', '/', '/forum', '/documents', '/oracle',
  //      '/admin/*', and unauthenticated access to '/events'
END FOR
```

**Testing Approach**: Property-based testing is recommended for preservation checking because:
- It generates many test cases automatically across the route domain.
- It catches edge cases that manual unit tests might miss.
- It provides strong guarantees that behavior is unchanged for all non-`/events` navigations.

**Test Plan**: Observe behavior on the UNFIXED code for existing routes and admin management, then write tests (including a property-based test over the set of existing route paths) asserting the same component renders after the fix.

**Test Cases**:
1. **Admin Events Preservation**: Navigating to `/admin/events` renders `AdminEventsPage` with create/edit/cancel controls, before and after the fix (Requirement 3.1).
2. **Auth Enforcement Preservation**: Unauthenticated access to `/events` (and other protected routes) redirects to `/login` via `ProtectedRoute`, before and after the fix (Requirement 3.2).
3. **Other Routes Preservation**: A property-based test over existing paths (`/`, `/forum`, `/documents`, `/oracle`, `/admin/users`, `/admin/tasks`, `/admin/configuration`, `/prerequisites/*`, `/account/security`) asserts the same page component renders before and after the fix (Requirement 3.3).
4. **Admin Dropdown Preservation**: The admin "Events" dropdown continues to show the "Manage events" link to `/admin/events` (Requirement 3.4).

### Unit Tests

- `EventsPage` calls `eventService.listEvents()` on mount and renders returned events read-only.
- `EventsPage` renders a loading state, then the list; renders an empty state when no events are returned.
- `EventsPage` renders NO create, edit, or cancel controls (read-only assertion).
- `App` maps `/events` to a protected `EventsPage` route.

### Property-Based Tests

- Generate random event arrays and assert `EventsPage` renders one read-only card per event with no management controls.
- Generate navigation over the set of pre-existing route paths and assert the mapped component is unchanged versus the original routing table (preservation).
- Generate authenticated vs unauthenticated states for `/events` and assert auth enforcement matches other protected routes.

### Integration Tests

- Full flow: authenticated member clicks the "Events" nav link, lands on `/events`, and sees their assigned and public events rendered.
- Context switching: an admin visits `/events` (read-only view) and `/admin/events` (management view) and both behave correctly and independently.
- Visual/state feedback: the loading indicator appears during fetch and the list (or empty state) appears after `listEvents()` resolves.
