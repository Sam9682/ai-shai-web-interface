# Design Document

## Overview

This feature adds an optional per-event user assignment. An administrator can assign an event to one existing user at creation time or when editing an event. An assigned event becomes private: only the assigned user and administrators can see it in the event list. Events with no assignment stay public and visible to every member, preserving the current behavior.

The change touches three layers:

- **Data model + migration**: a new nullable `assigned_user_id` foreign key on the `events` table pointing at `users.id`.
- **API**: the create and update endpoints accept and validate an optional `assigned_user_id`; the list endpoint filters results by the requesting user's role and identity; every event response carries `assigned_user_id`.
- **Frontend**: a reusable searchable user picker on the create and edit modals of the events administration page, plus the assignment field wired through the event service.

The backend is Python/FastAPI with SQLAlchemy; the frontend is React/TypeScript with Tailwind. Code examples below use those stacks.

## Architecture

```
Admin_Events_Page (React)
  ├─ Create modal ─┐
  └─ Edit modal ───┤── UserPicker (searchable, clearable)
                   │        └─ adminService.listUsers() → {members, total}
                   │
                   └─ eventService.createEvent / updateEvent (assigned_user_id)
                              │
                              ▼
                   Events_API (/api/events)
                     ├─ POST ""            (require_admin)  → validate assignment → persist
                     ├─ PUT  "/{event_id}" (require_admin)  → validate assignment → persist
                     └─ GET  ""            (get_current_user) → visibility filter → serialize
                              │
                              ▼
                     Event model  (assigned_user_id → users.id, nullable)
```

Data flow for visibility (GET list):

1. `get_current_user` resolves the requester and role.
2. If the requester is an administrator, no assignment filter is applied.
3. Otherwise the query keeps events where `assigned_user_id IS NULL` (public) OR `assigned_user_id == current_user.id` (assigned to the requester).
4. The existing `start_date >= now` and `status == SCHEDULED` filters are preserved.

## Components and Interfaces

### 1. Data model — `app/models/event.py`

Add a nullable FK column and a relationship for the assigned user. The existing `creator` relationship already uses `foreign_keys=[created_by]`, so the new relationship must also declare its `foreign_keys` explicitly to avoid ambiguity (two FKs from `events` to `users`).

```python
# Assignment relationship (private-event owner). Nullable => public event.
assigned_user_id: Mapped[uuid.UUID | None] = mapped_column(
    ForeignKey("users.id"),
    nullable=True,
)

# ... in __table_args__, add an index to keep the visibility filter cheap:
#   Index('idx_events_assigned_user', 'assigned_user_id'),

assigned_user: Mapped["User | None"] = relationship(
    "User",
    foreign_keys=[assigned_user_id],
)
```

The `User.events` relationship already binds to `Event.created_by` via `foreign_keys="Event.created_by"`, so adding a second FK does not change that mapping.

### 2. Migration — `migrations/versions/`

New Alembic revision chained to the current head `per_user_prerequisite_answers`. File name follows the existing convention (`YYYYMMDD_HHMM_<slug>_<desc>.py`), e.g. `20260222_0000_add_event_assigned_user_add_assigned_user_to_events.py`.

```python
revision = 'add_event_assigned_user'
down_revision = 'per_user_prerequisite_answers'
branch_labels = None
depends_on = None

def upgrade() -> None:
    op.add_column('events', sa.Column('assigned_user_id', sa.UUID(), nullable=True))
    op.create_foreign_key(
        'fk_events_assigned_user_id_users',
        'events', 'users',
        ['assigned_user_id'], ['id'],
    )
    op.create_index('idx_events_assigned_user', 'events', ['assigned_user_id'])

def downgrade() -> None:
    op.drop_index('idx_events_assigned_user', table_name='events')
    op.drop_constraint('fk_events_assigned_user_id_users', 'events', type_='foreignkey')
    op.drop_column('events', 'assigned_user_id')
```

Because the column is nullable with no server default, existing rows get `assigned_user_id = NULL` and are therefore treated as public events (Requirement 5.3). No data backfill is needed.

