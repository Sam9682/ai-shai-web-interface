# Implementation Plan: Admin Event User Assignment

## Overview

Add an optional per-event user assignment across three layers. The plan works bottom-up: first the data model and migration, then the backend schemas, validation, and the three endpoint behaviors (create, update, list), then the frontend service, the reusable `UserPicker` component, and finally the `AdminEventsPage` wiring that ties both modals together. Each step builds on the previous one and ends with the frontend integration so no code is left orphaned. Property-based tests (minimum 100 iterations, tagged with the feature name and property number) accompany the input-varying logic; example/unit tests cover guards and specific UI affordances.

## Tasks

- [ ] 1. Data model and migration
  - [ ] 1.1 Add `assigned_user_id` FK column and relationship to the Event model
    - In `app/models/event.py`, add a nullable `assigned_user_id: Mapped[uuid.UUID | None]` column with `ForeignKey("users.id")`
    - Add an `assigned_user` relationship with explicit `foreign_keys=[assigned_user_id]` to disambiguate from the existing `creator` FK
    - Add `Index('idx_events_assigned_user', 'assigned_user_id')` to `__table_args__`
    - _Requirements: 5.1_

  - [ ] 1.2 Create the Alembic migration for the new column
    - Add revision file under `migrations/versions/` following the `YYYYMMDD_HHMM_<slug>_<desc>.py` convention
    - Set `revision = 'add_event_assigned_user'` and `down_revision = 'per_user_prerequisite_answers'`
    - `upgrade()`: add nullable `assigned_user_id` UUID column, create FK `fk_events_assigned_user_id_users`, create index `idx_events_assigned_user`
    - `downgrade()`: drop the index, the FK constraint, then the column
    - _Requirements: 5.1, 5.3_

- [ ] 2. Backend schemas
  - [ ] 2.1 Add `assigned_user_id` to the event request/response schemas
    - In `app/events/schemas.py`, add `assigned_user_id: Optional[UUID]` to `EventCreateRequest` and `EventUpdateRequest`
    - Add `assigned_user_id: Optional[UUID] = None` to `EventResponse`
    - Document on the update field that an explicit `null` clears the assignment (relies on `exclude_unset` in the handler)
    - _Requirements: 1.1, 1.2, 2.1, 2.2, 5.2_

- [ ] 3. Backend validation and create endpoint
  - [ ] 3.1 Add the `_validate_assigned_user` helper
    - In `app/events/router.py`, add a helper that returns early on `None` and raises `400 INVALID_ASSIGNED_USER` when the id does not match an existing user
    - _Requirements: 1.4, 2.3_

  - [ ] 3.2 Wire assignment into the create endpoint
    - In `POST /api/events`, call `_validate_assigned_user(db, event_data.assigned_user_id)` before constructing the `Event` (so failure prevents creation)
    - Pass `assigned_user_id=event_data.assigned_user_id` into the `Event(...)` constructor
    - Ensure the returned `EventResponse` includes `assigned_user_id`
    - _Requirements: 1.1, 1.2, 1.3, 1.4, 5.2_

  - [ ]* 3.3 Write property test for create persistence
    - **Property 1: Create persists the chosen assignment**
    - **Validates: Requirements 1.1, 1.2**
    - Minimum 100 iterations; generate admin create requests with/without a valid assigned user and assert the stored value matches (id or null)

  - [ ]* 3.4 Write property test for assignment validation
    - **Property 2: Assignment validation rejects non-existent users without mutating state**
    - **Validates: Requirements 1.4, 2.3**
    - Minimum 100 iterations; generate non-existent ids on create/update and assert rejection with no new event and unchanged existing assignment

  - [ ]* 3.5 Write unit test for non-admin create rejection
    - Assert a non-administrator create request is rejected (403) and no event is persisted
    - _Requirements: 1.3_

- [ ] 4. Backend update endpoint
  - [ ] 4.1 Implement set/change/clear logic on the update endpoint
    - In `PUT /api/events/{event_id}`, compute `provided = event_data.model_dump(exclude_unset=True)`
    - When `"assigned_user_id" in provided` and the value is non-null, call `_validate_assigned_user` before mutating
    - Assign `event.assigned_user_id = provided["assigned_user_id"]` only when the key is present (UUID sets/changes, `None` clears); omission leaves it unchanged
    - Ensure the returned `EventResponse` includes `assigned_user_id`
    - _Requirements: 2.1, 2.2, 2.3, 2.4, 5.2_

  - [ ]* 4.2 Write property test for update set/change/clear
    - **Property 3: Update sets, changes, or clears the assignment**
    - **Validates: Requirements 2.1, 2.2**
    - Minimum 100 iterations; generate events and update requests (set valid id / explicit null) and assert the resulting stored value

  - [ ]* 4.3 Write unit test for non-admin update rejection
    - Assert a non-administrator update request is rejected (403) and the event assignment is unchanged
    - _Requirements: 2.4_

