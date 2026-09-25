# Implementation Plan: VCF Prerequisites Update

## Overview

Two-part change to the OPCP prerequisites area. Part B (backend) is implemented first because it is the blocker for the create-Installation failure: the migration already created the `installations` table and re-scoped content/answers by `installation_id`, but no Installation model, schemas, or installation-scoped routes exist. Part A (frontend) then replaces the placeholder `vcfConfig` with the real customer-input VCF parameters. All backend work matches the existing migration schema — no new migration is created. Property tests are tagged **Feature: vcf-prerequisites-update, Property {n}**.

## Tasks

- [x] 1. Add the Installation SQLAlchemy model
  - [x] 1.1 Create `app/models/installation.py`
    - Define `Installation(Base)` mapping `installations`: UUID `id` PK (default `uuid.uuid4`, `server_default text("gen_random_uuid()")`), `project_name` String(255) NOT NULL, `created_at`/`updated_at` timezone-aware timestamps (`server_default func.now()`, `updated_at` with `onupdate`), nullable `created_by`/`updated_by` FKs to `users.id`
    - Add `content` and `answers` relationships with `back_populates` and `cascade="all, delete-orphan"`
    - Export `Installation` through `app/models/__init__.py` alongside existing models
    - _Requirements: 5.1, 5.2, 5.3_

- [x] 2. Revise the prerequisite models to match the migration
  - [x] 2.1 Revise `PrerequisiteContent` in `app/models/prerequisite.py`
    - Replace slug-PK with a surrogate UUID `id` PK
    - Add `installation_id` UUID FK → `installations.id`, NOT NULL, `ON DELETE CASCADE`, indexed
    - Add `UniqueConstraint(installation_id, slug)`; keep `slug`, `content`, `updated_at`, `updated_by`
    - Add `installation = relationship("Installation", back_populates="content")`
    - _Requirements: 5.1, 7.5_

  - [x] 2.2 Revise `PrerequisiteAnswer` in `app/models/prerequisite.py`
    - Drop `user_id` and the `uq_prerequisite_answers_user_slug_row` constraint
    - Add `installation_id` UUID FK → `installations.id`, NOT NULL, `ON DELETE CASCADE`, indexed
    - Add `UniqueConstraint(installation_id, slug, row_id)` and `Index(installation_id, slug)`; keep `answer`, `updated_at`, `updated_by`
    - Add `installation = relationship("Installation", back_populates="answers")`
    - Answers are shared per installation, last-write-wins (no per-user scoping)
    - _Requirements: 7.5, 5.1_

- [x] 3. Add Installation Pydantic schemas
  - [x] 3.1 Add Installation schemas to `app/prerequisites/schemas.py`
    - `InstallationCreateRequest` with `project_name` and a `field_validator` that strips and rejects blank/whitespace-only values
    - `InstallationUpdateRequest` (extends create)
    - `InstallationResponse` (id, project_name, created_at, updated_at) with `ConfigDict(from_attributes=True)`
    - `InstallationListResponse` wrapping `installations: list[InstallationResponse]`
    - _Requirements: 6.1, 6.2, 6.3, 6.5_

