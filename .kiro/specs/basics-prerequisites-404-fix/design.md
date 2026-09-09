# Basics Prerequisites 404 Fix Bugfix Design

## Overview

Clicking "Basics" (and every other OPCP prerequisites page) triggers a `404 Not Found`
because the frontend targets a backend contract that was never implemented. The frontend
`prerequisitesService` issues requests against `/api/prerequisites/{slug}/content` and
`/api/prerequisites/{slug}/answers[/{rowId}]`, but `app/main.py` mounts no prerequisites
router — so FastAPI has no matching route and returns an unmatched-route 404 for the whole
family, not just "Basics".

The fix is additive: implement and mount a new `prerequisites` domain package that matches
the established conventions of the other routers in the app (auth, forum, documents, events,
admin, notifications, info, users, oracle). Concretely this means:

- A router module `app/prerequisites/router.py` with `APIRouter(prefix="/api/prerequisites")`,
  registered in `app/main.py` alongside the existing routers.
- Two persistence models (`PrerequisiteContent`, `PrerequisiteAnswer`) following the SQLAlchemy
  `Base` / `Mapped` conventions used by `app/models/document.py`, plus a new Alembic migration.
- Pydantic schemas matching the exact response/request shapes the frontend already expects
  (`{ slug, content, updated_at? }` and `{ slug, answers }`; request bodies `{ content }` and
  `{ answer }`).
- Auth/authorization wiring reusing `get_current_user`, `get_current_user_optional`, and
  `get_administrator` so behavior is consistent with existing protected routers.

Because the change only *adds* a route family, models, schemas, and a migration, every existing
route and behavior is preserved unchanged. The frontend requires no changes — the whole point is
to satisfy the contract it already targets.

## Glossary

- **Bug_Condition (C)**: The condition that triggers the bug — an HTTP request whose path matches
  the prerequisites API contract (`/api/prerequisites/{slug}/content` or
  `/api/prerequisites/{slug}/answers[/{rowId}]`) that currently has no mounted route and therefore
  returns an unmatched-route 404.
- **Property (P)**: The desired behavior — a request in the prerequisites family is served by a
  real route with a well-defined status and body shape, never an unmatched-route 404.
- **Preservation**: Every existing route (auth, forum, payments, documents, events, admin,
  notifications, info, users, oracle), the `/health` and `/` roots, global middleware (CORS, rate
  limiting), exception handlers, and the unchanged frontend contract must behave exactly as before.
- **Prerequisites_API**: The four-endpoint contract the frontend `prerequisitesService` targets:
  `GET/PUT /api/prerequisites/{slug}/content`, `GET /api/prerequisites/{slug}/answers`,
  `PUT /api/prerequisites/{slug}/answers/{rowId}`.
- **slug**: The stable page identifier in the URL path. Static archetype slugs: `basics`,
  `network-flux`. Question/answer archetype slugs: `network-checklist`, `core-control-plane`,
  `cloudstore`, `vcf`.
- **archetype**: The kind of page a slug represents — `static` (rich-text content edited by admins)
  or `qa` (question/answer rows where members persist per-row answers).
- **rowId**: The stable, page-unique row identifier from the frontend `configs.ts` (e.g.
  `nc-datacenter-access`) used as the key of a persisted client answer.
- **get_current_user / get_current_user_optional / get_administrator**: The existing auth
  dependencies in `app/auth/dependencies.py` and `app/forum/dependencies.py` that enforce bearer
  token authentication and administrator authorization consistent with other routers.

## Bug Details

### Bug Condition

The bug manifests when any HTTP request targets the Prerequisites_API contract. The FastAPI
application has no router mounted for the `/api/prerequisites/*` path family, so the request is
either not matched to any route (unmatched-route 404) — the `handleKeyPress` equivalent here being
FastAPI's route resolution, which finds no registered handler. The router is *not registered* in
`app/main.py`, the model does not exist, and no persistence layer is wired.

**Formal Specification:**
```
FUNCTION isBugCondition(request)
  INPUT: request of type HttpRequest
  OUTPUT: boolean

  RETURN request.path MATCHES "/api/prerequisites/{slug}/content"
      OR request.path MATCHES "/api/prerequisites/{slug}/answers"
      OR request.path MATCHES "/api/prerequisites/{slug}/answers/{rowId}"
     AND noRouteRegisteredFor(request.path)   // true on unfixed app for the whole family
END FUNCTION
```

### Examples

- `GET /api/prerequisites/basics/content` — expected `200 { slug: "basics", content, updated_at? }`;
  actual `404 Not Found` (unmatched route). This is the reported "Basics" symptom.
