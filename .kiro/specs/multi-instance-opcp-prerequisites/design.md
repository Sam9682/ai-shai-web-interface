# Design Document

## Overview

This feature turns the single, implicit OPCP prerequisites space into a set of named **Installations**. Each Installation owns its own `PrerequisiteContent` and `PrerequisiteAnswer` records, which are now **shared across all users** viewing that Installation rather than scoped per user.

The change touches four layers:

1. **Data model** — a new `Installation` table; `installation_id` foreign keys added to `prerequisite_content` and `prerequisite_answers`; revised uniqueness keys `(installation_id, slug)` and `(installation_id, slug, row_id)`; answers lose per-user scoping.
2. **Migration** — create the `installations` table, add the FK columns, create a `Default_Installation`, backfill existing content and answers into it, de-duplicate cross-user answer collisions (last-updated wins), then enforce the new constraints.
3. **Backend API** — admin-only Installation CRUD endpoints plus the existing content/answer endpoints re-scoped under an `installations/{installation_id}` path segment, with role-based access control.
4. **Frontend** — an Installation list page as the Forum prerequisites entry point, installation-scoped routing, service methods, permission-gated admin controls, and a hard-delete confirmation dialog.

The implementation language is **Python 3 (FastAPI + SQLAlchemy 2.0 / Alembic)** for the backend and **TypeScript / React** for the frontend, matching the existing codebase.

### Key design decision: who may edit answer values

Requirement 4.2 permits **MEMBER** to save answers and Requirement 4.4 forbids **VISITOR** from saving. Requirement 4.5 lets **ADMINISTRATOR** read any Installation but the requirements are silent on whether an administrator may also edit answer values.

The current code (`get_answering_member`) **blocks administrators from submitting answers** and the frontend `canAnswer` gate is `isAuthenticated() && !isAdmin()`. This design **keeps that behavior**:

- **MEMBER** — may save answers (Req 4.2).
- **VISITOR** — read-only; save is rejected with 403 (Req 4.3, 4.4).
- **ADMINISTRATOR** — manages Installation lifecycle and static content, reads any Installation (Req 4.5), but does **not** submit client answer values.

Rationale: it preserves the established role separation (admins curate structure/content; members supply project data), avoids changing an already-tested authorization gate, and satisfies every stated acceptance criterion. If stakeholders later want admin-editable answers, the single `get_answering_member` dependency is the only backend change point.

## Architecture

```
                         Forum → Prerequisites (entry point)
                                        |
                                        v
  +---------------------------------------------------------------+
  |                     FRONTEND (React/TS)                        |
  |                                                               |
  |  InstallationListPage  --select-->  /prerequisites/           |
  |   - lists Project_Name              installations/{id}/{slug} |
  |   - admin: create/edit/delete       (StaticContentPage /      |
  |   - DeleteConfirmDialog(name)        QuestionAnswerForm)       |
  |            |                                   |              |
  |            v                                   v              |
  |     prerequisitesService.ts  (installation CRUD + scoped I/O) |
  +-----------------------------|---------------------------------+
                                | HTTPS /api/prerequisites/...
                                v
  +---------------------------------------------------------------+
  |                   BACKEND (FastAPI/SQLAlchemy)                 |
  |                                                               |
  |  app/prerequisites/router.py                                  |
  |   Installation CRUD ....... Depends(get_administrator)   [4.1]|
  |   GET content / answers ... Depends(get_current_user)   [4.3] |
  |   PUT content ............. Depends(get_administrator)        |
  |   PUT answers ............. Depends(get_answering_member)[4.4]|
  |            |                                                  |
  |            v                                                  |
  |  Installation / PrerequisiteContent / PrerequisiteAnswer      |
  |  (SQLAlchemy models, app/models/)                             |
  +-----------------------------|---------------------------------+
                                v
  +---------------------------------------------------------------+
  |                      PostgreSQL                               |
  |                                                               |
  |  installations ──1:N──> prerequisite_content                 |
  |       │        ──1:N──> prerequisite_answers                 |
  |       │  (ON DELETE CASCADE for both)                        [3.3]
  +---------------------------------------------------------------+
```

### Data flow: selecting an Installation and editing an answer

