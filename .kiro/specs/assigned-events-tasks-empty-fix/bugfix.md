# Bugfix Requirements Document

## Introduction

When a logged-in user clicks the main-menu "Tasks" (Tâches) item, the destination `/tasks` page renders an empty content area below the top navigation bar. Tasks the user owns or is assigned to are never shown.

Grounding in the code confirms the defect is a missing frontend route, not a backend or data problem:

- The navigation bar (`frontend/src/components/Layout.tsx`) renders a "Tasks" link pointing to `/tasks` for authenticated users (and, for admins, a "Manage tasks" dropdown to `/admin/tasks`).
- `frontend/src/App.tsx` wires `/admin/tasks` to `AdminTasksPage`, but has **no `<Route path="/tasks">`**. The only Tasks page component is the admin-facing `AdminTasksPage`; there is no member-facing `TasksPage`.
- Because the layout's inner `<Routes>` has no match for `/tasks`, navigating there mounts nothing, so the content area is blank and `taskService.listTasks()` is never called.
- The backend already scopes tasks correctly for the logged-in user: `GET /tasks` (`app/tasks/router.py`) returns, for non-administrators, tasks where `owner_id == current_user.id` OR the user is in `task_assignments`; administrators see all scheduled tasks. The `taskService.listTasks()` frontend service (`frontend/src/services/taskService.ts`) already calls `GET /tasks` and returns `response.data.tasks`.

This is the exact analog of the previously fixed Events defect (spec `member-events-route-missing`), which wired `/events` to a member-facing `EventsPage`. The Events route and page already exist and function correctly, and the equivalent Tasks route was never added. This fix mirrors the Events solution for Tasks. The Events behavior is out of scope and must be preserved unchanged.

## Bug Analysis

### Current Behavior (Defect)

When an authenticated user navigates to `/tasks`, no route matches, so nothing renders and no task data is fetched.

1.1 WHEN an authenticated user navigates to `/tasks` THEN the system renders an empty content area with no task list and no page heading
1.2 WHEN an authenticated user navigates to `/tasks` THEN the system never calls `taskService.listTasks()`, so tasks the user owns or is assigned to are never requested or displayed
1.3 WHEN an authenticated user navigates to `/tasks` THEN the system renders no member-facing Tasks page component, because none exists and `/tasks` is unmapped in the route table

### Expected Behavior (Correct)

When an authenticated user navigates to `/tasks`, a member-facing Tasks page mounts, fetches the user's tasks, and displays them.

2.1 WHEN an authenticated user navigates to `/tasks` THEN the system SHALL render a member-facing Tasks page (guarded by `ProtectedRoute`) with a page heading
2.2 WHEN the member-facing Tasks page mounts THEN the system SHALL call `taskService.listTasks()` (backed by `GET /tasks`) to fetch the tasks scoped to the logged-in user (tasks they own or are assigned to; all scheduled tasks for administrators)
2.3 WHEN `taskService.listTasks()` returns one or more tasks THEN the system SHALL display each task read-only, showing at least its title, description (when present), start/end dates, location (when present), and status
2.4 WHEN `taskService.listTasks()` returns an empty list THEN the system SHALL display a clear empty-state message rather than a blank content area
2.5 WHILE the tasks request is in flight THEN the system SHALL display a loading indicator, and WHEN the request fails THEN the system SHALL handle the error without crashing the page

### Unchanged Behavior (Regression Prevention)

The fix only adds the missing `/tasks` route and its member-facing page. All existing routes, guards, admin behavior, and the Events feature must continue to work exactly as before.

3.1 WHEN an authenticated user navigates to `/events` THEN the system SHALL CONTINUE TO render `EventsPage`, fetch via `eventService.listEvents()`, and display the user's assigned and public events unchanged
3.2 WHEN an admin navigates to `/admin/tasks` THEN the system SHALL CONTINUE TO render `AdminTasksPage` with its full task-management controls (create, edit, cancel, owner and assignee pickers) unchanged
3.3 WHEN an admin navigates to `/admin/events` THEN the system SHALL CONTINUE TO render `AdminEventsPage` with its full event-management controls unchanged
3.4 WHEN an unauthenticated user navigates to `/tasks` or any other protected route THEN the system SHALL CONTINUE TO redirect to `/login` via `ProtectedRoute`
3.5 WHEN a user navigates to any existing route other than `/tasks` (`/`, `/forum`, `/documents`, `/oracle`, `/events`, `/admin/*`, `/prerequisites/*`, `/account/security`) THEN the system SHALL CONTINUE TO map that path to the same page component as before
3.6 WHEN an authenticated user (member or admin) views the navigation bar THEN the system SHALL CONTINUE TO show the "Tasks" link to `/tasks`, and for admins the "Manage tasks" dropdown link to `/admin/tasks`, unchanged
