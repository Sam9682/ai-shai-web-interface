# Design Document

## Overview

Today the OPCP prerequisites Q&A answers are shared: `PrerequisiteAnswer` is keyed by `UniqueConstraint('slug', 'row_id')`, `get_answers` returns every row for a slug, and `update_answer` upserts by `(slug, row_id)`. This design scopes Q&A answers to the authenticated user so each Member sees and edits only their own answers.

The change is concentrated in three places:

1. **Model** (`app/models/prerequisite.py`) — add a non-null `user_id` FK to `prerequisite_answers` and replace the unique constraint with `(user_id, slug, row_id)`.
2. **Router** (`app/prerequisites/router.py`) — filter `get_answers` by `current_user.id` and set `user_id`/scope the lookup on upsert in `update_answer`.
3. **Migration** (`migrations/versions/`) — a new Alembic revision that drops the old shared rows and recreates the answers schema with the per-user key, with a downgrade that restores the prior `(slug, row_id)` schema.

Static content (`prerequisite_content`, slugs `basics`, `network-flux`) is intentionally untouched and stays shared. The admin 403 block on `get_answering_member` is retained. Auth continues to flow through `get_current_user`; the Bearer token remains the sole source of the acting user identity, so no frontend service signature changes are required.

Requirements coverage: 1.1–1.4, 2.1–2.3, 3.1–3.2, 4.1–4.2, 5.1–5.3, 6.1–6.3.

## Architecture

```
QuestionAnswerForm.tsx
   │  loadClientAnswers(slug) / saveClientAnswer(slug, rowId, answer)
   ▼
prerequisitesService.ts ──(Bearer token via api.ts)──► GET/PUT /api/prerequisites/{slug}/answers[/ {row_id}]
   ▼
app/prerequisites/router.py
   ├─ get_current_user  ──► resolves acting User (401 if missing/invalid)   [5.1, 5.3]
   ├─ get_answering_member ──► 403 for Administrator                        [3.1]
   └─ queries scoped by current_user.id                                     [1.x, 2.x]
   ▼
PrerequisiteAnswer (user_id, slug, row_id) UNIQUE(user_id, slug, row_id)    [1.2, 6.1]
```

The request/response contract on the wire is unchanged. The acting user's identity is never carried in the URL, path, or body — it is derived server-side from the Bearer token. This means the isolation boundary lives entirely in the backend query layer, and the frontend cannot address another user's answers.

## Components and Interfaces

### 1. Data model — `PrerequisiteAnswer` (`app/models/prerequisite.py`)

Add a required `user_id` column and swap the unique constraint. `updated_by` stays as-is (nullable editor tracking); `user_id` is the new authoritative owner of the record.

```python
class PrerequisiteAnswer(Base):
    """Client answer for a prerequisite question, scoped per user.

    Validates Requirements 1.1, 1.2:
    - Persists a per-user answer keyed by (user_id, slug, row_id)
    """
    __tablename__ = "prerequisite_answers"

    id: Mapped[uuid.UUID] = mapped_column(
        primary_key=True,
        default=uuid.uuid4,
        server_default="gen_random_uuid()",
    )

    # Owner of this answer (the submitting Member). Non-null: every answer
    # belongs to exactly one user.
    user_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("users.id"),
        index=True,
        nullable=False,
    )

    slug: Mapped[str] = mapped_column(String(100), index=True, nullable=False)
    row_id: Mapped[str] = mapped_column(String(255), index=True, nullable=False)
    answer: Mapped[str] = mapped_column(Text, nullable=False, default="")

    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        nullable=False,
        default=lambda: datetime.now(timezone.utc),
        onupdate=lambda: datetime.now(timezone.utc),
    )

    # Editor tracking (retained, still nullable) — equals user_id for Q&A saves.
    updated_by: Mapped[uuid.UUID | None] = mapped_column(
        ForeignKey("users.id"), nullable=True
    )

    __table_args__ = (
        UniqueConstraint(
            'user_id', 'slug', 'row_id',
            name='uq_prerequisite_answers_user_slug_row',
        ),
        Index('idx_prerequisite_answers_user_slug', 'user_id', 'slug'),
    )
```

Design decisions:
- `user_id` is `nullable=False`. A Q&A answer with no owner is meaningless under the new model, and the migration discards any legacy ownerless rows (6.2), so there is no valid null state to preserve.
- The composite index `(user_id, slug)` supports the primary read path (`get_answers` filtered by user and slug). The old `idx_prerequisite_answers_slug` single-column index is dropped because the slug-only lookup is no longer used.
- `PrerequisiteContent` is **not** modified — it has no `user_id` and stays keyed by `slug` alone (4.2).

### 2. Router — `get_answers` (read path)

Filter by the authenticated user in addition to the slug so only the caller's answers are returned.