```
User opens Forum → Prerequisites
        → GET /api/prerequisites/installations               (list)         [5.1,5.2]
        → user clicks "RACK DEMO MDC MAROC"
        → route /prerequisites/installations/{id}/network-checklist         [5.3]
        → GET /api/prerequisites/installations/{id}/network-checklist/answers
        → member edits a cell, blur triggers
          PUT /api/prerequisites/installations/{id}/network-checklist/answers/{row_id}
        → upsert row keyed (installation_id, slug, row_id); record updated_by/at [1.6,2.3]
        → any other user re-reads and sees the shared value                 [2.2]
```

## Components and Interfaces

### Backend

#### Models (`app/models/installation.py`, `app/models/prerequisite.py`)

**`Installation`** — new model.

```python
class Installation(Base):
    __tablename__ = "installations"

    id: Mapped[uuid.UUID] = mapped_column(
        primary_key=True, default=uuid.uuid4, server_default="gen_random_uuid()"
    )
    project_name: Mapped[str] = mapped_column(String(255), nullable=False)

    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False,
        default=lambda: datetime.now(timezone.utc),
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False,
        default=lambda: datetime.now(timezone.utc),
        onupdate=lambda: datetime.now(timezone.utc),
    )
    created_by: Mapped[uuid.UUID | None] = mapped_column(ForeignKey("users.id"), nullable=True)
    updated_by: Mapped[uuid.UUID | None] = mapped_column(ForeignKey("users.id"), nullable=True)

    content: Mapped[list["PrerequisiteContent"]] = relationship(
        back_populates="installation", cascade="all, delete-orphan"
    )
    answers: Mapped[list["PrerequisiteAnswer"]] = relationship(
        back_populates="installation", cascade="all, delete-orphan"
    )
```

**`PrerequisiteContent`** — revised.

- `slug` is **no longer the primary key**. Add a surrogate `id` UUID PK (or keep a composite PK of `(installation_id, slug)`; a surrogate PK is chosen for consistency with `PrerequisiteAnswer` and simpler FKs).
- Add `installation_id: Mapped[uuid.UUID]` FK to `installations.id`, `nullable=False`, `ON DELETE CASCADE`, indexed.
- Uniqueness: `UniqueConstraint("installation_id", "slug", name="uq_prerequisite_content_installation_slug")` (Req 1.5).
- Keep `content`, `updated_at`, `updated_by`.

**`PrerequisiteAnswer`** — revised.

- **Drop** `user_id` from the identity key and drop `uq_prerequisite_answers_user_slug_row`. Answers are shared per Installation, not per user (Req 2). `user_id` is removed; author/editor tracking is carried solely by `updated_by`.
- Add `installation_id` FK to `installations.id`, `nullable=False`, `ON DELETE CASCADE`, indexed.
- Uniqueness: `UniqueConstraint("installation_id", "slug", "row_id", name="uq_prerequisite_answers_installation_slug_row")` (Req 1.4).
- Index `(installation_id, slug)` for the list-answers query.
- Keep `answer`, `updated_at`, `updated_by` (Req 2.3, 1.6).

#### Schemas (`app/prerequisites/schemas.py`)

Add Installation schemas; keep the existing content/answer schemas unchanged.

```python
class InstallationCreateRequest(BaseModel):
    project_name: str = Field(min_length=1)          # Req 3.4 rejects blank

    @field_validator("project_name")
    @classmethod
    def _not_blank(cls, v: str) -> str:
        if not v.strip():
            raise ValueError("project_name must not be blank")
        return v.strip()

class InstallationUpdateRequest(InstallationCreateRequest):
    pass

class InstallationResponse(BaseModel):
    id: uuid.UUID
    project_name: str
    created_at: datetime
    updated_at: datetime
    model_config = {"from_attributes": True}

class InstallationListResponse(BaseModel):
    installations: list[InstallationResponse]
```

`StaticContentResponse` gains an optional `installation_id` field; `ClientAnswersResponse` is unchanged in shape (still `{ slug, answers }`).

#### Router (`app/prerequisites/router.py`)

New Installation CRUD (admin-only via `get_administrator`, Req 4.1):

| Method | Path | Dependency | Requirement |
| --- | --- | --- | --- |
| `GET` | `/api/prerequisites/installations` | `get_current_user` | 5.1, 5.2, 2.x |
| `POST` | `/api/prerequisites/installations` | `get_administrator` | 3.1, 3.4 |
| `PUT` | `/api/prerequisites/installations/{installation_id}` | `get_administrator` | 3.2, 3.4, 3.5 |
| `DELETE` | `/api/prerequisites/installations/{installation_id}` | `get_administrator` | 3.3, 3.5 |

