# Assigned Events/Tasks Empty Fix — Bugfix Design

## Overview

An authenticated user who clicks the main-menu "Tasks" (Tâches) item lands on `/tasks` and sees an empty content area below the top navigation bar. Tasks the user owns or is assigned to are never shown.

The defect is a missing frontend route, not a backend or data problem. The nav bar (`frontend/src/components/Layout.tsx`) links authenticated users to `/tasks`, but `frontend/src/App.tsx` has **no `<Route path="/tasks">`** and there is **no member-facing `TasksPage` component** — only the admin-facing `AdminTasksPage` wired to `/admin/tasks`. Because the layout's inner `<Routes>` has no match for `/tasks`, navigating there mounts nothing, the content area is blank, and `taskService.listTasks()` is never called. The backend `GET /tasks` (`app/tasks/router.py`) already scopes results correctly: non-admins get tasks they own or are assigned to; admins get all scheduled tasks. The frontend `taskService.listTasks()` already calls `GET /tasks` and returns `response.data.tasks`.

This is the exact analog of the previously fixed Events defect (spec `member-events-route-missing`), which wired `/events` to a member-facing `EventsPage`. The fix strategy is to **mirror the Events solution for Tasks**: add a member-facing, read-only `TasksPage` component modeled on `EventsPage`, and register a `/tasks` route under `ProtectedRoute` in `App.tsx`, reusing the existing `taskService.listTasks()`. The fix is additive — it touches only the missing route and the new page. All Events behavior, admin behavior, guards, and existing route mappings must remain unchanged.

## Glossary

- **Bug_Condition (C)**: The condition that triggers the bug — an authenticated user navigates to `/tasks`, which no route matches, so nothing renders and no task data is fetched.
- **Property (P)**: The desired behavior — navigating to `/tasks` mounts a member-facing Tasks page (under `ProtectedRoute`) that calls `taskService.listTasks()` and displays the user's tasks (or a loading/empty/error state).
- **Preservation**: All behavior for inputs that are NOT navigation to `/tasks` must remain unchanged — the Events feature (`/events` → `EventsPage`), admin pages (`/admin/tasks`, `/admin/events`), the auth guard redirect, all other route mappings, and the nav bar links.
- **App route table**: The nested `<Routes>` in `frontend/src/App.tsx` that maps paths to page components inside `Layout`.
- **TasksPage**: The new member-facing, read-only Tasks page component (to be created at `frontend/src/pages/TasksPage.tsx`), modeled on `EventsPage`.
- **AdminTasksPage**: The existing admin-facing task-management page at `frontend/src/pages/AdminTasksPage.tsx`, wired to `/admin/tasks`. Unchanged by this fix.
- **taskService.listTasks()**: The existing frontend service call (`frontend/src/services/taskService.ts`) that issues `GET /tasks` and returns `Task[]`. Reused as-is.
- **ProtectedRoute**: The wrapper (`frontend/src/components/ProtectedRoute.tsx`) that redirects unauthenticated users to `/login`.

## Bug Details

### Bug Condition

The bug manifests when an authenticated user navigates to the `/tasks` path. The App route table has no entry for `/tasks`, so React Router finds no match inside the `Layout`, mounts no component, and `taskService.listTasks()` is never invoked. The observable result is a blank content area.

**Formal Specification:**
```
FUNCTION isBugCondition(input)
  INPUT: input of type Navigation { path: string, authenticated: boolean }
  OUTPUT: boolean

  RETURN input.path == '/tasks'
         AND input.authenticated == true
         AND NOT routeExists('/tasks', appRouteTable)
END FUNCTION
```

### Examples

