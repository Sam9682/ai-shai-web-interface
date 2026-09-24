# Implementation Plan: Multi-Instance OPCP Prerequisites

## Overview

This plan turns the single, implicit OPCP prerequisites space into named **Installations**, each owning its own shared content and answers. Work proceeds bottom-up: backend models → schemas → router with role gates → Alembic migration (with data backfill and collision resolution) → frontend service → installation list page, delete dialog, and installation-scoped routing. Tests (pytest + Hypothesis on the backend, vitest + fast-check on the frontend) are placed close to the code they validate and reference the 16 correctness properties from the design.

Backend: Python 3 / FastAPI / SQLAlchemy 2.0 / Alembic. Frontend: TypeScript / React (vitest).

## Tasks

- [ ] 1. Backend data model foundation
  - [ ] 1.1 Create the `Installation` SQLAlchemy model
    - Add `app/models/installation.py` with the `Installation` model: UUID `id` PK, `project_name` (String(255), NOT NULL), `created_at`/`updated_at` (TIMESTAMPTZ, NOT NULL, default/onupdate now-UTC), nullable `created_by`/`updated_by` FKs to `users.id`
    - Add `content` and `answers` relationships with `cascade="all, delete-orphan"`
    - Register the model in the models package `__init__` so Alembic autogenerate and metadata see it
    - _Requirements: 1.1, 3.1_

  - [ ] 1.2 Revise `PrerequisiteContent` model for installation scoping
    - Add surrogate UUID `id` PK; demote `slug` from PK to a plain NOT NULL column
    - Add `installation_id` UUID FK to `installations.id`, NOT NULL, `ON DELETE CASCADE`, indexed, with `installation` relationship (`back_populates="content"`)
    - Add `UniqueConstraint("installation_id", "slug", name="uq_prerequisite_content_installation_slug")`
    - Keep `content`, `updated_at`, `updated_by`
    - _Requirements: 1.2, 1.5_

  - [ ] 1.3 Revise `PrerequisiteAnswer` model for shared per-installation answers
    - Add `installation_id` UUID FK to `installations.id`, NOT NULL, `ON DELETE CASCADE`, indexed, with `installation` relationship (`back_populates="answers"`)
    - Remove `user_id` from the identity key and drop `uq_prerequisite_answers_user_slug_row`; author/editor tracking is carried by `updated_by` only
    - Add `UniqueConstraint("installation_id", "slug", "row_id", name="uq_prerequisite_answers_installation_slug_row")` and an index on `(installation_id, slug)`
    - Keep `answer`, `updated_at`, `updated_by`
    - _Requirements: 1.3, 1.4, 1.6, 2.3_

- [ ] 2. Backend schemas
  - [ ] 2.1 Add Installation Pydantic schemas
    - In `app/prerequisites/schemas.py` add `InstallationCreateRequest` (with `project_name` min_length 1 and a `field_validator` that strips and rejects blank/whitespace-only), `InstallationUpdateRequest`, `InstallationResponse` (`from_attributes`), and `InstallationListResponse`
    - Add an optional `installation_id` field to `StaticContentResponse`; leave `ClientAnswersResponse` shape unchanged
    - _Requirements: 1.1, 3.4_

  - [ ]* 2.2 Write property test for Installation persistence round-trip
    - **Property 1: Installation persistence round-trip**
    - **Validates: Requirements 1.1**
    - Hypothesis: for any valid Project_Name, create then fetch returns the same name, a non-null id, and populated created/updated timestamps
    - Tag: `Feature: multi-instance-opcp-prerequisites, Property 1: Installation persistence round-trip`

  - [ ]* 2.3 Write unit tests for Installation request validation
    - Assert blank and whitespace-only `project_name` are rejected on create and edit
    - _Requirements: 3.4_