Re-scoped content/answer endpoints (each validates the `installation_id` exists, else structured 404 — Req 3.5):

| Method | Path | Dependency | Requirement |
| --- | --- | --- | --- |
| `GET` | `/api/prerequisites/installations/{installation_id}/{slug}/content` | `get_current_user` | 2.1, 4.3, 4.5 |
| `PUT` | `/api/prerequisites/installations/{installation_id}/{slug}/content` | `get_administrator` | admin content |
| `GET` | `/api/prerequisites/installations/{installation_id}/{slug}/answers` | `get_current_user` | 2.2, 4.3, 4.5 |
| `PUT` | `/api/prerequisites/installations/{installation_id}/{slug}/answers/{row_id}` | `get_answering_member` | 1.6, 2.3, 4.2, 4.4 |

The answer query drops the `user_id` filter and instead filters on `installation_id` and `slug`, returning every stored row (shared read, Req 2.2). The answer upsert keys on `(installation_id, slug, row_id)` and sets `updated_by = current_user.id` and refreshes `updated_at` (Req 1.6, 2.3). A helper `_get_installation_or_404(db, installation_id)` centralizes the not-found check (Req 3.5). `get_answering_member` is retained unchanged so VISITOR is rejected with 403 (Req 4.4) and ADMINISTRATOR is excluded from value edits (see design decision).

Delete uses `db.delete(installation)` relying on the ORM cascade / DB `ON DELETE CASCADE` to remove associated content and answers (Req 3.3).

### Frontend

#### Service (`frontend/src/services/prerequisitesService.ts`)

Add Installation types and methods; re-scope existing methods to take `installationId`.

```typescript
export interface Installation {
  id: string;
  project_name: string;
  created_at: string;
  updated_at: string;
}

export const prerequisitesService = {
  listInstallations(): Promise<Installation[]>,               // GET .../installations
  createInstallation(projectName: string): Promise<Installation>,
  updateInstallation(id: string, projectName: string): Promise<Installation>,
  deleteInstallation(id: string): Promise<void>,

  loadStaticContent(installationId: string, slug: string): Promise<StaticContentResponse>,
  saveStaticContent(installationId: string, slug: string, content: string): Promise<void>,
  loadClientAnswers(installationId: string, slug: string): Promise<ClientAnswersResponse>,
  saveClientAnswer(installationId: string, slug: string, rowId: string, answer: string): Promise<void>,
};
```

#### Components (`frontend/src/components/prerequisites/`)

- **`InstallationListPage.tsx`** (new) — entry point (Req 5.1). Lists installations by `project_name` (Req 5.2); each row links to `/prerequisites/installations/{id}/{firstSlug}` (Req 5.3). Renders create/edit/delete controls **iff** `authService.isAdmin()` (Req 5.4, 5.5).
- **`DeleteInstallationDialog.tsx`** (new) — confirmation dialog that renders the target `project_name` in its message (Req 6.1). Confirm invokes `deleteInstallation(id)` (Req 6.2); cancel closes without calling the service (Req 6.3).
- **`StaticContentPage.tsx` / `QuestionAnswerForm.tsx`** — read `installationId` from the route and pass it through every service call.

#### Routing (`frontend/src/App.tsx`, `types.ts`)

- `PREREQ_NAV_ITEMS` gains an `installations` entry pointing at `/prerequisites/installations` (the new entry point). The per-slug items become templates rendered under `/prerequisites/installations/:installationId/:slug`.
- New routes:
  - `/prerequisites/installations` → `InstallationListPage`
  - `/prerequisites/installations/:installationId/:slug` → `StaticContentPage` or `QuestionAnswerForm` by archetype.

## Data Models

```
installations
  id            UUID  PK
  project_name  VARCHAR(255)  NOT NULL
  created_at    TIMESTAMPTZ   NOT NULL
  updated_at    TIMESTAMPTZ   NOT NULL
  created_by    UUID  FK users.id  NULL
  updated_by    UUID  FK users.id  NULL

prerequisite_content
  id               UUID  PK
  installation_id  UUID  FK installations.id  NOT NULL  ON DELETE CASCADE  (idx)
  slug             VARCHAR(100)  NOT NULL
  content          TEXT  NOT NULL  DEFAULT ''
  updated_at       TIMESTAMPTZ   NOT NULL
  updated_by       UUID  FK users.id  NULL
  UNIQUE (installation_id, slug)                           -- Req 1.5

prerequisite_answers
  id               UUID  PK
  installation_id  UUID  FK installations.id  NOT NULL  ON DELETE CASCADE  (idx)
  slug             VARCHAR(100)  NOT NULL
  row_id           VARCHAR(255)  NOT NULL
  answer           TEXT  NOT NULL  DEFAULT ''
  updated_at       TIMESTAMPTZ   NOT NULL
  updated_by       UUID  FK users.id  NULL
  UNIQUE (installation_id, slug, row_id)                   -- Req 1.4
  INDEX (installation_id, slug)
```