- `GET /api/prerequisites/network-flux/content` — expected `200` with the static content shape;
  actual `404 Not Found`.
- `GET /api/prerequisites/network-checklist/answers` — expected `200 { slug, answers }`; actual
  `404 Not Found`.
- `PUT /api/prerequisites/basics/content` with body `{ content }` by an admin — expected persisted
  and success status; actual `404 Not Found`, change not persisted.
- `PUT /api/prerequisites/cloudstore/answers/cs-subnet-cidr` with body `{ answer }` by a member —
  expected persisted and success status; actual `404 Not Found`.
- Edge case: `GET /api/prerequisites/basics/content` for a slug that has never been saved —
  expected a well-defined empty default (`content: ""`), not a 404.

## Expected Behavior

### Preservation Requirements

**Unchanged Behaviors:**
- Every existing route continues to resolve and respond exactly as before: auth, forum, payments,
  documents, events, admin, notifications, info, users, oracle.
- The `/health` and `/` root endpoints continue to return their current responses.
- The frontend `prerequisitesService` contract (paths, verbs, request/response shapes) is accepted
  unchanged — no frontend code is modified.
- Global middleware (CORS with `settings.cors_origins`, SlowAPI rate limiting) and the registered
  exception handlers apply to the new routes the same way they apply to existing ones (the new
  router is mounted through the same `app.include_router` mechanism, so it inherits them).
- The bearer-token auth model (`Authorization: Bearer <jwt>`) and the frontend's 401→login redirect
  interceptor behavior are unchanged; the new endpoints use the same auth dependencies.

**Scope:**
All requests that do NOT match the Prerequisites_API path family should be completely unaffected by
this fix. This includes:
- Any request to an existing router prefix (`/api/auth`, `/api/forum`, `/api/documents`, etc.).
- The root and health endpoints.
- Any unrelated unmatched path (which must still return the app's normal 404 — the fix must not
  broaden matching so that it swallows paths outside the prerequisites family).

**Note:** The expected correct behavior for buggy inputs is defined in Correctness Properties
(Property 1). This section focuses on what must NOT change.

## Hypothesized Root Cause

Based on the bug analysis and codebase investigation, the cause is confirmed structural rather than
a mislabeled slug or wrong frontend path:

1. **Missing router registration**: `app/main.py` imports and includes routers for auth, forum,
   payments, documents, events, admin, notifications, info, users, and oracle. There is no
   `from app.prerequisites.router import router as prerequisites_router` and no corresponding
   `app.include_router(...)`. FastAPI therefore has no route for `/api/prerequisites/*`.

2. **Missing domain package**: There is no `app/prerequisites/` package (router, schemas) mirroring
   the other domains such as `app/documents/`.

3. **Missing persistence model + migration**: `app/models/` has no prerequisites model, and
   `app/models/__init__.py` exports none. Persistence uses SQLAlchemy models plus Alembic migrations
   (production) with `Base.metadata.create_all` used only in tests, so a new migration is required.

4. **Intentional scope gap**: The frontend spec (`.kiro/specs/opcp-prerequisites-tabs/tasks.md`,
   "Backend scope note") explicitly deferred the backend, so the contract exists on the client but
   was never implemented server-side. This is the direct origin of the 404.

## Correctness Properties

Property 1: Bug Condition - Prerequisites API is served, not 404

_For any_ request where the bug condition holds (a request in the `/api/prerequisites/{slug}/content`
or `/api/prerequisites/{slug}/answers[/{rowId}]` family), the fixed application SHALL route it to a
real handler that returns a well-defined status and body — never an unmatched-route 404. Specifically:
a `GET .../content` for a known static slug returns `200` with `{ slug, content, updated_at? }`
(and an empty-content default `{ slug, content: "" }` when nothing has been saved yet); a
`GET .../answers` for a known qa slug returns `200` with `{ slug, answers }`; authorized `PUT`
requests persist the value and return a success status such that a subsequent `GET` returns the
persisted value; and an unsupported slug/resource returns a well-defined, resource-specific error
(a documented `404` with a structured `ErrorResponse` body) rather than an unmatched-route 404.

**Validates: Requirements 2.1, 2.2, 2.3, 2.4, 2.5, 2.6**

Property 2: Preservation - All non-prerequisites behavior unchanged