```python
@router.get("/{slug}/answers", response_model=ClientAnswersResponse)
async def get_answers(
    slug: str,
    current_user: User = Depends(get_current_user),   # 401 if unauthenticated (5.1, 5.3)
    db: Session = Depends(get_db),
) -> ClientAnswersResponse:
    if slug not in QA_SLUGS:
        raise _slug_not_found(slug)

    rows = (
        db.query(PrerequisiteAnswer)
        .filter(
            PrerequisiteAnswer.user_id == current_user.id,   # per-user scope (2.1, 2.3)
            PrerequisiteAnswer.slug == slug,
        )
        .all()
    )
    answers = {row.row_id: row.answer for row in rows}   # empty when none (2.2)
    return ClientAnswersResponse(slug=slug, answers=answers)
```

Note: `get_answers` currently depends on `get_current_user` (any authenticated user, including admins, may read). This is retained — the restriction applies only to submitting answers. An admin reading a Q&A slug simply sees their own (empty) answer set.

### 3. Router — `update_answer` (write path)

Scope the existing-row lookup to the acting user and set `user_id` on insert. The `get_answering_member` dependency (admin 403) is unchanged.

```python
@router.put("/{slug}/answers/{row_id}", response_model=PrerequisiteUpdateResponse)
async def update_answer(
    slug: str,
    row_id: str,
    payload: ClientAnswerUpdateRequest,
    current_user: User = Depends(get_answering_member),   # 403 for admins (3.1)
    db: Session = Depends(get_db),
) -> PrerequisiteUpdateResponse:
    if slug not in QA_SLUGS:
        raise _slug_not_found(slug)

    try:
        row = (
            db.query(PrerequisiteAnswer)
            .filter(
                PrerequisiteAnswer.user_id == current_user.id,   # scope to caller (1.4)
                PrerequisiteAnswer.slug == slug,
                PrerequisiteAnswer.row_id == row_id,
            )
            .first()
        )

        if row is None:
            row = PrerequisiteAnswer(
                user_id=current_user.id,      # owner set from token (1.1, 1.3, 5.2)
                slug=slug,
                row_id=row_id,
                answer=payload.answer,
                updated_by=current_user.id,
            )
            db.add(row)
        else:
            row.answer = payload.answer       # updates only the caller's row (1.4)
            row.updated_by = current_user.id

        db.commit()
        db.refresh(row)
        return PrerequisiteUpdateResponse(success=True, slug=slug)
    except Exception as e:  # pragma: no cover - defensive DB error path
        db.rollback()
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=ErrorResponse.create(
                code="DATABASE_ERROR",
                message="Failed to save prerequisite answer",
                details={"error": str(e)},
            ),
        )
```

Because the lookup is scoped by `user_id`, one Member's save can only ever hit their own row; a second Member with the same `(slug, row_id)` is a distinct record protected by the `(user_id, slug, row_id)` unique constraint.

### 4. Migration — new Alembic revision

A new revision chained after the current head `create_prerequisites_tables`. Existing shared rows are placeholder data and are dropped (6.2). The cleanest and safest approach is to delete all rows, then alter the schema (drop old constraint/index, add `user_id`, add new constraint/index). The downgrade reverses this to the prior `(slug, row_id)` schema (6.3).

```python
revision = 'per_user_prerequisite_answers'
down_revision = 'create_prerequisites_tables'

def upgrade() -> None:
    # 6.2: legacy rows have no owner and are placeholder — discard them.
    op.execute("DELETE FROM prerequisite_answers")

    # Drop the old shared uniqueness + slug index.
    op.drop_constraint('uq_prerequisite_answers_slug_row', 'prerequisite_answers', type_='unique')
    op.drop_index('idx_prerequisite_answers_slug', table_name='prerequisite_answers')

    # 6.1: add the per-user owner column (non-null; table is now empty).
    op.add_column(
        'prerequisite_answers',
        sa.Column('user_id', sa.Uuid(), nullable=False),
    )
    op.create_foreign_key(
        'fk_prerequisite_answers_user_id', 'prerequisite_answers',
        'users', ['user_id'], ['id'],
    )
    op.create_index(
        'idx_prerequisite_answers_user_slug', 'prerequisite_answers',
        ['user_id', 'slug'], unique=False,
    )
    op.create_unique_constraint(
        'uq_prerequisite_answers_user_slug_row', 'prerequisite_answers',
        ['user_id', 'slug', 'row_id'],
    )

def downgrade() -> None:
    # 6.3: restore the prior (slug, row_id) schema.
    # Per-user rows cannot be represented in a shared schema — discard them.
    op.execute("DELETE FROM prerequisite_answers")

    op.drop_constraint('uq_prerequisite_answers_user_slug_row', 'prerequisite_answers', type_='unique')
    op.drop_index('idx_prerequisite_answers_user_slug', table_name='prerequisite_answers')
    op.drop_constraint('fk_prerequisite_answers_user_id', 'prerequisite_answers', type_='foreignkey')
    op.drop_column('prerequisite_answers', 'user_id')

    op.create_index('idx_prerequisite_answers_slug', 'prerequisite_answers', ['slug'], unique=False)
    op.create_unique_constraint(
        'uq_prerequisite_answers_slug_row', 'prerequisite_answers',
        ['slug', 'row_id'],
    )
```