### 3. Schemas — `app/events/schemas.py`

Add the optional field to the create and update requests and to the response. Keep it optional so the absence of a value on create means "public" (Requirement 1.2) and the absence on update leaves the current behavior consistent with the existing partial-update pattern.

```python
class EventCreateRequest(BaseModel):
    # ... existing fields ...
    assigned_user_id: Optional[UUID] = Field(
        None, description="Existing user to assign the event to (private). Null => public."
    )

class EventUpdateRequest(BaseModel):
    # ... existing fields ...
    assigned_user_id: Optional[UUID] = Field(
        None, description="Assigned user id; send explicit null to clear the assignment."
    )

class EventResponse(BaseModel):
    # ... existing fields ...
    assigned_user_id: Optional[UUID] = None
```

**Clear-vs-omit on update.** The existing update endpoint treats `None` as "field not provided" for every field, so it cannot distinguish "clear the assignment" from "leave it unchanged". To satisfy Requirement 2.2 (clearing the selection sets the value to null), the update handler must inspect the fields that were actually sent by the client rather than relying on `is not None`. Use Pydantic's `model_fields_set` / `exclude_unset` so an explicitly sent `assigned_user_id: null` clears the assignment while an omitted field leaves it unchanged:

```python
provided = event_data.model_dump(exclude_unset=True)
if "assigned_user_id" in provided:
    # value may be a UUID (set/change) or None (clear)
    event.assigned_user_id = provided["assigned_user_id"]
```

### 4. Assignment validation helper — `app/events/router.py`

A small helper validates that a non-null assigned id references an existing user, used by both create and update (Requirements 1.4, 2.3).

```python
def _validate_assigned_user(db: Session, assigned_user_id: uuid.UUID | None) -> None:
    if assigned_user_id is None:
        return
    exists = db.query(User.id).filter(User.id == assigned_user_id).first()
    if not exists:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=ErrorResponse.create(
                code="INVALID_ASSIGNED_USER",
                message="Assigned user does not exist",
                details={"assigned_user_id": str(assigned_user_id)},
            ),
        )
```

### 5. Create endpoint — `POST /api/events`

- Guarded by `require_admin` (already in place), satisfying Requirement 1.3.
- Call `_validate_assigned_user(db, event_data.assigned_user_id)` before constructing the `Event`. Validation failure raises before any `db.add`, so the event is not created (Requirement 1.4).
- Pass `assigned_user_id=event_data.assigned_user_id` into the `Event(...)` constructor (Requirements 1.1, 1.2).
- Include `assigned_user_id` in the returned `EventResponse` (Requirement 5.2).

Notification recipients remain unchanged in scope for this feature; the design does not alter the existing notification behavior. (If desired later, notifications for assigned events could be narrowed, but that is out of scope for these requirements.)

### 6. Update endpoint — `PUT /api/events/{event_id}`

- Guarded by `require_admin` (Requirement 2.4).
- When `assigned_user_id` is present in the payload and non-null, call `_validate_assigned_user`; on failure raise before mutating, leaving the stored value unchanged (Requirement 2.3).
- Apply the set/change/clear logic via `exclude_unset` as described in the schema section (Requirements 2.1, 2.2).
- Return `assigned_user_id` in the response (Requirement 5.2).

### 7. List endpoint — `GET /api/events`

Add role-aware filtering to the existing query. The current filters (`start_date >= now`, `status == SCHEDULED`, ordering) are preserved; the visibility predicate is added on top.

```python
from sqlalchemy import or_

events_query = db.query(Event).filter(
    Event.start_date >= now,
    Event.status == EventStatus.SCHEDULED,
)

if current_user.role != UserRole.ADMINISTRATOR:
    events_query = events_query.filter(
        or_(
            Event.assigned_user_id.is_(None),           # public
            Event.assigned_user_id == current_user.id,  # assigned to me
        )
    )

events = events_query.order_by(Event.start_date.asc()).all()
```