- A member logs in, clicks "Tasks" in the nav bar → URL becomes `/tasks` → **Expected**: their owned/assigned tasks render in a list; **Actual**: blank content area, no network call to `GET /tasks`.
- An admin logs in, clicks "Tasks" (not "Manage tasks") → URL becomes `/tasks` → **Expected**: a read-only list of their tasks (all scheduled tasks, per backend admin scoping); **Actual**: blank content area.
- A member with no owned or assigned tasks navigates to `/tasks` → **Expected**: a clear empty-state message; **Actual**: blank content area (indistinguishable from an error).
- Edge case — an unauthenticated visitor navigates to `/tasks` → **Expected (preserved)**: redirect to `/login` via `ProtectedRoute`. This is preservation, not part of the bug.

## Expected Behavior

### Preservation Requirements

**Unchanged Behaviors:**
- `/events` continues to render `EventsPage`, fetch via `eventService.listEvents()`, and display the user's assigned and public events (Requirement 3.1).
- `/admin/tasks` continues to render `AdminTasksPage` with its full task-management controls — create, edit, cancel, owner and assignee pickers (Requirement 3.2).
- `/admin/events` continues to render `AdminEventsPage` with its full event-management controls (Requirement 3.3).
- Unauthenticated navigation to `/tasks` or any other protected route continues to redirect to `/login` via `ProtectedRoute` (Requirement 3.4).
- Every existing route other than `/tasks` (`/`, `/forum`, `/forum/*`, `/documents`, `/oracle`, `/events`, `/admin/*`, `/prerequisites/*`, `/account/security`) continues to map to the same page component as before (Requirement 3.5).
- The nav bar continues to show the "Tasks" link to `/tasks`, and for admins the "Manage tasks" dropdown link to `/admin/tasks`, unchanged (Requirement 3.6).

**Scope:**
All inputs that are NOT authenticated navigation to `/tasks` must be completely unaffected by this fix. This includes:
- Navigation to `/events` and every other existing route.
- Admin task/event management flows under `/admin/*`.
- The `ProtectedRoute` redirect behavior for unauthenticated users.
- The nav bar link rendering for members and admins.

**Note:** The expected correct behavior for the bug condition itself is defined in the Correctness Properties section (Property 1).

## Hypothesized Root Cause

The bug description is already well grounded in the code; the root cause is confirmed to be a missing route plus a missing member-facing page. The most likely contributing factors, in order of confidence:

1. **Missing route registration (primary)**: `App.tsx` never adds `<Route path="/tasks" element={<ProtectedRoute><TasksPage /></ProtectedRoute>} />`. The inner `<Routes>` therefore has no match for `/tasks`, so nothing mounts. This exactly parallels the Events defect before its fix.

2. **Missing member-facing page component**: There is no `TasksPage`; the only Tasks component is `AdminTasksPage`, which is management-oriented and wired only to `/admin/tasks`. Even if a route were added, there is no read-only member page to point it at.

3. **Not a backend issue**: `GET /tasks` already scopes tasks to owner/assignee for non-admins and returns all scheduled tasks for admins. No backend change is needed.

4. **Not a service-layer issue**: `taskService.listTasks()` already calls `GET /tasks` and returns `response.data.tasks`. It is simply never invoked because no component mounts. No service change is needed.

## Correctness Properties

Property 1: Bug Condition - Member Tasks Route Renders and Fetches

_For any_ input where the bug condition holds (authenticated navigation to `/tasks` with no matching route — `isBugCondition` returns true), the fixed application SHALL mount a member-facing Tasks page under `ProtectedRoute` that calls `taskService.listTasks()` on mount and renders the resulting tasks read-only (title, description when present, start/end dates, location when present, status), a clear empty-state message when the list is empty, a loading indicator while the request is in flight, and a non-crashing error path when the request fails.

**Validates: Requirements 2.1, 2.2, 2.3, 2.4, 2.5**

Property 2: Preservation - Non-`/tasks` Navigation Behavior Unchanged

_For any_ input where the bug condition does NOT hold (any navigation that is not authenticated navigation to `/tasks` — `isBugCondition` returns false), the fixed application SHALL produce the same result as the original application, preserving the `/events` → `EventsPage` mapping, the `/admin/tasks` → `AdminTasksPage` and `/admin/events` → `AdminEventsPage` mappings with their full management controls, the `ProtectedRoute` redirect to `/login` for unauthenticated users, every other existing route-to-component mapping, and the nav bar links.

