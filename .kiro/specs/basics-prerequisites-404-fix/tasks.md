# Implementation Plan

- [x] 1. Write bug condition exploration test (BEFORE implementing the fix)
  - **Property 1: Bug Condition** - Prerequisites API is served, not 404
  - **CRITICAL**: This test MUST FAIL on the unfixed code - failure confirms the bug exists
  - **DO NOT attempt to fix the test or the code when it fails**
  - **NOTE**: This test encodes the expected behavior - it will validate the fix once it passes after implementation
  - **GOAL**: Surface counterexamples proving the whole `/api/prerequisites/*` family returns an unmatched-route 404
  - **Scoped PBT Approach**: The bug is deterministic (no route mounted for the family), so scope the property to the concrete failing paths/verbs of the contract rather than fully random paths
  - Create `tests/test_prerequisites_exploration.py` using the `TestClient` + `Base.metadata.create_all` fixture pattern from `tests/conftest.py`
  - Encode `isBugCondition(request)`: any request matching `/api/prerequisites/{slug}/content`, `/api/prerequisites/{slug}/answers`, or `/api/prerequisites/{slug}/answers/{rowId}` (from Bug Condition in design)
  - Assert each of the following returns `404` (unmatched route) on the UNFIXED app:
    - `GET /api/prerequisites/basics/content` (the reported "Basics" symptom)
    - `GET /api/prerequisites/network-flux/content`
    - `GET /api/prerequisites/network-checklist/answers`
    - `PUT /api/prerequisites/basics/content` with body `{ "content": "..." }`
    - `PUT /api/prerequisites/cloudstore/answers/cs-subnet-cidr` with body `{ "answer": "..." }`
    - `GET /api/prerequisites/does-not-exist/content` (edge: currently 404, must later become a resource-specific 404)
  - The test assertions should mirror the Expected Behavior Properties (Property 1) so the same test validates the fix later
  - Run the test on UNFIXED code
  - **EXPECTED OUTCOME**: Test FAILS (all family requests 404 - this is correct and proves the bug exists)
  - **Refutation guard**: If any request unexpectedly does NOT 404, the "missing router" hypothesis is refuted - stop and re-examine the root cause
  - Document counterexamples found (e.g. "GET /api/prerequisites/basics/content -> 404 unmatched route instead of 200 { slug, content }")
  - Mark task complete when the test is written, run, and the failure is documented
  - _Requirements: 1.1, 1.2, 1.3, 1.4, 1.5_

- [x] 2. Write preservation property tests (BEFORE implementing the fix)
  - **Property 2: Preservation** - All non-prerequisites behavior unchanged
  - **IMPORTANT**: Follow the observation-first methodology - record actual behavior on the UNFIXED app, then assert it is unchanged after the fix
  - Create `tests/test_prerequisites_preservation.py` using the `TestClient` fixture from `tests/conftest.py`
  - Encode `NOT isBugCondition(request)`: any request outside the `/api/prerequisites/*` family
  - Observe and record behavior on the UNFIXED app for a representative set:
    - Existing router prefixes respond as before: `/api/auth/...`, `/api/documents`, `/api/forum/...`, `/api/events`, `/api/admin/...`, `/api/notifications`, `/api/info`, `/api/users`, `/api/oracle` (auth/forum/payments/documents/events/admin/notifications/info/users/oracle)
    - Root/health: `GET /` and `GET /health` return their current bodies
    - Unrelated unmatched path: `GET /api/nope` returns the app's normal 404 (the new router must NOT broaden matching)
    - Middleware: CORS headers and rate-limit behavior on an existing route are unchanged
  - Write property-based tests (recommended) that generate paths/verbs OUTSIDE the prerequisites family and assert status/body match the observed baseline
  - Run the tests on UNFIXED code
  - **EXPECTED OUTCOME**: Tests PASS (this captures the baseline behavior that must be preserved)
  - Mark task complete when the tests are written, run, and passing on unfixed code
  - _Requirements: 3.1, 3.2, 3.3, 3.4, 3.5_

