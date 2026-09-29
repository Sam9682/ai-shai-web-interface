# Design — Manage Tasks

## Overview

Manage Tasks mirrors the existing Events feature end to end. The Events code is the template: `app/models/event.py`, `app/events/router.py`, `frontend/src/pages/AdminEventsPage.tsx`, `frontend/src/services/eventService.ts`, `frontend/src/components/MultiUserPicker.tsx`, `frontend/src/components/Layout.tsx`, and `frontend/src/i18n/translations.ts`.

Three deltas define Tasks:
1. No `max_participants` and no registration/participant-count concept.
2. A mandatory single `owner_id` FK, in addition to the multi-user assignee join.
3. Private-by-default visibility: visible to owner + assignees + admins only (opposite of the event rule where empty assignment => public).

## Architecture

```
Layout.tsx (Events/Tasks dropdown)
      |
      v  route /admin/tasks (ProtectedRoute)
AdminTasksPage.tsx  --->  taskService.ts  --->  GET/POST/PUT /api/tasks
                                                      |
                                                      v
                                          app/tasks/router.py (FastAPI)
                                                      |
                                                      v
                              Task / TaskAssignment models (SQLAlchemy)
                                                      |
                                                      v
                                   Alembic migration: tasks + task_assignments
```

## Components and Interfaces

### Backend model (`app/models/task.py`)

- `TaskStatus` enum reused shape: `scheduled` / `cancelled` / `completed` (kept to match event semantics; "scheduled" acts as the active/open state).
- `Task` table `tasks`:
  - `id` (uuid pk), `title` (str, required), `description` (text, nullable)
  - `start_date`, `end_date` (datetime tz)
  - `location` (str, nullable)
  - `owner_id` (uuid FK users.id, **NOT nullable**)
  - `created_by` (uuid FK users.id, not nullable)
  - `status` (TaskStatus, default scheduled)
  - `created_at`, `updated_at`
  - Indexes: `idx_tasks_start_date`, `idx_tasks_owner`
  - Relationships: `owner`, `creator`, `assignments`
  - NOTE: no `max_participants`, no registrations.
- `TaskAssignment` table `task_assignments`: `id`, `task_id` (FK cascade), `user_id` (FK cascade), `assigned_at`; unique(`task_id`,`user_id`); indexes on task and user. Mirrors `EventAssignment`.

Register the new models in `app/models/__init__.py`.

### Backend router (`app/tasks/router.py`)

`APIRouter(prefix="/api/tasks", tags=["tasks"])`. Mirror the helper structure from `app/events/router.py` but simplified (no ical export, no registration endpoints):

- Reuse validation helpers: `_validate_owner` (owner must exist and is required) and `_validate_assigned_users` (list; may be empty).
- `_build_task_response` returns owner_id + assigned_user_ids (no participant_count).
- Endpoints:
  - `POST ""` create. If `owner_id` omitted, default to `current_user.id`.
  - `GET ""` list — **visibility filter** applied here.
  - `PUT "/{task_id}"` update.
  - `PUT "/{task_id}/cancel"` set status = cancelled.
- Auth: all endpoints depend on `get_current_user`. Creation/edit/cancel authorization: allow admin, owner, or creator (kept consistent and simple; can be tightened later).

**Visibility query (the key delta):**
```python
if current_user.role == UserRole.ADMIN:
    tasks = db.query(Task).all()
else:
    assigned_task_ids = select TaskAssignment.task_id where user_id == current_user.id
    tasks = db.query(Task).filter(
        or_(Task.owner_id == current_user.id,
            Task.id.in_(assigned_task_ids))
    ).all()
```
Empty assignee list does NOT widen visibility (contrast with events).

### Backend schemas (`app/tasks/schemas.py`)

Mirror `app/events/schemas.py`: `TaskCreateRequest` (owner_id optional -> defaults to creator; assigned_user_ids optional list; no max_participants), `TaskUpdateRequest`, `TaskResponse` (owner_id, assigned_user_ids, status, timestamps), `TaskListResponse`, `TaskCreateResponse`, cancellation response.

