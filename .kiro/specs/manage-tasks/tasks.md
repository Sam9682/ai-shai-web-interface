# Implementation Plan — Manage Tasks

## Overview

Manage Tasks mirrors the existing Events feature. The plan builds the backend (model, migration, schemas, router with private-by-default visibility), then the frontend (service, single-user Owner picker, page, route, navigation, i18n), and finishes with verification. Each task references the requirements it satisfies.

## Task Dependency Graph

```json
{
  "waves": [
    { "wave": 1, "tasks": ["1.1"], "dependsOn": [] },
    { "wave": 2, "tasks": ["1.2"], "dependsOn": ["1.1"] },
    { "wave": 3, "tasks": ["2.1"], "dependsOn": ["1.1", "1.2"] },
    { "wave": 4, "tasks": ["2.2"], "dependsOn": ["2.1"] },
    { "wave": 5, "tasks": ["2.3", "3.1", "3.2"], "dependsOn": ["2.2"] },
    { "wave": 6, "tasks": ["2.4", "3.3"], "dependsOn": ["2.3", "3.2"] },
    { "wave": 7, "tasks": ["4.1"], "dependsOn": ["3.1", "3.2"] },
    { "wave": 8, "tasks": ["4.2", "4.3", "4.4"], "dependsOn": ["4.1"] },
    { "wave": 9, "tasks": ["5.1"], "dependsOn": ["2.4", "3.3", "4.4"] }
  ]
}
```

## Tasks

- [x] 1. Backend data model and migration
- [x] 1.1 Create the Task and TaskAssignment SQLAlchemy models
  - Add `app/models/task.py` with `TaskStatus`, `Task` (owner_id NOT NULL, no max_participants, no registrations), and `TaskAssignment` (unique task_id+user_id), mirroring `app/models/event.py`.
  - Register the new models in `app/models/__init__.py`.
  - _Requirements: 6.1, 6.2, 6.3, 3.4_

- [x] 1.2 Write the Alembic migration for tasks and task_assignments
  - Create a migration under `migrations/versions/` that creates both tables with FKs, the unique constraint, and indexes; implement a reversible `downgrade`.
  - Set `down_revision` to the current head (verify with `alembic heads`).
  - _Requirements: 6.1, 6.4_

- [ ] 2. Backend API
- [x] 2.1 Add task request and response schemas
  - Create `app/tasks/schemas.py` mirroring `app/events/schemas.py`: create/update/response/list/cancellation. `owner_id` optional on create (defaults to creator); no `max_participants`.
  - _Requirements: 2.1, 2.2, 3.1, 3.4_

- [x] 2.2 Implement the tasks router with owner and assignee validation
  - Create `app/tasks/router.py` (`prefix="/api/tasks"`) with create/list/update/cancel endpoints and `_validate_owner`, `_validate_assigned_users`, `_build_task_response` helpers adapted from the events router. Default owner to `current_user.id` when omitted.
  - Wire the router into the app, mirroring how the events router is included.
  - _Requirements: 2.3, 2.4, 2.5, 2.6, 4.1, 4.2, 4.3, 4.4_

- [x] 2.3 Implement private-by-default visibility in the list endpoint
  - Admins get all tasks; non-admins get tasks where they are owner OR an assignee; an empty assignee list does NOT make a task public; unauthenticated requests are rejected.
  - _Requirements: 5.1, 5.2, 5.3, 5.4_

- [-] 2.4 Write backend tests for tasks
  - Cover model creation, owner-defaults-to-creator, invalid owner/assignee rejection without state mutation, list visibility for non-admin versus admin, and cancel behavior. Run the suite.
  - _Requirements: 2.3, 2.4, 2.5, 4.4, 5.2, 5.3, 5.4_

- [ ] 3. Frontend service and pickers
- [-] 3.1 Add the task API service
  - Create `frontend/src/services/taskService.ts` cloning `eventService.ts` with `Task`, `CreateTaskRequest`, `UpdateTaskRequest`, and list/create/update/delete (cancel) calls to `/tasks`.
  - _Requirements: 2.6, 4.2, 4.3_

- [-] 3.2 Build the single-user Owner picker
  - Create `frontend/src/components/SingleUserPicker.tsx` from `MultiUserPicker.tsx`: single value, selecting replaces, chip removal clears, searchable by name/email via `filterUsers`.
  - _Requirements: 3.1, 3.2, 3.3_

- [~] 3.3 Write frontend tests for SingleUserPicker
  - Verify single-selection semantics (replace on new pick, clear on remove) and search filtering.
  - _Requirements: 3.1, 3.2, 3.3_

- [ ] 4. Frontend page and navigation
- [~] 4.1 Create the Manage Tasks page
  - Add `frontend/src/pages/AdminTasksPage.tsx` cloned from `AdminEventsPage.tsx`: drop max_participants and participant count, add `owner_id` with `SingleUserPicker`, keep `MultiUserPicker` for assignees, reuse `extractApiError` and existing styling.
  - _Requirements: 2.1, 2.2, 4.1, 7.2_

- [~] 4.2 Add the route
  - Register `/admin/tasks` -> `AdminTasksPage` inside `ProtectedRoute` in `frontend/src/App.tsx`.
  - _Requirements: 1.3, 5.1_

- [~] 4.3 Update navigation to Events/Tasks with a Manage Tasks item
  - In `frontend/src/components/Layout.tsx`, relabel the primary menu to "Events/Tasks" and add a "Manage Tasks" dropdown item (desktop + mobile) linking to `/admin/tasks`.
  - _Requirements: 1.1, 1.2, 1.3_

- [~] 4.4 Add i18n strings
  - In `frontend/src/i18n/translations.ts`, update `nav.events`, add `nav.tasks.manage`, and add a `page.adminTasks.*` block (FR + EN) including the owner field and picker placeholders.
  - _Requirements: 1.4, 7.1_

- [ ] 5. Verification
- [~] 5.1 Run backend and frontend builds/tests and fix failures
  - Run the backend test suite and the frontend build plus relevant tests; resolve any errors introduced by the new code.
  - _Requirements: 2.6, 3.1, 5.2, 5.3_

## Notes

- Reuse the Events feature as the template throughout; the three deltas are: no participant limit, mandatory single owner, and private-by-default visibility.
- The task list route is available to any logged-in user; visibility is enforced server-side, not by admin-gating the route.
- Verify the Alembic head before setting `down_revision` in task 1.2.
