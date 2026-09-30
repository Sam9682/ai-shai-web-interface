# Implementation Plan

This plan covers two work items from the design:

- **Bug 1 — missing port in the "View" button URL** (frontend, `HomePage.tsx`).
- **Enhancement 2 — "Forum" configuration category + "View" button toggle** (backend
  model/service/endpoints/migration, frontend services/UI, HomePage gating).

Tasks follow the exploratory bugfix order: write the bug-condition exploration test and
the preservation tests **before** the fix, then implement, then re-run the same tests to
validate.

---

- [x] 1. Write bug condition exploration test for the "View" button URL (Bug 1)
  - **Property 1: Bug Condition** - View URL preserves the site origin's port
  - **CRITICAL**: This test MUST FAIL on unfixed code - failure confirms the bug exists
  - **DO NOT attempt to fix the test or the code when it fails**
  - **NOTE**: This test encodes the expected behavior - it will validate the fix when it passes after implementation
  - **GOAL**: Surface counterexamples that demonstrate Bug 1 (hardcoded host drops the port)
  - **Scoped PBT Approach**: Scope the property to concrete failing origins: `https://opcp-psmc.com:8443` (topic `42`) and `https://staging.example.com:9000`
  - Extract/observe the current link construction in `frontend/src/pages/HomePage.tsx` (the hardcoded ``https://opcp-psmc.com/api/forum/topics/${topic.id}/publichtml``)
  - Assert `portOf(result) === portOf(siteOrigin)` and `pathOf(result) === "/api/forum/topics/42/publichtml"` (from Bug Condition / Fix Checking in design)
  - Run test on UNFIXED code
  - **EXPECTED OUTCOME**: Test FAILS for non-default-port origins (produces port 443 instead of 8443/9000 — proves the bug exists)
  - Document counterexamples found (e.g., `https://opcp-psmc.com:8443` → URL resolves to port 443 → "page not found")
  - Mark task complete when test is written, run, and failure is documented
  - _Requirements: 1.1, 1.2, 2.1, 2.2_

- [x] 2. Write preservation property tests (BEFORE implementing the fix)
  - **Property 2: Preservation** - Non-buggy URLs and unrelated behavior unchanged
  - **IMPORTANT**: Follow observation-first methodology — observe behavior on UNFIXED code, then encode it
  - Observe: for default-port origin `https://opcp-psmc.com`, the current URL equals the original hardcoded URL
  - Observe: clicking a topic title/row routes to `/forum/topics/{id}` (the `<Link>` is untouched)
  - Observe: authenticated users see "See all" and no "View" button
  - Observe: `GET`/`PUT /api/admin/ai-providers` return and persist the same results as today
  - Write property-based test: for generated default-port origins, `buildViewUrl(topicId) === buildViewUrl'(topicId)` (from Preservation Checking in design)
  - Write example tests capturing in-app navigation, the authenticated path, and AI provider round-trip
  - Run tests on UNFIXED code
  - **EXPECTED OUTCOME**: Tests PASS (this confirms baseline behavior to preserve)
  - Mark task complete when tests are written, run, and passing on unfixed code
  - _Requirements: 3.1, 3.2, 3.4, 3.5_

- [x] 3. Fix Bug 1 — origin-based "View" button URL construction

  - [x] 3.1 Add the `buildPublicHtmlUrl(origin, topicId)` helper
    - Add an exported helper `buildPublicHtmlUrl(origin: string, topicId: string)` returning ``${origin}/api/forum/topics/${topicId}/publichtml`` (recommended: `frontend/src/utils/forumLinks.ts` so origin is an explicit test argument; may also be exported from HomePage)
    - The helper composes scheme + host + port from the passed origin, preserving any explicit port automatically (no port math)
    - _Bug_Condition: isBugCondition(X) = portOf(buildViewUrl(topicId)) <> portOf(X.siteOrigin)_
    - _Expected_Behavior: portOf(result) = portOf(siteOrigin) AND pathOf(result) = "/api/forum/topics/" + topicId + "/publichtml"_
    - _Preservation: for NOT isBugCondition(X), buildViewUrl(topicId) = buildViewUrl'(topicId)_
    - _Requirements: 2.1, 2.2_

  - [x] 3.2 Use the helper in the HomePage "View" anchor
    - Replace ``href={`https://opcp-psmc.com/api/forum/topics/${topic.id}/publichtml`}`` with ``href={buildPublicHtmlUrl(window.location.origin, topic.id)}``
    - Preserve `target="_blank"`, `rel="noopener noreferrer"`, styling classes, and `onClick={(e) => e.stopPropagation()}` on the anchor
    - _Bug_Condition: isBugCondition from design_
    - _Expected_Behavior: expectedBehavior(result) from design_
    - _Preservation: in-app `<Link>` navigation and authenticated path untouched_
    - _Requirements: 2.1, 2.2, 3.1, 3.2_

  - [x] 3.3 Add unit tests for `buildPublicHtmlUrl`
    - scheme/host/port/path assembly across default and non-default ports (from Unit Tests in design)
    - _Requirements: 2.1, 2.2_

  - [x] 3.4 Verify bug condition exploration test now passes
    - **Property 1: Expected Behavior** - View URL preserves the site origin's port
    - **IMPORTANT**: Re-run the SAME test from task 1 - do NOT write a new test
    - Run the bug condition exploration test from step 1
    - **EXPECTED OUTCOME**: Test PASSES (confirms Bug 1 is fixed — port preserved, path exact)
    - _Requirements: 2.1, 2.2_

  - [x] 3.5 Verify preservation tests still pass
    - **Property 2: Preservation** - Non-buggy URLs and unrelated behavior unchanged
    - **IMPORTANT**: Re-run the SAME tests from task 2 - do NOT write new tests
    - Run the preservation property tests from step 2
    - **EXPECTED OUTCOME**: Tests PASS (confirms no regressions in default-port URLs, in-app navigation, authenticated path, AI provider round-trip)
    - _Requirements: 3.1, 3.2, 3.4, 3.5_

- [x] 4. Enhancement 2 — Backend Forum config storage + endpoints

  - [x] 4.1 Add the `forum_config` model
    - Create `app/models/forum_config.py` mirroring `app/models/ai_provider_config.py`
    - Table `forum_config`: `key: String(50)` PK, `enabled: Boolean NOT NULL server_default 'true'`, `updated_at: DateTime(tz)`, `updated_by: Uuid FK users.id nullable`
    - Add constants `FORUM_VIEW_BUTTON_KEY = "view_button_enabled"` and `DEFAULT_FORUM_CONFIG = {"view_button_enabled": True}`
    - Register the model in `app/models/__init__.py` exports (matching `AIProviderConfig`)
    - _Requirements: 2.3, 3.3_

  - [x] 4.2 Add the Forum config service helper
    - Create `app/forum/config_service.py` mirroring `app/oracle/provider_config.py`
    - `get_view_button_enabled(db) -> bool`: returns stored flag, falling back to `DEFAULT_FORUM_CONFIG` (True) when no row exists
    - `set_view_button_enabled(db, enabled, updated_by=None) -> bool`: upsert + commit + re-read, returns resulting value
    - _Requirements: 2.3, 2.4, 3.3_

  - [x] 4.3 Add admin schemas
    - In `app/admin/schemas.py` (next to AI provider schemas): `ForumConfigResponse { view_button_enabled: bool }` and `ForumConfigUpdateRequest { view_button_enabled: bool }`
    - _Requirements: 2.3_

  - [x] 4.4 Add admin endpoints
    - In `app/admin/router.py` next to `/ai-providers`:
    - `GET /api/admin/forum-config` (admin only, `require_admin`) → `ForumConfigResponse` via `get_view_button_enabled`
    - `PUT /api/admin/forum-config` (admin only, `@limiter.limit("30/hour")`) → accepts `ForumConfigUpdateRequest`, calls `set_view_button_enabled`, logs the change like the provider endpoint, returns `ForumConfigResponse`
    - _Requirements: 2.3, 2.4_

  - [x] 4.5 Add public read endpoint
    - `GET /api/forum/config` in `app/forum/router.py` returning `{ "view_button_enabled": <bool> }` via `get_view_button_enabled`, no auth dependency (consistent with `/forum/topics/public`)
    - _Requirements: 2.3, 2.4, 3.3_

  - [x] 4.6 Add Alembic migration
    - New revision under `migrations/versions/` mirroring `20260930_0000_add_ai_provider_config...`
    - Creates `forum_config` table with the columns from 4.1
    - Seeds one row `{"key": "view_button_enabled", "enabled": True, "updated_at": now}` (default ON)
    - `down_revision = 'add_tasks'`; `downgrade()` drops the table
    - _Requirements: 2.3, 3.3_

  - [x] 4.7 Add backend unit tests
    - `get_view_button_enabled` returns `True` with no row (default) and the stored value when present
    - `set_view_button_enabled` upserts and returns the new value
    - `ForumConfigUpdateRequest` schema validation
    - _Requirements: 2.3, 2.4, 3.3_

- [x] 5. Enhancement 2 — Frontend service + Config UI + HomePage read

  - [x] 5.1 Add frontend service methods
    - In `frontend/src/services/adminService.ts`: `interface ForumConfig { view_button_enabled: boolean }`, `getForumConfig(): Promise<ForumConfig>` → `GET /admin/forum-config`, `updateForumConfig(view_button_enabled: boolean): Promise<ForumConfig>` → `PUT /admin/forum-config`
    - In `frontend/src/services/forumService.ts`: add public `getForumConfig()` → `GET /forum/config` (unauthenticated, used by HomePage)
    - _Requirements: 2.3, 2.4_

  - [x] 5.2 Add i18n keys (FR + EN)
    - In `frontend/src/i18n/translations.ts`, add to both French and English blocks: `page.adminConfig.forum.title` ("Forum"), `page.adminConfig.forum.viewButtonLabel` (`Display the "View" button in the page`), plus save/saving/saved/error keys mirroring `page.adminConfig.aiProviders.*`
    - _Requirements: 2.3_

  - [x] 5.3 Add the "Forum" card/toggle to AdminConfigPage
    - In `frontend/src/pages/AdminConfigPage.tsx`, add a new card titled from `page.adminConfig.forum.title`, rendered immediately after the "Oracle AI Providers" card and before the logs section
    - Render one toggle row reusing the exact provider toggle markup (`relative inline-flex ... peer ...`) labeled from `page.adminConfig.forum.viewButtonLabel`
    - State `viewButtonEnabled`, `savingForum`, `forumFeedback`; load via `adminService.getForumConfig()` in a `useEffect`; toggle updates local state; Save button calls `adminService.updateForumConfig(...)` with load/toggle/save/feedback flow matching providers
    - _Requirements: 2.3, 2.4, 3.4_

  - [x] 5.4 Gate the HomePage "View" button on the setting
    - In `frontend/src/pages/HomePage.tsx`, add state `viewButtonEnabled` defaulting to `true`
    - In the existing `useEffect`, call `forumService.getForumConfig()` and set the flag; on error, leave it `true`
    - Gate the "View" anchor on `!isAuthenticated && viewButtonEnabled` instead of just `!isAuthenticated`
    - _Requirements: 2.4, 3.3_

  - [x] 5.5 Add property-based test for the toggle render decision
    - **Property 3: Enhancement** - Forum toggle controls button visibility with non-inverted semantics and ON default
    - For a generated boolean setting value (and the never-configured case), assert HomePage's render decision equals `!isAuthenticated && setting` with default `True`
    - _Requirements: 2.3, 2.4, 3.3_

  - [x] 5.6 Add integration tests
    - `GET /api/forum/config` (unauthenticated) returns `{ "view_button_enabled": true }` by default and reflects updates made through the admin endpoint
    - `GET`/`PUT /api/admin/forum-config` require admin and round-trip the setting
    - Full flow: admin toggles Forum off → save → logged-out home page no longer renders the "View" button; toggling on restores it; AI provider toggles still work in the same session
    - Backend `/api/forum/topics/{id}/publichtml` still returns the public HTML page unchanged
    - _Requirements: 2.3, 2.4, 3.3, 3.4, 3.5_

- [x] 6. Checkpoint - Ensure all tests pass
  - Run the full frontend and backend test suites; ensure Bug 1 exploration test (task 1) passes, preservation tests (task 2) still pass, and all Enhancement 2 unit/property/integration tests pass
  - Verify no regressions in AI provider config and the `/publichtml` endpoint
  - Ask the user if questions arise
  - _Requirements: 2.1, 2.2, 2.3, 2.4, 3.1, 3.2, 3.3, 3.4, 3.5_