- [ ] 3. Backend router: Installation CRUD and re-scoped content/answer endpoints
  - [ ] 3.1 Implement Installation CRUD endpoints
    - In `app/prerequisites/router.py` add `GET /installations` (`get_current_user`), `POST /installations` (`get_administrator`), `PUT /installations/{installation_id}` (`get_administrator`), `DELETE /installations/{installation_id}` (`get_administrator`)
    - Add `_get_installation_or_404(db, installation_id)` returning a structured `INSTALLATION_NOT_FOUND` 404
    - Create sets `created_by`/`updated_by`; edit updates `project_name` and `updated_by`/`updated_at` while preserving the id; delete uses `db.delete(installation)` relying on cascade
    - _Requirements: 3.1, 3.2, 3.3, 3.5, 4.1_

  - [ ] 3.2 Re-scope content and answer endpoints under `installations/{installation_id}`
    - Change routes to `GET/PUT /installations/{installation_id}/{slug}/content` and `GET /installations/{installation_id}/{slug}/answers`, `PUT /installations/{installation_id}/{slug}/answers/{row_id}`
    - Each endpoint calls `_get_installation_or_404` first; GET content (`get_current_user`), PUT content (`get_administrator`), GET answers (`get_current_user`), PUT answer (`get_answering_member`)
    - Answer read filters on `installation_id` + `slug` only (drop `user_id`), returning every stored row (shared read)
    - Answer upsert keys on `(installation_id, slug, row_id)`, sets `updated_by = current_user.id`, refreshes `updated_at`
    - _Requirements: 2.1, 2.2, 2.3, 1.6, 4.2, 4.3, 4.4, 4.5, 3.5_

  - [ ]* 3.3 Write property tests for id distinctness and installation scoping
    - **Property 2: Installation ids are distinct** — Validates: Requirements 3.1
    - **Property 3: Content is scoped to its installation** — Validates: Requirements 1.2, 2.1
    - **Property 4: Answers are scoped to their installation** — Validates: Requirements 1.3, 2.2
    - Each as its own Hypothesis test, tagged `Feature: multi-instance-opcp-prerequisites, Property {n}: ...`

  - [ ]* 3.4 Write property tests for uniqueness and last-write-wins
    - **Property 5: Content uniqueness (single row per key)** — Validates: Requirements 1.5
    - **Property 6: Answer uniqueness and last-write-wins** — Validates: Requirements 1.4, 1.6, 2.3
    - Generate ordered write sequences by multiple users; assert exactly one row per key with the most recent value, editing user, and timestamp

  - [ ]* 3.5 Write property test for installation edit
    - **Property 7: Installation edit updates the name and preserves the id**
    - **Validates: Requirements 3.2**

  - [ ]* 3.6 Write property test for deletion cascade and isolation
    - **Property 8: Deletion cascades and is isolated**
    - **Validates: Requirements 3.3**
    - Seed multiple installations with content/answers; delete one and assert its rows are gone and others are untouched

  - [ ]* 3.7 Write property tests for role-based access control
    - **Property 9: Admin CRUD is administrator-only** — Validates: Requirements 4.1
    - **Property 10: Reads are permitted for every authenticated role** — Validates: Requirements 4.3, 4.5
    - **Property 11: Answer save is gated by role** — Validates: Requirements 4.2, 4.4
    - Parametrize over VISITOR/MEMBER/ADMINISTRATOR; assert save succeeds iff role is Member

  - [ ]* 3.8 Write edge/example tests for not-found and unknown slug
    - Random non-existent `installation_id` returns 404 `INSTALLATION_NOT_FOUND`; unknown slug returns 404
    - _Requirements: 3.5_

- [ ] 4. Checkpoint - backend model, schema, and router
  - Ensure all tests pass, ask the user if questions arise.

- [ ] 5. Alembic migration with data migration and collision resolution
  - [ ] 5.1 Create the schema + data migration
    - Add `migrations/versions/*_multi_instance_opcp_prerequisites.py` with `down_revision = 'add_account_security_2fa_fields'`
    - upgrade(): create `installations`; insert one `Default_Installation` (fixed UUID, project name) capturing its id; add nullable `installation_id` to `prerequisite_content` and `prerequisite_answers`; backfill both to the default id; resolve answer collisions with the `ROW_NUMBER() OVER (PARTITION BY installation_id, slug, row_id ORDER BY updated_at DESC, id DESC)` delete; drop `user_id` (FK/index/unique constraint); replace content `slug` PK with a surrogate `id` UUID PK; set `installation_id` NOT NULL on both; create FKs with `ON DELETE CASCADE`, the two unique constraints, and supporting indexes
    - downgrade(): reverse the above (restore `slug` PK on content and per-user answer shape, drop installation columns/constraints, drop `installations`)
    - _Requirements: 7.1, 7.2, 7.3, 7.4_

  - [ ]* 5.2 Write property test for migration answer de-duplication
    - **Property 16: Migration answer de-duplication**
    - **Validates: Requirements 7.4**
    - Generate legacy answer sets colliding on (slug, row_id) across users; assert the resolver yields one record per key with the most-recently-updated value

  - [ ]* 5.3 Write integration tests for the migration
    - Seed legacy content and answers, run `alembic upgrade`, assert a `Default_Installation` exists and every legacy row carries its id; run `alembic downgrade` to confirm reversibility
    - _Requirements: 7.1, 7.2, 7.3_

- [ ] 6. Checkpoint - migration
  - Ensure all tests pass, ask the user if questions arise.