- Members: public events plus events assigned to them; events assigned to others are excluded (Requirements 3.1, 3.2, 3.3).
- Administrators: no assignment filter, so all public and assigned events are returned (Requirement 3.4).
- Each serialized event includes `assigned_user_id` (Requirement 5.2). Legacy rows with `NULL` behave as public (Requirement 5.3).

### 8. Frontend service — `frontend/src/services/eventService.ts`

Extend the interfaces so the assignment round-trips through the API. `assigned_user_id` is nullable on `Event`, optional on create, and optional-nullable on update so the UI can send an explicit `null` to clear.

```typescript
export interface Event {
  // ... existing fields ...
  assigned_user_id: string | null;
}

export interface CreateEventRequest {
  // ... existing fields ...
  assigned_user_id?: string | null;
}

export interface UpdateEventRequest {
  // ... existing fields ...
  assigned_user_id?: string | null; // send null to clear the assignment
}
```

### 9. Frontend user picker — `frontend/src/components/UserPicker.tsx` (new)

A reusable, controlled, searchable, clearable selector shared by both modals.

Props:

```typescript
interface UserPickerProps {
  users: User[];                       // from adminService.listUsers()
  value: string | null;               // selected user id, or null
  onChange: (userId: string | null) => void;
  label?: string;                      // French label, defaults to "Assigner à un utilisateur"
  placeholder?: string;                // e.g. "Rechercher un utilisateur..."
}
```

Behavior:

- Renders a text input plus a filtered dropdown of matching users.
- Filter matches the query (case-insensitive) against `first_name`, `last_name`, and `email` (Requirement 4.4). Empty query shows the full list.
- When `value` is set, the input displays the selected user's full name and email, and a clear control (an "×" button) is shown that calls `onChange(null)` (Requirement 4.5).
- When `value` is null, no user is shown as selected (Requirements 4.1, 4.3).
- Styling follows the page: Tailwind, brand colors `#000E9C` / `#4949FF`, focus ring `focus:ring-[#4949FF]`, French labels.

A pure helper is extracted so it can be property-tested independently:

```typescript
export function filterUsers(users: User[], query: string): User[] {
  const q = query.trim().toLowerCase();
  if (!q) return users;
  return users.filter(u =>
    `${u.first_name} ${u.last_name}`.toLowerCase().includes(q) ||
    u.email.toLowerCase().includes(q)
  );
}
```

### 10. Admin events page wiring — `frontend/src/pages/AdminEventsPage.tsx`

- Add `assigned_user_id: string | null` to the shared `formData` state (initialized to `null`).
- Load the user list once via `adminService.listUsers()` (alongside `loadEvents`) and hold `members` in state.
- Render `<UserPicker>` in both the create and edit modals, bound to `formData.assigned_user_id`.
- On open create: reset `assigned_user_id` to `null` so the picker shows nothing selected (Requirement 4.1).
- On `handleEdit(event)`: set `assigned_user_id: event.assigned_user_id` so the picker pre-populates for assigned events and shows nothing for public ones (Requirements 4.2, 4.3).
- On `handleCreate` / `handleSave`: include `assigned_user_id: formData.assigned_user_id` in the request payload. For update, sending the value (including `null`) lets the backend distinguish clear from unchanged.

## Data Models

`events` table after the migration:

| column             | type                     | nullable | notes                              |
|--------------------|--------------------------|----------|------------------------------------|
| id                 | uuid                     | no       | PK                                 |
| title              | varchar(255)             | no       |                                    |
| description        | text                     | yes      |                                    |
| start_date         | timestamptz              | no       |                                    |
| end_date           | timestamptz              | no       |                                    |
| location           | varchar(255)             | yes      |                                    |
| max_participants   | integer                  | yes      |                                    |
| created_by         | uuid FK → users.id       | no       | existing creator                   |
| **assigned_user_id** | **uuid FK → users.id** | **yes**  | **new; null => public event**      |
| status             | event_status             | no       |                                    |
| created_at         | timestamptz              | no       |                                    |
| updated_at         | timestamptz              | no       |                                    |