- [x] 3. Fix for the missing prerequisites backend (mount the route family)

  - [x] 3.1 Add persistence models and register them
    - Create `app/models/prerequisite.py` following `app/models/document.py` conventions (`Base`, `Mapped`, `mapped_column`, timezone-aware timestamps, `__repr__`, indexes)
    - `PrerequisiteContent` (table `prerequisite_content`): `slug` `String(100)` unique+indexed; `content` `Text` nullable=False default `""`; `updated_at` `DateTime(timezone=True)` default/onupdate now(utc); `updated_by` `ForeignKey("users.id")` nullable
    - `PrerequisiteAnswer` (table `prerequisite_answers`): `id` UUID PK (`default=uuid.uuid4`, `server_default="gen_random_uuid()"`); `slug` `String(100)` indexed; `row_id` `String(255)` indexed; `answer` `Text` nullable=False default `""`; `updated_at` timezone-aware default/onupdate now(utc); `updated_by` `ForeignKey("users.id")` nullable; `__table_args__` unique constraint on `(slug, row_id)` + index on `slug`
    - Register both models in `app/models/__init__.py` (import + `__all__`) so Alembic autogenerate and `Base.metadata` see them
    - _Bug_Condition: isBugCondition(request) - no persistence layer wired for the family (from design)_
    - _Expected_Behavior: PUT persists so a subsequent GET returns the persisted value (from design)_
    - _Requirements: 2.5_

  - [x] 3.2 Add the Alembic migration for the new tables
    - Create `migrations/versions/<new>_create_prerequisites_tables.py` creating `prerequisite_content` and `prerequisite_answers` with the columns, `(slug, row_id)` unique constraint, and indexes above
    - `down_revision` chains onto the current head (`add_membership_status_col`); use `server_default="gen_random_uuid()"` for UUID PKs and explicit `create_index`, matching the established migration pattern
    - Implement `downgrade()` to drop the tables and indexes
    - _Bug_Condition: isBugCondition(request) - no migration exists for the family (from design)_
    - _Expected_Behavior: tables exist so PUT/GET round-trip persists (from design)_
    - _Requirements: 2.5_

  - [x] 3.3 Add the prerequisites schemas and package init
    - Create `app/prerequisites/__init__.py` (empty package marker, mirroring `app/documents/__init__.py`)
    - Create `app/prerequisites/schemas.py` matching the exact shapes `prerequisitesService.ts` sends/expects:
      - `StaticContentResponse`: `{ slug: str, content: str, updated_at: Optional[datetime] }` with `model_config = {"from_attributes": True}`
      - `StaticContentUpdateRequest`: `{ content: str }`
      - `ClientAnswersResponse`: `{ slug: str, answers: dict[str, str] }` (keyed by `row_id`)
      - `ClientAnswerUpdateRequest`: `{ answer: str }`
      - A success schema for PUTs (e.g. `{ success: bool, slug: str }`); reuse `ErrorResponse` from `app.auth.schemas` for error bodies
    - _Bug_Condition: isBugCondition(request) - contract shapes are unserved (from design)_
    - _Expected_Behavior: response/request bodies match `{ slug, content, updated_at? }` / `{ slug, answers }` / `{ content }` / `{ answer }` (from design)_
    - _Requirements: 2.1, 2.3, 2.4_

  - [x] 3.4 Implement the router with the four endpoints and auth wiring
    - Create `app/prerequisites/router.py` with `router = APIRouter(prefix="/api/prerequisites", tags=["prerequisites"])`
    - Define the known slug sets as router constants (static: `basics`, `network-flux`; qa: `network-checklist`, `core-control-plane`, `cloudstore`, `vcf`), kept in sync with the frontend `PREREQ_NAV_ITEMS`
    - `GET /{slug}/content` -> `StaticContentResponse`, `Depends(get_current_user)`: look up by `slug`; return persisted row, or an empty-content default `{ slug, content: "" }` for a known static slug never saved; unknown slug -> structured resource-specific `404` `ErrorResponse` (e.g. `PREREQUISITE_SLUG_NOT_FOUND`)
    - `PUT /{slug}/content` (body `StaticContentUpdateRequest`) -> success schema, `Depends(get_administrator)`: upsert the row (create/update `content`, `updated_at`, `updated_by`), commit, refresh
    - `GET /{slug}/answers` -> `ClientAnswersResponse`, `Depends(get_current_user)`: build `{ row_id: answer }` for the slug (empty map when none); validate against qa slug set; unknown slug -> resource-specific `404`
    - `PUT /{slug}/answers/{row_id}` (body `ClientAnswerUpdateRequest`) -> success schema, `Depends(get_current_user)` with a non-admin authorization check mirroring the frontend `canAnswer` gate (admin -> structured `403` `ErrorResponse`; optionally encapsulate as a `get_answering_member` dependency mirroring `get_verified_member`): upsert the `(slug, row_id)` row, commit
    - _Bug_Condition: isBugCondition(request) where request.path MATCHES the prerequisites contract (from design)_
    - _Expected_Behavior: expectedBehavior(result) - served route with correct status/shape, never unmatched-route 404 (from design Property 1)_
    - _Preservation: reuse existing auth deps (get_current_user / get_current_user_optional / get_administrator) so auth behavior matches other routers (from design Preservation Requirements)_
    - _Requirements: 2.1, 2.2, 2.3, 2.4, 2.5, 2.6, 3.4_

  - [x] 3.5 Register the router in app/main.py
    - Add `from app.prerequisites.router import router as prerequisites_router` with the other router imports
    - Add `app.include_router(prerequisites_router)` alongside the existing `include_router` calls (this single line inherits CORS, rate limiting, and exception handlers)
    - _Bug_Condition: isBugCondition(request) - root cause is the missing registration in app/main.py (from design)_
    - _Expected_Behavior: FastAPI resolves the family to real handlers instead of an unmatched-route 404 (from design)_
    - _Preservation: mounting through the same include_router mechanism leaves all existing routes and global middleware unchanged (from design Preservation Requirements)_
    - _Requirements: 2.1, 2.2, 2.3, 2.4, 2.5, 2.6, 3.5_

  - [x] 3.6 Add unit tests for models, endpoints, slug validation, and authorization
    - Model behavior: `PrerequisiteContent`/`PrerequisiteAnswer` defaults, `updated_at` `onupdate`, and the `(slug, row_id)` unique constraint (upsert semantics)
    - Router per-endpoint: correct status/body for each of the four endpoints for known slugs
    - Slug validation: unknown slug -> resource-specific 404; empty-default path for a never-saved known slug
    - Authorization: admin-only static PUT (403 for non-admin), member-only answer PUT (403 for admin), 401 for unauthenticated reads - mirroring documents/forum dependency behavior
    - _Requirements: 2.1, 2.2, 2.3, 2.4, 2.5, 2.6, 3.4_

  - [x] 3.7 Verify bug condition exploration test now passes
    - **Property 1: Expected Behavior** - Prerequisites API is served, not 404
    - **IMPORTANT**: Re-run the SAME test from task 1 - do NOT write a new test
    - The test from task 1 encodes the expected behavior; when it passes it confirms the expected behavior is satisfied
    - Run the bug condition exploration test from task 1 against the fixed app
    - **EXPECTED OUTCOME**: Test PASSES (known slugs return 200 with the correct shape; unknown slug returns a resource-specific 404, not an unmatched-route 404)
    - _Requirements: 2.1, 2.2, 2.3, 2.4, 2.5, 2.6_

  - [x] 3.8 Verify preservation tests still pass
    - **Property 2: Preservation** - All non-prerequisites behavior unchanged
    - **IMPORTANT**: Re-run the SAME tests from task 2 - do NOT write new tests
    - Run the preservation property tests from task 2 against the fixed app
    - **EXPECTED OUTCOME**: Tests PASS (all existing routes, root/health, unrelated 404, and middleware behavior are unchanged; no regressions)
    - Confirm no existing test file changes were required (the fix is purely additive)
    - _Requirements: 3.1, 3.2, 3.3, 3.4, 3.5_

