# Forum View Button URL Fix Bugfix Design

## Overview

This design covers two related items around the forum topic "View" button shown to
logged-out visitors on the home page (`frontend/src/pages/HomePage.tsx`):

- **Bug 1 (missing port):** The "View" link for each topic is built from a hardcoded
  string `https://opcp-psmc.com/api/forum/topics/{topic.id}/publichtml`. Because the
  host is hardcoded without a port, when the app is served on a non-default port the
  produced link drops that port and the browser resolves it on the default HTTPS port
  (443). The target page then returns "page not found". The fix derives the origin
  (scheme + host + port) from the app's current site origin (`window.location.origin`)
  so the port is preserved, while keeping the path
  `/api/forum/topics/{topic.id}/publichtml` unchanged.

- **Enhancement 2 (Forum config category + toggle):** The Configuration page
  (`frontend/src/pages/AdminConfigPage.tsx`) gains a new "Forum" category placed
  immediately after "Oracle AI Providers", containing a single toggle labeled
  `Display the "View" button in the page`. The toggle uses non-inverted semantics
  (ON = button shown, OFF = button hidden) and defaults to ON when never configured.
  It is persisted with the same backend-config + frontend-read pattern used for AI
  providers (a dedicated table, a service helper module, admin GET/PUT endpoints, and
  a frontend service method). Because the "View" button is rendered for logged-out
  visitors, the setting must also be readable without authentication, so HomePage
  reads it through a public read endpoint.

The fix strategy for Bug 1 is a minimal, isolated change to the URL construction in
HomePage. The enhancement mirrors an existing, proven configuration pattern to
minimize risk and keep the codebase consistent.

## Glossary

- **Bug_Condition (C)**: The condition that triggers Bug 1 — the "View" link is built
  from the hardcoded host so the produced URL's port differs from the port of the
  current site origin.
- **Property (P)**: The desired behavior for buggy inputs — the "View" link preserves
  the current site origin's port and keeps the path
  `/api/forum/topics/{topicId}/publichtml`.
- **Preservation**: Existing behavior that must remain unchanged — in-app navigation
  from topic title/row, the authenticated "See all" behavior, the always-visible
  default of the button, existing AI provider toggle behavior, and the backend
  `/publichtml` endpoint.
- **buildViewUrl (F)**: The original link construction in HomePage using the hardcoded
  `https://opcp-psmc.com` host.
- **buildViewUrl' (F')**: The fixed link construction that derives scheme + host + port
  from `window.location.origin`.
- **Site origin**: `window.location.origin`, i.e. the scheme, host, and port the app is
  actually served on (e.g. `https://opcp-psmc.com:8443`).
- **ForumConfig**: The new backend configuration key/row storing whether the "View"
  button is displayed. Persisted in a `forum_config` table following the
  `ai_provider_config` model.
- **`view_button_enabled`**: The single Forum setting. `true` (default) = View button
  shown; `false` = hidden. Non-inverted semantics.

## Bug Details

### Bug Condition

The bug manifests whenever the "View" link is constructed from the hardcoded host
`https://opcp-psmc.com` (no port). When the app is served on a non-default port, the
produced URL omits that port, so its port differs from the port of the current site
origin, and the link resolves against the default HTTPS port (443) instead of the port
the app is reachable on. The `HomePage` component is building the href from a literal
host string rather than from the app's actual origin.

**Formal Specification:**
```
FUNCTION isBugCondition(X)
  INPUT: X of type ViewButtonContext   // { topicId, siteOrigin }
  OUTPUT: boolean

  // buildViewUrl is the original (hardcoded-host) construction.
  RETURN portOf(buildViewUrl(X.topicId)) <> portOf(X.siteOrigin)
END FUNCTION
```