_For any_ request where the bug condition does NOT hold (any request outside the Prerequisites_API
family), the fixed application SHALL produce the same result as the original application, preserving
all existing routes (auth, forum, payments, documents, events, admin, notifications, info, users,
oracle), the `/health` and `/` roots, global middleware (CORS, rate limiting), exception handling,
and the existing authentication behavior. The frontend contract is preserved: the new endpoints
accept exactly the paths, verbs, and request/response shapes the unchanged `prerequisitesService`
already sends.

**Validates: Requirements 3.1, 3.2, 3.3, 3.4, 3.5**

## Fix Implementation

Assuming the root cause analysis is correct, the fix adds a new domain package, models, a migration,
and a single router registration line.

### Changes Required

**1. New models — File: `app/models/prerequisite.py`**

Follow the `app/models/document.py` conventions (`Base`, `Mapped`, `mapped_column`, timezone-aware
timestamps, `__repr__`, indexes).

- `PrerequisiteContent` (table `prerequisite_content`): one row per static slug.
  - `slug: Mapped[str]` — `String(100)`, unique, indexed, primary identifier for the resource.
  - `content: Mapped[str]` — `Text`, `nullable=False`, `default=""` (stores the rich-text HTML).
  - `updated_at: Mapped[datetime]` — `DateTime(timezone=True)`, `default`/`onupdate` = `now(utc)`.
  - `updated_by: Mapped[Optional[uuid.UUID]]` — `ForeignKey("users.id")`, nullable, records the
    admin who last saved (mirrors `Document.uploaded_by`, but nullable to tolerate seed/default rows).

- `PrerequisiteAnswer` (table `prerequisite_answers`): one row per `(slug, row_id)` client answer.
  - `id: Mapped[uuid.UUID]` — primary key, `default=uuid.uuid4`, `server_default="gen_random_uuid()"`.
  - `slug: Mapped[str]` — `String(100)`, indexed.
  - `row_id: Mapped[str]` — `String(255)`, indexed (the frontend `rowId`).
  - `answer: Mapped[str]` — `Text`, `nullable=False`, `default=""`.
  - `updated_at: Mapped[datetime]` — timezone-aware, `default`/`onupdate` = `now(utc)`.
  - `updated_by: Mapped[Optional[uuid.UUID]]` — `ForeignKey("users.id")`, nullable.
  - `__table_args__`: a unique constraint on `(slug, row_id)` so a PUT upserts a single row, plus an
    index on `slug` for the list-by-slug GET.

Register both in `app/models/__init__.py` (import + `__all__`) alongside the existing exports, so
Alembic autogenerate and `Base.metadata` see them.

**2. New schemas — File: `app/prerequisites/schemas.py`**

Match the exact shapes the frontend `prerequisitesService.ts` sends/expects.

- `StaticContentResponse`: `{ slug: str, content: str, updated_at: Optional[datetime] }`
  (`model_config = {"from_attributes": True}`).
- `StaticContentUpdateRequest`: `{ content: str }` (matches PUT body `{ content }`).
- `ClientAnswersResponse`: `{ slug: str, answers: dict[str, str] }` (the `answers` map is keyed by
  `row_id`; matches the frontend `Record<string, string>`).
- `ClientAnswerUpdateRequest`: `{ answer: str }` (matches PUT body `{ answer }`).
- A success schema for PUTs (e.g. `{ success: bool, slug: str }`), reusing `ErrorResponse` from
  `app.auth.schemas` for error bodies to stay consistent with existing routers.

**3. New router — File: `app/prerequisites/router.py`**

`router = APIRouter(prefix="/api/prerequisites", tags=["prerequisites"])`. Endpoints:

- `GET /{slug}/content` → `StaticContentResponse`.
  - Auth: `current_user = Depends(get_current_user)` (matches the frontend, which only fetches when
    authenticated and redirects to login on 401). Reading is allowed for any authenticated user.
  - Behavior: look up `PrerequisiteContent` by `slug`; if found return it; if the slug is a known
    static slug with no saved row yet, return an **empty-content default** `{ slug, content: "" }`
    (Req 2.2). This avoids surfacing the load-error banner for never-edited pages.
  - Slug handling: validate `slug` against the known static slug set (`basics`, `network-flux`). An
    unknown/unsupported slug returns a documented `404` `ErrorResponse` (code e.g.
    `PREREQUISITE_SLUG_NOT_FOUND`) — a resource-specific 404, not an unmatched-route 404 (Req 2.6).