**Validates: Requirements 3.1, 3.2, 3.3, 3.4, 3.5, 3.6**

## Fix Implementation

### Changes Required

Assuming the root cause analysis is correct, the fix mirrors the Events solution and is limited to two additive changes.

**File 1 (new)**: `frontend/src/pages/TasksPage.tsx`

**Component**: `TasksPage`

A member-facing, read-only Tasks page modeled directly on `EventsPage`:

1. **Data loading**: On mount (`useEffect`), call `taskService.listTasks()`, store the result in a `tasks` state array, and toggle a `loading` flag in a `try/catch/finally` — identical in shape to `EventsPage.loadEvents()`. On failure, log the error and leave `tasks` empty so the page does not crash (Requirements 2.2, 2.5).

2. **Loading state**: While `loading` is true, render a centered loading indicator using a Tasks loading translation key (Requirement 2.5).

3. **Empty state**: When `tasks.length === 0`, render a clear empty-state message via a Tasks empty translation key rather than a blank area (Requirement 2.4).

4. **Task list**: Otherwise, render each task in a read-only card (reusing the `card` styling from `EventsPage`), showing at minimum: title; description when present; start and end dates formatted with `toLocaleString('fr-FR')`; location when present; and a status badge colored by status (`scheduled` / `cancelled` / other), matching the `EventsPage` badge pattern (Requirement 2.3). The `Task` type from `taskService.ts` already provides `title`, `description?`, `start_date`, `end_date`, `location?`, and `status`.

5. **Internationalization**: Use `useTranslation()` and add parallel Tasks keys (`page.tasks.title`, `page.tasks.loading`, `page.tasks.empty`, and labels for start/end/location) in `frontend/src/i18n/translations.ts` for both the French and English maps, mirroring the existing `page.events.*` entries. Field labels may reuse existing admin-task label keys if present; otherwise add `page.tasks.*` equivalents.

**File 2 (edit)**: `frontend/src/App.tsx`

**Change**: Register the missing member route.

6. Add `import { TasksPage } from './pages/TasksPage';` alongside the other page imports.

7. Inside the nested `<Routes>` (the same block that contains `/events`), add:
   ```tsx
   <Route
     path="/tasks"
     element={
       <ProtectedRoute>
         <TasksPage />
       </ProtectedRoute>
     }
   />
   ```
   placed adjacent to the `/events` route for symmetry. No existing route entries are modified or removed.

## Testing Strategy

### Validation Approach

The testing strategy follows a two-phase approach: first surface counterexamples that demonstrate the bug on the unfixed code, then verify the fix works correctly and preserves existing behavior. The existing `App.tasksRoute.test.tsx` and `EventsRoute.preservation.test.tsx` establish the pattern (they were written for the `/admin/tasks` and `/events` analogs) and should be followed for the new member `/tasks` route.

### Exploratory Bug Condition Checking

**Goal**: Surface counterexamples that demonstrate the bug BEFORE implementing the fix. Confirm or refute the root cause (missing `/tasks` route and missing `TasksPage`). If refuted, re-hypothesize.

**Test Plan**: Render the full `App` (or a faithful route-table replica, as `EventsRoute.preservation.test.tsx` does) at initial route `/tasks` with an authenticated user, mocking `taskService.listTasks()`. Assert that a member Tasks heading/list renders and that `listTasks` is called. Run against the UNFIXED code to observe the failure.

**Test Cases**:
1. **Member navigates to `/tasks`**: authenticated non-admin at `/tasks` should render a Tasks page and call `taskService.listTasks()` (will fail on unfixed code — nothing mounts).
2. **Admin navigates to `/tasks`**: authenticated admin at `/tasks` should render the read-only member Tasks page (will fail on unfixed code).
3. **Tasks displayed**: with `listTasks()` mocked to return sample tasks, the page shows each task's title/dates/status (will fail on unfixed code).
4. **Empty state edge case**: with `listTasks()` mocked to return `[]`, an empty-state message shows instead of a blank area (will fail on unfixed code — blank area, no component).

