# Implementation Plan: Per-User Prerequisites Persistence

## Overview

Scope prerequisite Q&A answers to the authenticated user by adding a non-null `user_id` FK to `prerequisite_answers`, keying uniqueness on `(user_id, slug, row_id)`, and filtering both the read and write router paths by `current_user.id`. A new Alembic revision drops the legacy shared rows and reshapes the schema, with a downgrade that restores the prior `(slug, row_id)` key. The admin 403 block on submissions and the shared static-content behavior are retained. The frontend service and form signatures are unchanged because identity is derived server-side from the Bearer token.

Implementation language: Python (backend, SQLAlchemy + Alembic + FastAPI), matching the existing codebase.

## Tasks

- [x] 1. Update the `PrerequisiteAnswer` model for per-user ownership
  - In `app/models/prerequisite.py`, add a non-null `user_id: Mapped[uuid.UUID]` column with `ForeignKey("users.id")` and `index=True`
  - Replace the `UniqueConstraint('slug', 'row_id')` with `UniqueConstraint('user_id', 'slug', 'row_id', name='uq_prerequisite_answers_user_slug_row')`
  - Add `Index('idx_prerequisite_answers_user_slug', 'user_id', 'slug')` and remove the old slug-only index usage from `__table_args__`
  - Keep `updated_by` nullable and `PrerequisiteContent` untouched
  - _Requirements: 1.1, 1.2, 6.1, 4.2_

- [x] 2. Update the router read path (`get_answers`)
  - [x] 2.1 Scope `get_answers` to the authenticated user
    - In `app/prerequisites/router.py`, add the `PrerequisiteAnswer.user_id == current_user.id` filter alongside the existing slug filter
    - Preserve the `get_current_user` dependency (401 when unauthenticated) and the unknown-slug 404 path
    - Ensure an absent answer set returns an empty `answers` map
    - _Requirements: 2.1, 2.2, 2.3, 5.1, 5.3_

  - [x]* 2.2 Write property test for retrieval isolation
    - **Property 4: Retrieval returns exactly the requesting member's answers**
    - **Validates: Requirements 2.1, 2.2, 2.3, 5.1**

- [x] 3. Update the router write path (`update_answer`)
  - [x] 3.1 Scope the upsert lookup and set `user_id` on insert
    - In `app/prerequisites/router.py`, add `PrerequisiteAnswer.user_id == current_user.id` to the existing-row lookup filter
    - On insert, construct `PrerequisiteAnswer(user_id=current_user.id, slug=..., row_id=..., answer=..., updated_by=current_user.id)`
    - On update, set `answer` and `updated_by` on the caller's row only
    - Retain the `get_answering_member` dependency (admin 403) and the existing 500 rollback path
    - _Requirements: 1.1, 1.3, 1.4, 3.1, 3.2, 5.2, 5.3_

  - [x]* 3.2 Write property test for save ownership
    - **Property 1: Saved answers are owned by the submitting member**
    - **Validates: Requirements 1.1, 1.3, 3.2, 5.2**

  - [x]* 3.3 Write property test for upsert idempotency
    - **Property 2: Repeated submissions for one member do not duplicate**
    - **Validates: Requirements 1.2**

  - [x]* 3.4 Write property test for cross-member isolation on save
    - **Property 3: One member's save never alters another member's answer**
    - **Validates: Requirements 1.4**

  - [x]* 3.5 Write example unit tests for authorization and auth failures
    - Administrator PUT to a Q&A slug returns 403
    - Missing/invalid Bearer token on GET and PUT answers returns 401
    - _Requirements: 3.1, 5.3_

- [x] 4. Checkpoint - Ensure all tests pass
  - Ensure all tests pass, ask the user if questions arise.

- [x] 5. Create the Alembic migration
  - [x] 5.1 Write the per-user answers migration revision
    - Add a new revision in `migrations/versions/` with `revision = 'per_user_prerequisite_answers'` and `down_revision = 'create_prerequisites_tables'`
    - Upgrade: `DELETE FROM prerequisite_answers`, drop `uq_prerequisite_answers_slug_row` and `idx_prerequisite_answers_slug`, add non-null `user_id`, create FK `fk_prerequisite_answers_user_id`, create index `idx_prerequisite_answers_user_slug`, create unique constraint `uq_prerequisite_answers_user_slug_row`
    - Downgrade: `DELETE FROM prerequisite_answers`, drop the per-user constraint/index/FK/column, restore `idx_prerequisite_answers_slug` and `uq_prerequisite_answers_slug_row`
    - Do not reference `prerequisite_content`
    - _Requirements: 6.1, 6.2, 6.3_

  - [x]* 5.2 Write migration example tests
    - Upgrade empties pre-existing shared rows and yields a non-null `user_id` with `UNIQUE(user_id, slug, row_id)`
    - Downgrade restores `UNIQUE(slug, row_id)` and removes the `user_id` column
    - `prerequisite_content` retains its slug-only key and shared value through the migration
    - _Requirements: 6.1, 6.2, 6.3, 4.2_

- [x] 6. Confirm static content sharing and frontend stability
  - [x]* 6.1 Write property test for shared static content
    - **Property 5: Static content is identical across users**
    - **Validates: Requirements 4.1, 4.2**

  - [x] 6.2 Verify no frontend signature changes are required
    - Confirm `prerequisitesService.ts` still sends the Bearer token via `api.ts` and passes no user identifier
    - Confirm `loadClientAnswers(slug)` and `saveClientAnswer(slug, rowId, answer)` signatures and `QuestionAnswerForm.tsx` remain unchanged
    - _Requirements: 5.1, 5.2_

- [x] 7. Final checkpoint - Ensure all tests pass
  - Ensure all tests pass, ask the user if questions arise.

## Notes

- Tasks marked with `*` are optional and can be skipped for faster MVP
- Each task references specific requirements for traceability
- Checkpoints ensure incremental validation
- Property tests validate universal correctness properties (minimum 100 iterations each, tagged `Feature: per-user-prerequisites-persistence, Property {n}: {text}`)
- Unit and migration tests validate specific authorization, auth-failure, and one-shot migration behaviors
- The frontend requires no code changes; identity is derived server-side from the Bearer token

## Task Dependency Graph

```json
{
  "waves": [
    { "id": 0, "tasks": ["1"] },
    { "id": 1, "tasks": ["2.1", "3.1"] },
    { "id": 2, "tasks": ["2.2", "3.2", "3.3", "3.4", "3.5"] },
    { "id": 3, "tasks": ["5.1"] },
    { "id": 4, "tasks": ["5.2", "6.1", "6.2"] }
  ]
}
```