- `PUT /{slug}/content` (body `StaticContentUpdateRequest`) → success schema.
  - Auth: `current_user = Depends(get_administrator)` — only admins edit static content, matching the
    frontend `canEdit = authService.isAdmin()` gate and the documents-router admin pattern.
  - Behavior: upsert the `PrerequisiteContent` row for `slug` (create if absent, else update
    `content`, `updated_at`, `updated_by`), `db.commit()`, `db.refresh()`. Subsequent GET returns
    the persisted value (Req 2.5).

- `GET /{slug}/answers` → `ClientAnswersResponse`.
  - Auth: `current_user = Depends(get_current_user)` (any authenticated user may read answers).
  - Behavior: query all `PrerequisiteAnswer` rows for `slug`, build `answers` as
    `{ row_id: answer }`; return `{ slug, answers }` (empty map when none saved). Validate `slug`
    against the known qa slug set (`network-checklist`, `core-control-plane`, `cloudstore`, `vcf`);
    unknown slug → resource-specific `404`.

- `PUT /{slug}/answers/{row_id}` (body `ClientAnswerUpdateRequest`) → success schema.
  - Auth: `current_user = Depends(get_current_user)` with an in-handler authorization check mirroring
    the frontend `canAnswer = isAuthenticated() && !isAdmin()`. Consistent with existing routers,
    reject with a structured `403` `ErrorResponse` when the caller is an administrator (admins do not
    author client answers). Alternatively a small dependency `get_answering_member` can encapsulate
    this, mirroring `get_verified_member` in `app/forum/dependencies.py`.
  - Behavior: upsert the `(slug, row_id)` row (create or update `answer`, `updated_at`,
    `updated_by`), commit, and return success. Subsequent GET reflects the value (Req 2.5).

**4. Router registration — File: `app/main.py`**

Add `from app.prerequisites.router import router as prerequisites_router` with the other router
imports, and `app.include_router(prerequisites_router)` alongside the existing `include_router`
calls. This is the single line that inherits CORS, rate limiting, and exception handlers for the new
routes (Req 3.5).

**5. Database migration — File: `migrations/versions/<new>_create_prerequisites_tables.py`**

Add an Alembic migration that creates `prerequisite_content` and `prerequisite_answers` with the
columns, unique constraints, and indexes above. `down_revision` chains onto the current head
(`add_membership_status_col`), matching the established migration pattern (server-default
`gen_random_uuid()` for UUID PKs, explicit `create_index`). `downgrade()` drops the tables and
indexes.

**6. Package init — File: `app/prerequisites/__init__.py`**

Empty package marker, matching `app/documents/__init__.py`.

### Design Decisions

- **Empty default vs 404 (Req 2.6)**: For a *known* slug with no saved data, return an empty default
  (`content: ""` / `answers: {}`) so first-visit pages render cleanly without the load-error banner.
  For an *unknown/unsupported* slug, return a structured, resource-specific `404` `ErrorResponse`.
  The two are distinguished by validating the slug against the known static/qa slug sets, which live
  as constants in the router (kept in sync with the frontend `PREREQ_NAV_ITEMS` slugs).
- **Auth consistency**: Reads require authentication (`get_current_user`) because the frontend only
  calls these endpoints from guarded routes and treats 401 as "redirect to login". Static writes
  require admin (`get_administrator`); answer writes require a non-admin authenticated member,
  mirroring the frontend gates and the forum/documents authorization conventions.
- **No frontend change**: Paths, verbs, and bodies are implemented to match `prerequisitesService.ts`
  exactly, preserving the contract (Req 3.3).

## Testing Strategy

### Validation Approach

Two phases: first, surface counterexamples demonstrating the 404 on the unfixed app; then verify the
implemented routes serve the contract correctly and that all existing behavior is preserved. Backend
tests use FastAPI's `TestClient` with the SQLite/`Base.metadata.create_all` fixture pattern already
in `tests/conftest.py`, and auth via generated JWTs / dependency overrides as other route tests do.

### Exploratory Bug Condition Checking

**Goal**: Surface counterexamples that demonstrate the bug BEFORE implementing the fix, and confirm
the root cause (no route mounted for the family). If any of these unexpectedly pass, the
"missing router" hypothesis is refuted and must be re-examined.

**Test Plan**: Using `TestClient`, issue each Prerequisites_API request against the current app and
assert the 404. Run on the UNFIXED app to observe the failures.