- [x] 4. Implement installations CRUD endpoints
  - [x] 4.1 Add installations CRUD to `app/prerequisites/router.py`
    - `GET /installations` (`get_current_user`) returning `{"installations":[...]}`
    - `POST /installations` (`get_administrator`) creating an Installation, recording `created_by`, returning `InstallationResponse`
    - `PUT /installations/{installation_id}` (`get_administrator`) updating `project_name`, recording `updated_by`
    - `DELETE /installations/{installation_id}` (`get_administrator`) returning 204 (cascade content + answers)
    - Add helper `_get_installation_or_404(installation_id, db)` raising `INSTALLATION_NOT_FOUND` via `ErrorResponse.create(code, message, details)`
    - Confirm router is registered under `/api/prerequisites` in `app/main.py`
    - _Requirements: 6.1, 6.2, 6.3, 6.4, 6.6, 6.7, 8.1, 8.2, 8.3_

  - [ ]* 4.2 Write property test for installation create round-trip
    - **Property 4: Installation create round-trip**
    - **Validates: Requirements 6.1, 6.2**
    - Feature: vcf-prerequisites-update, Property 4; min 100 iterations over non-blank project names; created installation appears in `GET /installations`

  - [ ]* 4.3 Write property test for installation update round-trip
    - **Property 5: Installation update round-trip**
    - **Validates: Requirements 6.3**
    - Feature: vcf-prerequisites-update, Property 5; PUT then read returns new project_name, same id

  - [ ]* 4.4 Write property test for blank project name rejection
    - **Property 6: Blank project names are rejected**
    - **Validates: Requirements 6.5**
    - Feature: vcf-prerequisites-update, Property 6; whitespace-only inputs to POST and PUT return validation error, no record created/modified

  - [ ]* 4.5 Write unit tests for installations auth and not-found paths
    - Non-admin POST/PUT/DELETE rejected 403; unauthenticated 401; unknown `installation_id` on PUT/DELETE → `INSTALLATION_NOT_FOUND`
    - _Requirements: 6.6, 6.7, 8.3_

- [x] 5. Re-scope content and answer endpoints under an installation
  - [x] 5.1 Implement installation-scoped content endpoints in `app/prerequisites/router.py`
    - `GET /installations/{installation_id}/{slug}/content` (`get_current_user`)
    - `PUT /installations/{installation_id}/{slug}/content` (`get_administrator`), upsert keyed on `(installation_id, slug)`, recording `updated_by`/`updated_at`
    - Validate installation via `_get_installation_or_404`; preserve `PREREQUISITE_SLUG_NOT_FOUND` for unrecognized slugs
    - _Requirements: 7.1, 7.2, 7.5, 7.6, 7.7, 8.2, 8.3, 8.4_

  - [x] 5.2 Implement installation-scoped answer endpoints in `app/prerequisites/router.py`
    - `GET /installations/{installation_id}/{slug}/answers` (`get_current_user`) returning `{ row_id: answer }`
    - `PUT /installations/{installation_id}/{slug}/answers/{row_id}` (`get_answering_member`), upsert keyed on `(installation_id, slug, row_id)`, recording `updated_by`/`updated_at`
    - Validate installation via `_get_installation_or_404`; preserve `PREREQUISITE_SLUG_NOT_FOUND`
    - _Requirements: 7.3, 7.4, 7.5, 7.6, 7.7, 8.2_

  - [ ]* 5.3 Write property test for installation-scoped content round-trip
    - **Property 7: Installation-scoped content round-trip**
    - **Validates: Requirements 7.1, 7.2, 7.5**
    - Feature: vcf-prerequisites-update, Property 7; PUT then GET returns same content

  - [ ]* 5.4 Write property test for installation-scoped answer round-trip
    - **Property 8: Installation-scoped answer round-trip**
    - **Validates: Requirements 7.3, 7.4, 7.5**
    - Feature: vcf-prerequisites-update, Property 8; PUT then GET includes row_id mapped to same answer

  - [ ]* 5.5 Write property test for installation data isolation
    - **Property 9: Installation data isolation**
    - **Validates: Requirements 7.5**
    - Feature: vcf-prerequisites-update, Property 9; content/answers written under one installation absent from reads of another

  - [ ]* 5.6 Write property test for admin-only mutations
    - **Property 10: Mutations are admin-only**
    - **Validates: Requirements 6.7, 8.3**
    - Feature: vcf-prerequisites-update, Property 10; non-admin POST/PUT/DELETE and content PUT rejected, state unchanged

  - [ ]* 5.7 Write property test for delete cascade
    - **Property 11: Delete cascades to content and answers**
    - **Validates: Requirements 6.4**
    - Feature: vcf-prerequisites-update, Property 11; delete removes installation plus its content and answers, subsequent reads not-found

- [x] 6. Migrate existing prerequisites 404 tests to the installation-scoped contract
  - [x] 6.1 Update the basics-prerequisites-404-fix tests
    - Rewrite single-instance `/api/prerequisites/{slug}/content` and `/{slug}/answers` calls to the installation-scoped paths `/installations/{id}/{slug}/...` under a valid installation
    - Preserve `PREREQUISITE_SLUG_NOT_FOUND` semantics, now nested under a valid installation
    - _Requirements: 9.3, 7.7_