- [x] 4. Add property-based tests for fix and preservation properties
  - **Fix property**: Generate requests across the known slug sets and (for answers) random `rowId`s and answer strings; assert PUT-then-GET round-trips and correct response shapes; never an unmatched-route 404
  - **Answer-map property**: For a set of `(rowId, answer)` PUTs on one slug, `GET .../answers` returns exactly the map of the last-written value per `rowId`
  - **Preservation property**: Generate paths/verbs OUTSIDE the prerequisites family; assert the fixed app's status/body match the unfixed baseline for those requests
  - _Requirements: 2.5, 3.1, 3.2, 3.3, 3.4, 3.5_

- [x] 5. Add integration tests (full round-trip through TestClient with real auth)
  - Static flow: admin saves `basics` content -> member loads it (200, persisted value) -> the load-error banner never triggers
  - Answer flow: member saves several answers for `cloudstore` -> reload returns the same map; a second member/session sees the shared server-side value (cross-session sharing)
  - Regression flow: run the existing backend test suite unchanged to confirm no existing route, middleware, or exception-handler behavior changed after mounting the router and adding the migration
  - _Requirements: 2.2, 2.5, 3.1, 3.2, 3.3, 3.4, 3.5_

- [x] 6. Checkpoint - Ensure all tests pass
  - Run the full backend test suite (exploration, preservation, unit, property-based, integration)
  - Confirm the exploration test now passes, all preservation tests pass, and no existing tests regressed
  - Ask the user if any questions arise