- [ ] 7. Frontend service layer
  - [ ] 7.1 Add Installation types and service methods
    - In `frontend/src/services/prerequisitesService.ts` add the `Installation` interface and `listInstallations`, `createInstallation`, `updateInstallation`, `deleteInstallation`
    - Re-scope `loadStaticContent`, `saveStaticContent`, `loadClientAnswers`, `saveClientAnswer` to take `installationId` and target the installation-scoped URLs
    - _Requirements: 3.1, 3.2, 3.3, 5.3_

  - [ ]* 7.2 Write unit tests for service request URLs
    - Assert each method issues a request to the correct installation-scoped URL and method
    - _Requirements: 2.1, 2.2, 5.3_

- [ ] 8. Frontend Installation list page and delete dialog
  - [ ] 8.1 Implement `InstallationListPage`
    - Add `frontend/src/components/prerequisites/InstallationListPage.tsx`: fetch via `listInstallations`, render each Installation by `project_name`, each row links to `/prerequisites/installations/{id}/{firstSlug}`
    - Render create/edit/delete controls only when `authService.isAdmin()`
    - _Requirements: 5.1, 5.2, 5.3, 5.4, 5.5_

  - [ ] 8.2 Implement `DeleteInstallationDialog`
    - Add `frontend/src/components/prerequisites/DeleteInstallationDialog.tsx`: confirmation dialog whose text contains the target `project_name`; confirm calls `deleteInstallation(id)`; cancel closes without calling the service
    - Wire the dialog into `InstallationListPage`
    - _Requirements: 6.1, 6.2, 6.3_

  - [ ]* 8.3 Write property tests for the list page
    - **Property 12: List page shows every installation** — Validates: Requirements 5.2
    - **Property 13: Selecting an installation scopes the route** — Validates: Requirements 5.3
    - **Property 14: Admin controls are role-gated** — Validates: Requirements 5.4, 5.5
    - fast-check over generated Installation lists and roles

  - [ ]* 8.4 Write property/behavioral tests for the delete dialog
    - **Property 15: Delete dialog identifies the installation by name** — Validates: Requirements 6.1
    - Example tests: confirm invokes `deleteInstallation` (Req 6.2); cancel does not call the service (Req 6.3)

- [ ] 9. Frontend routing and page wiring
  - [ ] 9.1 Add installation-scoped routes and update navigation
    - In `frontend/src/App.tsx` (and `types.ts`): add `/prerequisites/installations` → `InstallationListPage` as the entry point, and `/prerequisites/installations/:installationId/:slug` → `StaticContentPage` or `QuestionAnswerForm` by archetype
    - Update `PREREQ_NAV_ITEMS` so the prerequisites entry points at `/prerequisites/installations`
    - _Requirements: 5.1, 5.3_

  - [ ] 9.2 Pass `installationId` through the content and answer pages
    - Update `StaticContentPage.tsx` and `QuestionAnswerForm.tsx` to read `installationId` from the route and pass it through every service call
    - _Requirements: 2.1, 2.2, 2.3_

  - [ ]* 9.3 Write behavioral test for the entry route
    - Assert the prerequisites entry route mounts `InstallationListPage`
    - _Requirements: 5.1_

- [ ] 10. Final checkpoint - Ensure all tests pass
  - Ensure all tests pass (`pytest` for backend, `vitest --run` for frontend), ask the user if questions arise.

## Notes

- Tasks marked with `*` are optional test sub-tasks and can be skipped for a faster MVP.
- Each task references specific requirements/properties for traceability.
- Property tests use Hypothesis (backend) and fast-check (frontend), min. 100 iterations, tagged `Feature: multi-instance-opcp-prerequisites, Property {n}: {text}`.
- The design keeps `get_answering_member` behavior: MEMBER edits values; VISITOR and ADMINISTRATOR do not submit answer values (admins manage lifecycle/content).
- Run suites in single-run mode: `pytest` and `vitest --run`.

## Task Dependency Graph

```json
{
  "waves": [
    { "id": 0, "tasks": ["1.1"] },
    { "id": 1, "tasks": ["1.2", "1.3"] },
    { "id": 2, "tasks": ["2.1", "7.1"] },
    { "id": 3, "tasks": ["2.2", "2.3", "3.1", "7.2"] },
    { "id": 4, "tasks": ["3.2", "3.5", "3.6", "3.7", "3.8"] },
    { "id": 5, "tasks": ["3.3", "3.4", "5.1"] },
    { "id": 6, "tasks": ["5.2", "5.3", "8.1"] },
    { "id": 7, "tasks": ["8.2", "9.1", "9.2"] },
    { "id": 8, "tasks": ["8.3", "8.4", "9.3"] }
  ]
}
```