### Migration (`migrations/versions/*_multi_instance_opcp_prerequisites.py`)

`down_revision = 'add_account_security_2fa_fields'` (current head).

**upgrade()** — ordered so constraints are only enforced after data is clean:

1. `create_table('installations', ...)`.
2. Insert one `Default_Installation` row with a fixed UUID and `project_name = 'Default Installation'` (Req 7.1). Capture its id.
3. Add `installation_id` to `prerequisite_content` and `prerequisite_answers` as **nullable** FKs (so existing rows survive the `ADD COLUMN`).
4. Backfill: `UPDATE prerequisite_content SET installation_id = :default_id`; `UPDATE prerequisite_answers SET installation_id = :default_id` (Req 7.2, 7.3).
5. **Resolve answer collisions** (Req 7.4): before applying the new unique key, collapse rows that now share `(installation_id, slug, row_id)` (previously distinct per `user_id`). Keep the most-recently-updated row per key (`updated_at` desc, tie-broken by `id`) and delete the rest:

   ```sql
   DELETE FROM prerequisite_answers a
   USING (
     SELECT id,
            ROW_NUMBER() OVER (
              PARTITION BY installation_id, slug, row_id
              ORDER BY updated_at DESC, id DESC
            ) AS rn
     FROM prerequisite_answers
   ) ranked
   WHERE a.id = ranked.id AND ranked.rn > 1;
   ```
6. Drop the old `user_id` column, its FK, index, and the `uq_prerequisite_answers_user_slug_row` constraint.
7. On `prerequisite_content`: drop the `slug` primary key, add a surrogate `id` UUID PK.
8. `ALTER COLUMN installation_id SET NOT NULL` on both tables; create the FKs with `ON DELETE CASCADE`, the `(installation_id, slug)` unique constraint on content, the `(installation_id, slug, row_id)` unique constraint on answers, and supporting indexes.

**downgrade()** — reverse: drop the new constraints/columns, restore `slug` PK on content and the per-user `(user_id, slug, row_id)` shape on answers (per-installation rows that cannot be represented per-user are discarded), drop the `installations` table.

## Error Handling

All error bodies reuse the shared `ErrorResponse.create(code, message, details)` contract already used by the router.

| Condition | Status | Code | Requirement |
| --- | --- | --- | --- |
| Missing/blank `project_name` on create/edit | 422 | validation (`RequestValidationError`) | 3.4 |
| Unknown `installation_id` on any scoped call | 404 | `INSTALLATION_NOT_FOUND` | 3.5 |
| Unknown `slug` | 404 | `PREREQUISITE_SLUG_NOT_FOUND` | existing |
| Non-admin calls create/edit/delete | 403 | `ADMIN_ACCESS_REQUIRED` | 4.1 |
| Visitor (or admin) saves an answer | 403 | `ANSWER_NOT_ALLOWED_FOR_ADMIN` / visitor gate | 4.4 |
| DB failure during upsert/delete | 500 | `DATABASE_ERROR` (rollback) | defensive |

The frontend surfaces load failures with a status/alert banner (existing pattern) and keeps typed values on save failure. The delete dialog only calls the service on explicit confirmation.

## Correctness Properties

*A property is a characteristic or behavior that should hold true across all valid executions of a system — a formal statement about what the system should do. Properties serve as the bridge between human-readable specifications and machine-verifiable correctness guarantees.*

### Property 1: Installation persistence round-trip

*For any* valid Project_Name, creating an Installation and then fetching it returns the same Project_Name, a non-null Installation_Id, and populated creation and last-updated timestamps.

**Validates: Requirements 1.1**

### Property 2: Installation ids are distinct

*For any* sequence of Installation create requests, every returned Installation_Id is distinct from all others.

**Validates: Requirements 3.1**

### Property 3: Content is scoped to its installation