Indexes: existing `idx_events_start_date`, new `idx_events_assigned_user` on `assigned_user_id`.

## Error Handling

| Condition | Endpoint | Response |
|-----------|----------|----------|
| Non-admin creates/updates | POST, PUT | `403` via `require_admin`; no persistence (Req 1.3, 2.4) |
| `assigned_user_id` references a missing user | POST, PUT | `400 INVALID_ASSIGNED_USER`; event not created / assignment unchanged (Req 1.4, 2.3) |
| Invalid event id format | PUT | existing `400 INVALID_EVENT_ID` |
| Event not found | PUT | existing `404 EVENT_NOT_FOUND` |
| Unexpected error | all | existing `500` with rollback |

Validation runs before any mutation, so a rejected request leaves the database untouched. On the frontend, a failed create/update surfaces via the existing `console.error` path; no assignment-specific UI error state is added beyond keeping the modal open on failure.

## Testing Strategy

Two complementary layers:

- **Unit / example tests** for authorization guards and specific UI affordances (non-admin rejection, clear-control presence, initial empty picker state).
- **Property-based tests** (minimum 100 iterations each, tagged with the feature name and property number) for the input-varying logic: persistence of the assignment, validation of non-existent users, visibility filtering, response serialization, the picker filter, and picker preselection.

Backend property tests should exercise the router/query logic against a test database (or session-scoped fixtures) with generated events and users; the assignment-validation and visibility properties do not require external services. Frontend property tests target the pure `filterUsers` helper and the picker's selection-from-event mapping.

## Correctness Properties

*A property is a characteristic or behavior that should hold true across all valid executions of a system — essentially, a formal statement about what the system should do. Properties serve as the bridge between human-readable specifications and machine-verifiable correctness guarantees.*

### Property 1: Create persists the chosen assignment

*For any* event creation request submitted by an administrator, if the request includes a valid existing `assigned_user_id`, the created event's stored `assigned_user_id` equals that identifier; if the request includes no assigned user, the stored `assigned_user_id` is null.

**Validates: Requirements 1.1, 1.2**

### Property 2: Assignment validation rejects non-existent users without mutating state

*For any* create or update request whose non-null `assigned_user_id` does not correspond to an existing user, the Events_API rejects the request with a validation error, no new event is created, and any existing event's `assigned_user_id` is left unchanged.

**Validates: Requirements 1.4, 2.3**

### Property 3: Update sets, changes, or clears the assignment

*For any* event and any update request submitted by an administrator, when the request provides a valid existing `assigned_user_id` the event's stored `assigned_user_id` becomes that identifier, and when the request explicitly clears the assignment the event's stored `assigned_user_id` becomes null.

**Validates: Requirements 2.1, 2.2**

### Property 4: Member visibility equals public events union events assigned to that member

*For any* set of upcoming scheduled events and any requesting member, the event list returned contains exactly the events that are public (null `assigned_user_id`) together with the events assigned to that member, and contains no event assigned to a different user.

**Validates: Requirements 3.1, 3.2, 3.3**

### Property 5: Administrator visibility includes every event

*For any* set of upcoming scheduled events and any requesting administrator, the event list returned contains every such event regardless of its `assigned_user_id`.

**Validates: Requirements 3.4**

### Property 6: Event responses carry the stored assignment

*For any* event returned by the Events_API, the response includes an `assigned_user_id` field equal to the event's stored assignment value, which is null for events with no assignment.

**Validates: Requirements 5.2, 5.3**

### Property 7: User picker filtering returns only matching users

*For any* list of users and any search query, the users displayed by the User_Picker are exactly those whose first name, last name, or email contains the query text (case-insensitive), and none of the excluded users match the query.

**Validates: Requirements 4.4**

### Property 8: User picker preselection reflects the event's assignment

*For any* event opened in the edit modal, the User_Picker shows the event's assigned user preselected when the event has an `assigned_user_id`, and shows no user selected when the event is public.

**Validates: Requirements 4.2, 4.3**