**Expected Counterexamples**:
- Navigating to `/tasks` mounts no component; no Tasks heading is found and `taskService.listTasks()` is never called.
- Possible causes: no `<Route path="/tasks">` in the route table, no `TasksPage` component, no import wiring the page into `App.tsx`.

### Fix Checking

**Goal**: Verify that for all inputs where the bug condition holds, the fixed application produces the expected behavior.

**Pseudocode:**
```
FOR ALL input WHERE isBugCondition(input) DO
  result := renderApp_fixed(input)   // authenticated navigation to /tasks
  ASSERT expectedBehavior(result)    // TasksPage mounts, listTasks() called,
                                     // tasks/empty/loading/error rendered appropriately
END FOR
```

### Preservation Checking

**Goal**: Verify that for all inputs where the bug condition does NOT hold, the fixed application produces the same result as the original.

**Pseudocode:**
```
FOR ALL input WHERE NOT isBugCondition(input) DO
  ASSERT renderApp_original(input) = renderApp_fixed(input)
END FOR
```

**Testing Approach**: Property-based testing is recommended for preservation checking because:
- It generates many route/auth combinations automatically across the input domain.
- It catches edge cases that hand-written unit tests might miss.
- It gives strong guarantees that route-to-component mappings are unchanged for all non-`/tasks` navigation.

**Test Plan**: Observe the UNFIXED behavior of every non-`/tasks` route (which component mounts, guard redirects, nav links), then write tests asserting that the FIXED code produces identical results. The existing `EventsRoute.preservation.test.tsx` is the template.

**Test Cases**:
1. **Events preservation**: `/events` still renders `EventsPage` and calls `eventService.listEvents()` — unchanged before and after the fix.
2. **Admin tasks preservation**: `/admin/tasks` still renders `AdminTasksPage` with its management controls — unchanged.
3. **Admin events preservation**: `/admin/events` still renders `AdminEventsPage` — unchanged.
4. **Guard preservation**: unauthenticated navigation to `/tasks` and other protected routes still redirects to `/login`.
5. **Route-map preservation**: a sample across `/`, `/forum`, `/documents`, `/oracle`, `/prerequisites/*`, `/account/security` maps to the same component as before.
6. **Nav bar preservation**: the "Tasks" → `/tasks` link and admin "Manage tasks" → `/admin/tasks` link render unchanged.

### Unit Tests

- `TasksPage` renders a loading indicator while `listTasks()` is pending.
- `TasksPage` renders task cards (title, dates, status; description and location when present) when `listTasks()` resolves with tasks.
- `TasksPage` renders the empty-state message when `listTasks()` resolves with `[]`.
- `TasksPage` does not crash when `listTasks()` rejects (error is caught, loading resolves).
- `App` maps `/tasks` to `TasksPage` under `ProtectedRoute`.

### Property-Based Tests

- Generate arbitrary lists of tasks and assert `TasksPage` renders one card per task with the required fields, and the empty-state exactly when the list is empty.
- Generate arbitrary non-`/tasks` route paths from the known route set and assert each maps to the same component in fixed vs. original (preservation).
- Generate arbitrary auth states and assert the `ProtectedRoute` redirect behavior for protected paths is unchanged.

### Integration Tests

- Full nav flow: authenticated user clicks the "Tasks" nav link, lands on `/tasks`, and sees their tasks rendered (extends `App.tasksNav.integration.test.tsx`).
- Context switching: navigate `/tasks` → `/events` → `/admin/tasks` and confirm each mounts its correct page without cross-interference.
- Auth flow: unauthenticated user attempting `/tasks` is redirected to `/login`, then after login reaches the Tasks page.