- [ ] 5. Backend list endpoint visibility
  - [ ] 5.1 Add role-aware visibility filtering to the list endpoint
    - In `GET /api/events`, preserve existing `start_date >= now`, `status == SCHEDULED`, and ordering filters
    - For non-administrators, add `or_(Event.assigned_user_id.is_(None), Event.assigned_user_id == current_user.id)`
    - For administrators, apply no assignment filter
    - Ensure each serialized event includes `assigned_user_id`
    - _Requirements: 3.1, 3.2, 3.3, 3.4, 5.2, 5.3_

  - [ ]* 5.2 Write property test for member visibility
    - **Property 4: Member visibility equals public events union events assigned to that member**
    - **Validates: Requirements 3.1, 3.2, 3.3**
    - Minimum 100 iterations; generate event sets and a requesting member, assert returned set is exactly public ∪ assigned-to-me

  - [ ]* 5.3 Write property test for administrator visibility
    - **Property 5: Administrator visibility includes every event**
    - **Validates: Requirements 3.4**
    - Minimum 100 iterations; generate event sets and assert an administrator receives every upcoming scheduled event

  - [ ]* 5.4 Write property test for response serialization
    - **Property 6: Event responses carry the stored assignment**
    - **Validates: Requirements 5.2, 5.3**
    - Minimum 100 iterations; assert every returned event's `assigned_user_id` equals the stored value (null when unassigned)

- [ ] 6. Checkpoint - Ensure all backend tests pass
  - Ensure all tests pass, ask the user if questions arise.

- [ ] 7. Frontend event service
  - [ ] 7.1 Extend event service interfaces with `assigned_user_id`
    - In `frontend/src/services/eventService.ts`, add `assigned_user_id: string | null` to `Event`
    - Add `assigned_user_id?: string | null` to `CreateEventRequest` and `UpdateEventRequest` (null clears on update)
    - _Requirements: 5.2_

- [ ] 8. Frontend user picker component
  - [ ] 8.1 Create the `UserPicker` component with a pure `filterUsers` helper
    - Add `frontend/src/components/UserPicker.tsx` exporting a `filterUsers(users, query)` pure helper (case-insensitive match on first name, last name, email; empty query returns all)
    - Implement the controlled `UserPicker` (props: `users`, `value`, `onChange`, optional `label`, `placeholder`) with a text input, filtered dropdown, selected-user display, and an "×" clear control that calls `onChange(null)`
    - Follow page styling: Tailwind, brand colors `#000E9C` / `#4949FF`, focus ring `focus:ring-[#4949FF]`, French labels
    - _Requirements: 4.1, 4.3, 4.4, 4.5_

  - [ ]* 8.2 Write property test for the filter helper
    - **Property 7: User picker filtering returns only matching users**
    - **Validates: Requirements 4.4**
    - Minimum 100 iterations; generate user lists and queries, assert displayed users are exactly those matching (case-insensitive) and no excluded user matches

  - [ ]* 8.3 Write unit tests for picker affordances
    - Assert the clear control appears when a value is selected and calls `onChange(null)`
    - Assert no user is shown selected when `value` is null
    - _Requirements: 4.1, 4.3, 4.5_

- [ ] 9. Frontend admin events page wiring
  - [ ] 9.1 Wire `UserPicker` into both create and edit modals
    - In `frontend/src/pages/AdminEventsPage.tsx`, add `assigned_user_id: string | null` to shared `formData` (init `null`)
    - Load the user list once via `adminService.listUsers()` and hold `members` in state
    - Render `<UserPicker>` in both modals bound to `formData.assigned_user_id`
    - On open create: reset `assigned_user_id` to `null`; on `handleEdit(event)`: set `assigned_user_id: event.assigned_user_id`
    - On `handleCreate` / `handleSave`: include `assigned_user_id: formData.assigned_user_id` in the payload (send `null` to clear on update)
    - _Requirements: 4.1, 4.2, 4.3_

  - [ ]* 9.2 Write property test for picker preselection from event
    - **Property 8: User picker preselection reflects the event's assignment**
    - **Validates: Requirements 4.2, 4.3**
    - Minimum 100 iterations; generate events (assigned/public), assert the picker preselects the assigned user or shows none for public events

- [ ] 10. Final checkpoint - Ensure all tests pass
  - Ensure all tests pass, ask the user if questions arise.

## Notes

- Tasks marked with `*` are optional test sub-tasks and can be skipped for a faster MVP.
- Each task references specific requirements for traceability.
- Property tests validate the 8 universal correctness properties (minimum 100 iterations each, tagged with the feature name and property number); unit tests validate guards and specific UI affordances.
- Backend property tests exercise router/query logic against a test database or session-scoped fixtures; frontend property tests target the pure `filterUsers` helper and the picker's selection-from-event mapping.
- Checkpoints ensure incremental validation between the backend and frontend layers.

## Task Dependency Graph

```json
{
  "waves": [
    { "id": 0, "tasks": ["1.1", "7.1", "8.1"] },
    { "id": 1, "tasks": ["1.2", "2.1", "8.2", "8.3"] },
    { "id": 2, "tasks": ["3.1", "9.1"] },
    { "id": 3, "tasks": ["3.2", "4.1", "5.1", "9.2"] },
    { "id": 4, "tasks": ["3.3", "3.4", "3.5", "4.2", "4.3", "5.2", "5.3", "5.4"] }
  ]
}
```