### Alembic migration (`migrations/versions/<date>_create_tasks.py`)

- `upgrade`: create `tasks` and `task_assignments` with the columns, FKs, unique constraint, and indexes above.
- `downgrade`: drop both tables (and the enum type if created as native).
- Set `down_revision` to the current head (verify with `alembic heads`).

### Frontend service (`frontend/src/services/taskService.ts`)

Clone `eventService.ts`:
```ts
export interface Task {
  id: string; title: string; description?: string;
  start_date: string; end_date: string; location?: string;
  owner_id: string; assigned_user_ids?: string[];
  status: string; created_at: string; updated_at: string;
}
export interface CreateTaskRequest { title; description?; start_date; end_date; location?; owner_id?; assigned_user_ids?: string[]; }
export interface UpdateTaskRequest { ...same optional fields... }
export const taskService = { listTasks, createTask, updateTask, deleteTask }; // -> /tasks, /tasks/{id}, /tasks/{id}/cancel
```

### Frontend single-user picker (`frontend/src/components/SingleUserPicker.tsx`)

New component adapted from `MultiUserPicker.tsx`. Same search UX, but:
- `value: string | null`, `onChange: (userId: string | null) => void`.
- Selecting a user replaces the current selection (single chip).
- Removing the chip clears the value.
Reuses `filterUsers` from `UserPicker`.

### Frontend page (`frontend/src/pages/AdminTasksPage.tsx`)

Clone `AdminEventsPage.tsx`:
- Form state drops `max_participants`, adds `owner_id: string`.
- Uses `SingleUserPicker` for Owner and `MultiUserPicker` for Assignees.
- List cards drop the Participants line; optionally show Owner name.
- Reuse the `extractApiError` helper pattern.

### Navigation (`frontend/src/components/Layout.tsx`)

- Rename primary label to use `t('nav.events')` value updated to "Events/Tasks" / "Événements/Tâches" (or introduce `nav.eventsTasks` key — chosen approach: update the existing `nav.events` string value to keep wiring minimal).
- Add a second dropdown item linking to `/admin/tasks` using new key `nav.tasks.manage`. Add the matching mobile menu entry.
- Keep the admin gating consistent with the events submenu; the task LIST route itself is available to any logged-in user (visibility enforced server-side).

### Routing (`frontend/src/App.tsx`)

Add `<Route path="/admin/tasks" element={<ProtectedRoute><AdminTasksPage /></ProtectedRoute>} />`.

### i18n (`frontend/src/i18n/translations.ts`)

Add FR + EN keys: `nav.events` updated string, `nav.tasks.manage`, and a `page.adminTasks.*` block mirroring `page.adminEvents.*` minus `maxParticipants`, plus `page.adminTasks.field.owner` and owner picker placeholders.

## Data Models

| Table | Key columns | Notes |
|-------|-------------|-------|
| tasks | owner_id (NOT NULL FK), created_by, status, dates, location | no max_participants, no registrations |
| task_assignments | task_id, user_id | unique(task_id,user_id) |

## Error Handling

- Missing/invalid owner -> 400 `INVALID_OWNER`.
- Invalid assignee ids -> 400 `INVALID_ASSIGNED_USER` (reuse event pattern, no state mutation).
- Unauthenticated -> 401 via `get_current_user`.
- Not owner/creator/admin on edit/cancel -> 403.
- Frontend surfaces messages via the shared `extractApiError` helper.

## Testing Strategy

- Backend unit tests mirroring the event test suite: task model, task creation (incl. owner default to creator, invalid owner rejection), task listing visibility (non-admin sees only owned/assigned; admin sees all; empty-assignee task stays private), update/cancel.
- Frontend: `SingleUserPicker` behavior (single selection, replace, clear); `AdminTasksPage` renders without a participants field and with owner field.
- Migration: apply upgrade then downgrade against a test DB to confirm reversibility.