**Test Cases**:
1. **Basics content GET**: `GET /api/prerequisites/basics/content` returns 404 (will fail to serve on unfixed code).
2. **Network-flux content GET**: `GET /api/prerequisites/network-flux/content` returns 404 (unfixed).
3. **Answers GET**: `GET /api/prerequisites/network-checklist/answers` returns 404 (unfixed).
4. **Static content PUT**: `PUT /api/prerequisites/basics/content` returns 404 (unfixed).
5. **Answer PUT**: `PUT /api/prerequisites/cloudstore/answers/cs-subnet-cidr` returns 404 (unfixed).
6. **Edge — unknown slug GET**: `GET /api/prerequisites/does-not-exist/content` returns 404 (unfixed,
   and after the fix should be a *resource-specific* 404, distinguishing the two).

**Expected Counterexamples**:
- Every request in the family returns an unmatched-route 404 on the unfixed app.
- Cause: no `prerequisites` router registered in `app/main.py`; no model/migration.

### Fix Checking

**Goal**: Verify that for all inputs where the bug condition holds, the fixed function produces the
expected behavior (served route, correct shape, persistence round-trip).

**Pseudocode:**
```
FOR ALL request WHERE isBugCondition(request) DO
  result := fixedApp.handle(request)
  ASSERT result.status <> 404_unmatched_route
  ASSERT expectedBehavior(result)   // correct shape / status per endpoint
END FOR
```

Concrete assertions:
- `GET .../content` (known static slug) → `200`, body `{ slug, content, updated_at? }`; empty default
  `content: ""` when never saved.
- `GET .../answers` (known qa slug) → `200`, body `{ slug, answers }` (empty map when none).
- Admin `PUT .../content` → success; subsequent GET returns the saved content (round-trip).
- Member `PUT .../answers/{rowId}` → success; subsequent GET reflects the answer (round-trip).
- Unknown slug → structured, resource-specific `404` `ErrorResponse` (not unmatched-route).
- Admin `PUT .../answers/{rowId}` → structured `403`; unauthenticated read → `401` per auth deps.

### Preservation Checking

**Goal**: Verify that for all inputs where the bug condition does NOT hold, the fixed app produces the
same result as the original app.

**Pseudocode:**
```
FOR ALL request WHERE NOT isBugCondition(request) DO
  ASSERT originalApp.handle(request) = fixedApp.handle(request)
END FOR
```

**Testing Approach**: Property-based testing is recommended because it generates many non-prerequisites
paths/verbs automatically across the input domain, catches edge cases manual tests miss, and gives
strong confidence that no existing route or middleware behavior changed.

**Test Plan**: Observe behavior on the UNFIXED app for a representative set of existing routes and the
root/health endpoints, then assert identical behavior after the fix. Confirm no existing test file
changes are required (the fix is purely additive).

**Test Cases**:
1. **Existing routers preserved**: Observe that representative endpoints under each existing prefix
   (`/api/auth/...`, `/api/documents`, `/api/forum/...`, etc.) respond as before, then assert unchanged
   after the fix.
2. **Root/health preserved**: `GET /` and `GET /health` return their current bodies before and after.
3. **Unrelated 404 preserved**: A path outside the prerequisites family (e.g. `/api/nope`) still
   returns the app's normal 404 — the new router must not broaden matching.
4. **Middleware preserved**: CORS headers and rate-limit behavior on an existing route are unchanged.

### Unit Tests

- Model behavior: `PrerequisiteContent`/`PrerequisiteAnswer` defaults, `updated_at` `onupdate`, and the
  `(slug, row_id)` unique constraint (upsert semantics).
- Router per-endpoint: correct status/body for each of the four endpoints for known slugs.
- Slug validation: unknown slug → resource-specific 404; empty-default path for never-saved known slug.
- Authorization: admin-only static PUT (403 for non-admin), member-only answer PUT (403 for admin),
  401 for unauthenticated reads — mirroring documents/forum dependency behavior.

### Property-Based Tests

- **Fix property**: Generate requests across the known slug sets and (for answers) random `rowId`s and
  answer strings; assert PUT-then-GET round-trips and correct response shapes; no unmatched-route 404.
- **Preservation property**: Generate paths/verbs *outside* the prerequisites family; assert the fixed
  app's status/body match the unfixed app's for those requests.
- **Answer-map property**: For a set of `(rowId, answer)` PUTs on one slug, `GET .../answers` returns
  exactly the map of the last-written value per `rowId`.

### Integration Tests

- Full round-trip through `TestClient` with real auth tokens: admin saves `basics` content → member
  loads it (200, persisted value) → load-error banner never triggers.
- Answer flow: member saves several answers for `cloudstore` → reload returns the same map; a second
  member/session sees the shared server-side value (cross-session sharing).
- Regression flow: run the existing backend test suite unchanged to confirm no existing route,
  middleware, or exception-handler behavior changed after mounting the new router and adding the
  migration.