Notes:
- Adding a `NOT NULL` column is safe here only because the table is emptied first. If the delete were omitted, Postgres would reject the non-null add on a populated table.
- The `prerequisite_content` table is not referenced by this migration; static content persists across the change (4.2).
- The downgrade also empties the table before restoring the shared constraint, since per-user rows have no valid representation under the old shared key.

### 5. Frontend — no signature changes

`prerequisitesService.ts` already sends the Bearer token through `api.ts` for every request and never passes a user identifier. `loadClientAnswers(slug)` and `saveClientAnswer(slug, rowId, answer)` keep their exact signatures; the backend derives the user from the token. `QuestionAnswerForm.tsx` needs no changes — it continues to load the answer map for a slug and save individual rows, and will now naturally receive only the current user's answers.

## Data Models

`prerequisite_answers` after the change:

| Column      | Type        | Null | Notes                                             |
|-------------|-------------|------|---------------------------------------------------|
| id          | uuid        | no   | PK, `gen_random_uuid()`                            |
| user_id     | uuid        | no   | FK → `users.id`; owner of the answer (new)         |
| slug        | varchar(100)| no   | Q&A slug                                            |
| row_id      | varchar(255)| no   | question row                                        |
| answer      | text        | no   | answer text                                         |
| updated_at  | timestamptz | no   | auto-managed                                        |
| updated_by  | uuid        | yes  | FK → `users.id`; editor tracking (retained)         |

Constraints/indexes: `UNIQUE(user_id, slug, row_id)` (`uq_prerequisite_answers_user_slug_row`), `INDEX(user_id, slug)` (`idx_prerequisite_answers_user_slug`).

`prerequisite_content` is unchanged: keyed by `slug` (PK), no `user_id`, shared across all users.

## Error Handling

- **Unauthenticated request (5.3):** `get_current_user` raises `401` before any query runs, for both GET and PUT answer routes.
- **Administrator submitting an answer (3.1):** `get_answering_member` raises `403` (`ANSWER_NOT_ALLOWED_FOR_ADMIN`) — unchanged.
- **Unknown slug:** `_slug_not_found` raises the structured `404` (`PREREQUISITE_SLUG_NOT_FOUND`) — unchanged.
- **DB failure on upsert:** rolled back and surfaced as `500` (`DATABASE_ERROR`) — unchanged.
- **Unique-constraint race on concurrent first-inserts for the same triple:** the second commit fails and is caught by the existing `except`, returning `500`; the user's retry then finds the existing row and updates it. This matches the current defensive behavior.

## Correctness Properties

*A property is a characteristic or behavior that should hold true across all valid executions of a system-essentially, a formal statement about what the system should do. Properties serve as the bridge between human-readable specifications and machine-verifiable correctness guarantees.*

### Property 1: Saved answers are owned by the submitting member

*For any* Member and any Q&A slug, Row_Id, and answer text they submit, after the upsert the persisted Answer_Record for that `(member, slug, row_id)` exists and carries `user_id` equal to the submitting Member's User_Id and the submitted answer text.

**Validates: Requirements 1.1, 1.3, 3.2, 5.2**

### Property 2: Repeated submissions for one member do not duplicate

*For any* Member, Q&A slug, and Row_Id, submitting an answer any number of times results in exactly one Answer_Record for that `(user_id, slug, row_id)` triple, holding the most recently submitted answer.

**Validates: Requirements 1.2**

### Property 3: One member's save never alters another member's answer

*For any* two distinct Members sharing the same Q&A slug and Row_Id, when one Member creates or updates their answer, the other Member's Answer_Record for that same slug and Row_Id is left unchanged.

**Validates: Requirements 1.4**

### Property 4: Retrieval returns exactly the requesting member's answers

*For any* database state containing Answer_Records from arbitrary Members, and any Member requesting a Q&A slug, the response contains exactly the Answer_Records whose User_Id matches the requesting Member for that slug — no more (others excluded) and no fewer (empty when the Member has none).

**Validates: Requirements 2.1, 2.2, 2.3, 5.1**

### Property 5: Static content is identical across users

*For any* Static_Slug and any two authenticated users, requesting that slug's content returns the same shared content value independent of User_Id.

**Validates: Requirements 4.1, 4.2**

## Testing Strategy

**Property tests** (property-based, minimum 100 iterations each, tagged `Feature: per-user-prerequisites-persistence, Property {n}: {text}`):
- Property 1–5 above, exercising the model/router query layer against a test database (or session) with randomized members, slugs, row_ids, and answer text. QA_SLUGS is a small fixed set and can be sampled per iteration.

**Example / edge-case unit tests** (not suitable for PBT):
- Administrator PUT to a Q&A slug returns `403` (3.1).
- Missing/invalid Bearer token on GET and PUT answers returns `401` (5.3).
- Migration upgrade empties pre-existing shared rows and produces a non-null `user_id` column with `UNIQUE(user_id, slug, row_id)` (6.1, 6.2).
- Migration downgrade restores `UNIQUE(slug, row_id)` and removes the `user_id` column (6.3).
- `prerequisite_content` retains its `slug`-only key and shared value through the migration (4.2).

Property tests cover universal input variation; example tests pin the specific authorization, auth-failure, and one-shot migration behaviors.