- [x] 7. Checkpoint — backend
  - Ensure all backend tests pass, ask the user if questions arise.

- [x] 8. Replace vcfConfig with the real VCF parameters
  - [x] 8.1 Rewrite `vcfConfig` in `frontend/src/components/prerequisites/configs.ts`
    - Keep the `QuestionFormConfig` shape and `QuestionRow` contract; no rendering-contract change
    - Create the 7 sections from the design table (`vcf-mgmt-network`, `vcf-mgmt-dns`, `vcf-mgmt-auth`, `vcf-mgmt-secrets`, `vcf-mgmt-misc`, `vcf-wld-general`, `vcf-wld-network`) with French titles
    - Add one row per customer-input parameter with domain-prefixed unique `id`, French `questionPrimary`, `mandatory` flags (false only for the four secrets rows and `vcf-mgmt-esxi-setup-script`), and `exampleValue`/`commentsHint`/`questionSecondary` per the row-by-row table
    - Exclude CloudStore-provided params (`node_uuids`, `bootstrap_node_uuids`)
    - Do not reintroduce the legacy `FormConfig`/`TrackingForm` archetype
    - _Requirements: 1.1, 1.2, 1.3, 1.4, 2.1, 2.2, 2.3, 2.4, 2.5, 3.1, 3.2, 3.3, 3.4_

  - [ ]* 8.2 Write property tests for vcfConfig structure
    - **Property 1: VCF rows satisfy the QuestionRow contract** — **Validates: Requirements 1.3, 2.1**
    - **Property 2: VCF row ids are unique within the page** — **Validates: Requirements 3.2**
    - **Property 3: VCF section ids are unique within the page** — **Validates: Requirements 3.3**
    - Feature: vcf-prerequisites-update, Properties 1–3

  - [x] 8.3 Write vcfConfig content assertions
    - Assert expected section ids present; excluded params (`node_uuids`, `bootstrap_node_uuids`) absent; five optional rows have `mandatory = false` and all others `true`; spot-check known `exampleValue`/`commentsHint` mappings
    - _Requirements: 1.1, 1.2, 2.2, 2.3, 2.5, 3.1_

- [x] 9. Frontend installation create flow test
  - [x] 9.1 Test the installation create flow in the Prerequisites_Frontend
    - Verify `InstallationListPage`/`prerequisitesService` create flow issues `POST /api/prerequisites/installations` and renders the created Installation against the now-matching backend contract
    - _Requirements: 6.1, 6.2, 9.2_

- [x] 10. Final verification
  - Run backend pytest and frontend `vitest --run`; ensure the frontend build passes
  - Ensure all tests pass, ask the user if questions arise.
  - _Requirements: 9.1, 9.2, 9.3_

## Notes

- Tasks marked with `*` are optional (property/unit tests) and can be skipped for a faster path; the VCF config rewrite (8.1), its content assertions (8.3), and the create-flow test (9.1) are required, as is all bugfix implementation work.
- Each task references specific requirements for traceability; property test tasks reference the design's numbered correctness properties.
- Backend (Part B) is sequenced before frontend (Part A) because it is the create-Installation blocker.
- All backend work matches the existing migration schema — no new migration is created.
- Property tests run a minimum of 100 iterations and are tagged **Feature: vcf-prerequisites-update, Property {n}**.

## Task Dependency Graph

```json
{
  "waves": [
    { "id": 0, "tasks": ["1.1", "8.1"] },
    { "id": 1, "tasks": ["2.1", "2.2", "8.2", "8.3", "9.1"] },
    { "id": 2, "tasks": ["3.1"] },
    { "id": 3, "tasks": ["4.1"] },
    { "id": 4, "tasks": ["4.2", "4.3", "4.4", "4.5", "5.1", "5.2"] },
    { "id": 5, "tasks": ["5.3", "5.4", "5.5", "5.6", "5.7", "6.1"] }
  ]
}
```