*For any* Installation_Id and slug, saving content under that Installation makes it readable under the same Installation_Id, and a read under any different Installation_Id does not return it.

**Validates: Requirements 1.2, 2.1**

### Property 4: Answers are scoped to their installation

*For any* Installation_Id, slug, and row_id, saving an answer makes it readable only under the same Installation_Id, regardless of which user reads it.

**Validates: Requirements 1.3, 2.2**

### Property 5: Content uniqueness (single row per key)

*For any* sequence of content saves to the same (Installation_Id, slug), exactly one content row exists for that key afterward and its content equals the last saved value.

**Validates: Requirements 1.5**

### Property 6: Answer uniqueness and last-write-wins

*For any* ordered sequence of answer saves by any users to the same (Installation_Id, slug, row_id), exactly one answer row exists for that key afterward, its value equals the most recently submitted value, and its recorded editing user and update timestamp correspond to that most recent save.

**Validates: Requirements 1.4, 1.6, 2.3**

### Property 7: Installation edit updates the name and preserves the id

*For any* existing Installation and any valid new Project_Name, editing then reading the Installation returns the new Project_Name and the unchanged Installation_Id.

**Validates: Requirements 3.2**

### Property 8: Deletion cascades and is isolated

*For any* Installation seeded with arbitrary content and answers, deleting it leaves zero content and zero answer rows for that Installation_Id while leaving every other Installation's content and answers unchanged.

**Validates: Requirements 3.3**

### Property 9: Admin CRUD is administrator-only

*For any* non-administrator role, a create, edit, or delete request against an Installation is rejected with an authorization error and mutates no data.

**Validates: Requirements 4.1**

### Property 10: Reads are permitted for every authenticated role

*For any* authenticated role (Visitor, Member, or Administrator), reading Prerequisite_Content and Prerequisite_Answers for an existing Installation succeeds.

**Validates: Requirements 4.3, 4.5**

### Property 11: Answer save is gated by role

*For any* authenticated role, a request to save a Prerequisite_Answer succeeds if and only if the role is permitted to edit values (Member), and is otherwise rejected with an authorization error.

**Validates: Requirements 4.2, 4.4**

### Property 12: List page shows every installation

*For any* list of Installations, rendering the Installation_List_Page displays each Installation's Project_Name.

**Validates: Requirements 5.2**

### Property 13: Selecting an installation scopes the route

*For any* Installation, the selection control on the Installation_List_Page targets a route that embeds that Installation_Id.

**Validates: Requirements 5.3**

### Property 14: Admin controls are role-gated

*For any* role, the Installation_List_Page renders the create, edit, and delete controls if and only if the role is Administrator.

**Validates: Requirements 5.4, 5.5**

### Property 15: Delete dialog identifies the installation by name

*For any* Installation, activating its delete control opens a confirmation dialog whose text contains that Installation's Project_Name.

**Validates: Requirements 6.1**

### Property 16: Migration answer de-duplication

*For any* set of legacy Prerequisite_Answer records that collide on (slug, row_id) across different users, the migration resolver produces exactly one record per (slug, row_id) whose value is that of the most-recently-updated colliding record.

**Validates: Requirements 7.4**

## Testing Strategy

### Backend (pytest + Hypothesis)

- **Property tests** (min. 100 iterations each, tagged `Feature: multi-instance-opcp-prerequisites, Property {n}: {text}`) for Properties 1–11 and 16 against an in-memory/SQLite or transactional Postgres fixture, generating random Project_Names, slugs, row_ids, ordered write sequences, roles, and legacy-answer collision sets.
- **Example / edge tests**: blank and whitespace-only `project_name` (Req 3.4); random non-existent `installation_id` returning 404 (Req 3.5); unknown slug 404.
- **Integration tests** for the migration (Req 7.1–7.3): seed legacy content and answers, run `alembic upgrade`, assert a `Default_Installation` exists and every legacy row now carries its id; run `alembic downgrade` for reversibility.

### Frontend (vitest + Testing Library + fast-check)

- **Property tests** for Properties 12, 13, 14 over generated Installation lists and roles.
- **Example / behavioral tests**: entry route mounts `InstallationListPage` (Req 5.1); Property 15 dialog renders the Project_Name; confirm invokes `deleteInstallation` (Req 6.2); cancel does not call the service (Req 6.3); service methods issue requests to the installation-scoped URLs.

Both suites should be runnable in single-run (non-watch) mode: `pytest` for the backend and `vitest --run` for the frontend.