Here `portOf` returns the effective port of a URL (explicit port when present, otherwise
the scheme's default), and `siteOrigin` is `window.location.origin`.

### Examples

- **Non-default port (bug):** App served at `https://opcp-psmc.com:8443`. Original link
  is `https://opcp-psmc.com/api/forum/topics/42/publichtml` → resolves to port 443.
  Expected: `https://opcp-psmc.com:8443/api/forum/topics/42/publichtml` (port 8443). The
  page returns "page not found" today; after the fix it loads.
- **Different host + port (bug):** App served at `https://staging.example.com:9000`.
  Original link points at `opcp-psmc.com` port 443 (wrong host and port). Expected: the
  link uses the current origin `https://staging.example.com:9000`.
- **Default port, matching host (not buggy):** App served at `https://opcp-psmc.com`
  (port 443). Original and fixed links are equivalent
  (`https://opcp-psmc.com/api/forum/topics/{id}/publichtml`); behavior unchanged.
- **Edge case — path preserved:** For any topic id, the path must always remain
  `/api/forum/topics/{topicId}/publichtml`; only the origin (scheme + host + port)
  changes.

## Expected Behavior

### Preservation Requirements

**Unchanged Behaviors:**
- Clicking a topic title or row for a logged-out visitor still navigates to the in-app
  route `/forum/topics/{topic.id}` (requirement 3.1).
- For authenticated users, the "See all" link is shown and the read-only "View" button
  is hidden, exactly as today (requirement 3.2).
- When the Forum toggle has never been configured, the "View" button stays visible by
  default (requirement 3.3).
- AI provider toggles continue to load, toggle, and persist exactly as today,
  unaffected by the added "Forum" category (requirement 3.4).
- The backend `/api/forum/topics/{topic_id}/publichtml` endpoint continues to return the
  topic's public HTML page unchanged (requirement 3.5).

**Scope:**
All inputs where the produced URL's port already matches the current site origin's port
(`NOT isBugCondition`) must be completely unaffected by the Bug 1 fix. This includes:
- Deployments on the default HTTPS port with the matching host.
- In-app `<Link>` navigation (topic title/row) which does not use the hardcoded host.
- The authenticated-user rendering path (no "View" button).

For Enhancement 2, all AI provider configuration reads/writes and the existing provider
UI must remain byte-for-byte behaviorally identical; the Forum category is additive.

## Hypothesized Root Cause

Based on the bug description and the current HomePage code, the cause is definite rather
than speculative, but documented here as the categories of concern:

1. **Hardcoded absolute host in the href (primary cause):** HomePage builds the link as
   ``href={`https://opcp-psmc.com/api/forum/topics/${topic.id}/publichtml`}``. The host
   is a literal string with no port, so any non-default serving port is lost. This is
   the confirmed root cause.

2. **No use of the current origin:** The component does not reference
   `window.location.origin`, so it cannot reflect the scheme/host/port the app is
   actually served on.

3. **Path vs origin coupling:** The path segment
   `/api/forum/topics/{id}/publichtml` is correct and must be preserved; only the origin
   portion is wrong. The fix must change the origin without touching the path.

4. **Secondary occurrence (out of scope for the link fix, noted for awareness):** The
   backend `/publichtml` handler embeds an `og:url` meta tag also using the hardcoded
   `https://opcp-psmc.com/...`. This does not affect navigation and is not part of Bug 1;
   it is intentionally left unchanged to respect requirement 3.5.

## Correctness Properties

Property 1: Bug Condition - View URL preserves the site origin's port

_For any_ input where the bug condition holds (isBugCondition returns true), the fixed
link construction `buildViewUrl'` SHALL produce a URL whose port equals the current site
origin's port and whose path equals `/api/forum/topics/{topicId}/publichtml`, so the
public HTML page resolves on the correct port instead of returning "page not found".

**Validates: Requirements 2.1, 2.2**

Property 2: Preservation - Non-buggy URLs and unrelated behavior unchanged

_For any_ input where the bug condition does NOT hold (isBugCondition returns false), the
fixed link construction SHALL produce the same URL as the original construction; and all
inputs not involving the "View" link (in-app topic navigation, the authenticated "See
all"/hidden-button path, AI provider toggles, and the backend `/publichtml` endpoint)
SHALL behave exactly as before.

**Validates: Requirements 3.1, 3.2, 3.4, 3.5**

Property 3: Enhancement - Forum toggle controls button visibility with non-inverted semantics and ON default

_For any_ logged-out visitor render, the "View" button SHALL be shown when the Forum
`view_button_enabled` setting is `true` (including the never-configured default) and SHALL
be hidden when the setting is `false`.

**Validates: Requirements 2.3, 2.4, 3.3**

## Fix Implementation

### Part A — Bug 1: URL construction fix (frontend)

**File**: `frontend/src/pages/HomePage.tsx`

**Change**: Replace the hardcoded href with one derived from the current site origin.

1. **Introduce an origin-based builder**: Add a small helper (module-level or inline)
   that composes the link from `window.location.origin`:
   ```
   const buildPublicHtmlUrl = (topicId: string) =>
     `${window.location.origin}/api/forum/topics/${topicId}/publichtml`;
   ```
   `window.location.origin` already includes scheme + host + explicit port when present,
   so the port is preserved automatically and no port math is needed.

2. **Use the builder in the anchor**: Change
   ``href={`https://opcp-psmc.com/api/forum/topics/${topic.id}/publichtml`}`` to
   ``href={buildPublicHtmlUrl(topic.id)}``.

3. **Preserve everything else on the anchor**: `target="_blank"`,
   `rel="noopener noreferrer"`, the styling classes, and
   `onClick={(e) => e.stopPropagation()}` remain unchanged, so the button still opens in
   a new tab and does not trigger the row's in-app navigation.

4. **Testability seam**: Keeping `buildPublicHtmlUrl` as a named function (exported from
   HomePage or a tiny `utils` helper such as `frontend/src/utils/forumLinks.ts`) lets the
   fix/preservation properties be unit- and property-tested by stubbing an origin,
   without rendering the whole page. The recommended approach is a small exported helper
   `buildPublicHtmlUrl(origin, topicId)` so the origin is an explicit argument in tests
   and defaults to `window.location.origin` in the component.

### Part B — Enhancement 2: Forum config storage + endpoints (backend)

Mirror the AI provider pattern end-to-end.

1. **Model** — new `app/models/forum_config.py` following
   `app/models/ai_provider_config.py`:
   - Table `forum_config`, keyed by a `key` string primary key (single-row-per-setting,
     like the provider-per-row layout). Columns: `key: String(50)` PK,
     `enabled: Boolean NOT NULL server_default 'true'`, `updated_at: DateTime(tz)`,
     `updated_by: Uuid FK users.id nullable`.
   - Constants: `FORUM_VIEW_BUTTON_KEY = "view_button_enabled"` and
     `DEFAULT_FORUM_CONFIG = {"view_button_enabled": True}` (default ON preserves
     today's behavior).
   - Register the model in `app/models/__init__.py` exports, matching how
     `AIProviderConfig` is exported.

2. **Service helper** — new `app/oracle/... ` equivalent placed under the forum domain:
   `app/forum/config_service.py` (mirrors `app/oracle/provider_config.py`):
   - `get_view_button_enabled(db) -> bool`: returns the stored flag, falling back to
     `DEFAULT_FORUM_CONFIG` (True) when no row exists.
   - `set_view_button_enabled(db, enabled, updated_by=None) -> bool`: upserts the row
     and returns the resulting value. Follows the upsert + commit + re-read shape of
     `set_enabled_map`.

3. **Schemas** — add to `app/admin/schemas.py` (next to the AI provider schemas):
   - `ForumConfigResponse { view_button_enabled: bool }`.
   - `ForumConfigUpdateRequest { view_button_enabled: bool }`.

4. **Admin endpoints** — add to `app/admin/router.py` next to `/ai-providers`:
   - `GET /api/admin/forum-config` (admin only, `require_admin`): returns
     `ForumConfigResponse` via `get_view_button_enabled`.
   - `PUT /api/admin/forum-config` (admin only, `@limiter.limit("30/hour")`): accepts
     `ForumConfigUpdateRequest`, calls `set_view_button_enabled`, logs the change like
     the provider endpoint, returns `ForumConfigResponse`.

5. **Public read endpoint** — because the "View" button renders for logged-out
   visitors, add an unauthenticated read used by HomePage:
   - `GET /api/forum/config` in `app/forum/router.py` returning
     `{ "view_button_enabled": <bool> }` via `get_view_button_enabled`. No auth
     dependency, consistent with the existing public forum endpoints
     (`/forum/topics/public`, `/forum/topics/{id}/public`). This keeps the admin write
     path protected while exposing only the single boolean needed to render the button.

6. **Migration** — new Alembic revision under `migrations/versions/` mirroring
   `20260930_0000_add_ai_provider_config...`:
   - Creates the `forum_config` table with the columns above.
   - Seeds one row `{"key": "view_button_enabled", "enabled": True, "updated_at": now}`
     so the default is ON.
   - `down_revision = 'add_tasks'` (current head is `add_tasks`; chain is
     `add_ai_provider_config` → `add_server_node_overrides` → `add_tasks`).
   - `downgrade()` drops the table.

### Part C — Enhancement 2: Frontend service + Config UI + HomePage read

1. **Frontend service** — `frontend/src/services/adminService.ts` (mirror the AI provider
   methods):
   - `interface ForumConfig { view_button_enabled: boolean }`.
   - `getForumConfig(): Promise<ForumConfig>` → `GET /admin/forum-config`.
   - `updateForumConfig(view_button_enabled: boolean): Promise<ForumConfig>` →
     `PUT /admin/forum-config`.
   - A public read for HomePage: add `getForumConfig` to `forumService`
     (`frontend/src/services/forumService.ts`) hitting `GET /forum/config`, since
     HomePage already imports `forumService` and this endpoint is unauthenticated.

2. **AdminConfigPage UI** — `frontend/src/pages/AdminConfigPage.tsx`:
   - Add a new card titled "Forum" (via a new translation key
     `page.adminConfig.forum.title`) rendered immediately after the "Oracle AI Providers"
     card and before the logs section.
   - Inside, render one toggle row reusing the exact provider toggle markup
     (`relative inline-flex ... peer ...` classes) labeled from
     `page.adminConfig.forum.viewButtonLabel` (`Display the "View" button in the page`).
   - State: `viewButtonEnabled: boolean`, `savingForum`, `forumFeedback`. Load via
     `adminService.getForumConfig()` in a `useEffect`, toggle updates local state, and a
     Save button calls `adminService.updateForumConfig(...)` — matching the
     load/toggle/save/feedback flow already used for providers.
   - Add translation keys for title, label, save/saving/saved/error in both the French
     and English blocks of `frontend/src/i18n/translations.ts`, mirroring the
     `page.adminConfig.aiProviders.*` entries.

3. **HomePage consumption** — `frontend/src/pages/HomePage.tsx`:
   - Add state `viewButtonEnabled` defaulting to `true` (so a failed/slow fetch keeps
     today's behavior).
   - In the existing `useEffect`, call `forumService.getForumConfig()` and set the flag;
     on error, leave it `true`.
   - Gate the "View" anchor on `!isAuthenticated && viewButtonEnabled` instead of just
     `!isAuthenticated`. The authenticated path and in-app navigation are untouched.

## Testing Strategy

### Validation Approach

Two phases: first surface counterexamples that demonstrate Bug 1 on the unfixed URL
construction, then verify the fix works and preserves existing behavior. Enhancement 2 is
validated with focused unit/integration tests plus a preservation check on the AI
provider path.

### Exploratory Bug Condition Checking

**Goal**: Surface counterexamples that demonstrate Bug 1 BEFORE implementing the fix, and
confirm the root cause (hardcoded host dropping the port).

**Test Plan**: Extract/observe the link construction and assert the produced URL's port
against a simulated site origin. Run against the UNFIXED construction (hardcoded host) to
observe failures.

**Test Cases**:
1. **Non-default port**: origin `https://opcp-psmc.com:8443`, topic `42` — assert the URL
   port is `8443` (will fail on unfixed code; produces port 443).
2. **Different host + port**: origin `https://staging.example.com:9000` — assert host and
   port match origin (will fail on unfixed code; points at `opcp-psmc.com:443`).
3. **Path integrity**: any origin — assert path is
   `/api/forum/topics/42/publichtml` (passes on unfixed code; guards against regressions
   in the fix).
4. **Default port**: origin `https://opcp-psmc.com` — assert URL equals the original
   (documents the non-buggy boundary).

**Expected Counterexamples**:
- Produced URL resolves to port 443 when the app is served on a non-default port.
- Cause: absolute hardcoded host `https://opcp-psmc.com` without port and without use of
  `window.location.origin`.

### Fix Checking

**Goal**: For all inputs where the bug condition holds, the fixed construction preserves
the site origin's port and path.

**Pseudocode:**
```
FOR ALL X WHERE isBugCondition(X) DO
  result := buildViewUrl'(X.topicId)   // uses X.siteOrigin
  ASSERT portOf(result) = portOf(X.siteOrigin)
     AND pathOf(result) = "/api/forum/topics/" + X.topicId + "/publichtml"
END FOR
```

### Preservation Checking

**Goal**: For all inputs where the bug condition does NOT hold, the fixed construction
equals the original, and unrelated behavior is unchanged.

**Pseudocode:**
```
FOR ALL X WHERE NOT isBugCondition(X) DO
  ASSERT buildViewUrl(X.topicId) = buildViewUrl'(X.topicId)
END FOR
```

**Testing Approach**: Property-based testing is recommended for preservation because it
generates many origins (schemes, hosts, with/without explicit ports) and topic ids across
the input domain, catching edge cases (default vs explicit port, IPv6/localhost hosts)
that hand-written cases might miss, and gives strong assurance that non-buggy inputs are
untouched.

**Test Plan**: Observe behavior on the UNFIXED code for default-port origins and for
in-app navigation, then encode those observations as preservation tests before applying
the fix.

**Test Cases**:
1. **Default-port equivalence**: origin `https://opcp-psmc.com` — fixed URL equals the
   original hardcoded URL.
2. **In-app navigation preserved**: clicking the topic title/row still routes to
   `/forum/topics/{id}` (the `<Link>` is not touched by the fix).
3. **Authenticated path preserved**: authenticated users see "See all" and no "View"
   button, unchanged.
4. **AI provider config preserved**: `GET`/`PUT /admin/ai-providers` return and persist
   the same results as before adding the Forum category/endpoints.

### Unit Tests

- `buildPublicHtmlUrl(origin, topicId)`: scheme/host/port/path assembly across default and
  non-default ports.
- Backend `get_view_button_enabled` returns `True` when no row exists (default) and the
  stored value when present; `set_view_button_enabled` upserts and returns the new value.
- Admin schema validation for `ForumConfigUpdateRequest`.

### Property-Based Tests

- Fix property: for generated origins with arbitrary explicit ports, the fixed URL's port
  equals the origin's port and the path is exact.
- Preservation property: for generated default-port origins, fixed URL equals original.
- Toggle property: for a generated boolean setting value (and the never-configured case),
  HomePage's render decision equals `!isAuthenticated && setting` with default `True`.

### Integration Tests

- `GET /api/forum/config` (unauthenticated) returns `{ "view_button_enabled": true }` by
  default and reflects updates made through the admin endpoint.
- `GET`/`PUT /api/admin/forum-config` require admin and round-trip the setting; a
  logged-out visitor's HomePage hides the button when the setting is `false` and shows it
  when `true`.
- Full flow: admin toggles the Forum setting off → save → logged-out home page no longer
  renders the "View" button; toggling on restores it. AI provider toggles continue to
  work in the same session.
- Backend `/api/forum/topics/{id}/publichtml` still returns the public HTML page
  unchanged (requirement 3.5).
