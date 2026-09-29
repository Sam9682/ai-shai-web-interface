# Implementation Plan

- [x] 1. Write bug condition exploration test
  - **Property 1: Bug Condition** - OpenStack clients omit the configured proxy
  - **CRITICAL**: This test MUST FAIL on unfixed code - failure confirms the bug exists
  - **DO NOT attempt to fix the test or the code when it fails**
  - **NOTE**: This test encodes the expected behavior - it will validate the fix when it passes after implementation
  - **GOAL**: Surface counterexamples that demonstrate the bug exists (the `httpx.AsyncClient` is built with no `proxy` even when one is configured)
  - **Scoped PBT Approach**: For this deterministic bug, scope the property to concrete failing cases - patch `settings.OPENSTACK_HTTPS_PROXY` to a sentinel URL (e.g. `http://51.178.90.72:9999/`) and generate/iterate over a small set of non-empty proxy URLs
  - Patch `httpx.AsyncClient` with a spy (or route through `httpx.MockTransport`) to capture the kwargs each call site uses to construct the client
  - Test case 1 - Keystone client omits proxy: with a proxy configured, assert `OpenStackProxy._get_token` builds a client whose captured kwargs contain `proxy=<configured url>` (from Bug Condition `isBugCondition`: `proxy_url` non-empty, target not directly reachable, client proxy unused)
  - Test case 2 - Nova client omits proxy: with a proxy configured, assert `OpenStackProxy._list_servers` builds a client whose captured kwargs contain `proxy=<configured url>`
  - Test case 3 - End-to-end connect failure with proxy set: with a proxy configured but the direct target unreachable, assert `retrieve` raises `OpenStackConnectionError` and the route returns HTTP 502 (reproduces the observed symptom)
  - The test assertions should match the Expected Behavior Properties from design (Property 1): both clients constructed with the configured proxy; flow returns mapped `{id, name, status}` rows
  - Run test on UNFIXED code
  - **EXPECTED OUTCOME**: Test FAILS (this is correct - it proves the client is built without the proxy)
  - Document counterexamples found (e.g. "captured `_get_token` client kwargs = `{'verify': ...}` with no `proxy` key though `OPENSTACK_HTTPS_PROXY` was set")
  - Mark task complete when test is written, run, and failure is documented
  - _Requirements: 1.1, 1.2, 1.3, 2.1, 2.2, 2.3_

- [x] 2. Write preservation property tests (BEFORE implementing fix)
  - **Property 2: Preservation** - Behavior unchanged without a proxy and across all existing paths
  - **IMPORTANT**: Follow observation-first methodology - run the UNFIXED code with non-bug inputs, record actual outputs, then encode them as tests
  - Inject settings via monkeypatched `settings.OPENSTACK_HTTPS_PROXY` and use `httpx.MockTransport`/a capturing fake so no real network or proxy is needed
  - Observe & test case 1 - No-proxy direct connection preserved: with `OPENSTACK_HTTPS_PROXY` empty, observe both `_get_token` and `_list_servers` build a client with NO `proxy` key; write a property-based test that for all empty/whitespace-only proxy values the client kwargs contain no `proxy` (pins the "empty means direct" rule from Req 3.1)
  - Observe & test case 2 - Auth rejection preserved: a mocked 401/403 token response raises `OpenStackAuthError` → HTTP 401 code `AUTH_FAILED`, regardless of proxy setting (Req 3.2)
  - Observe & test case 3 - CA handling preserved: invalid PEM raises `OpenStackCACertificateError` before any client is constructed; valid non-empty PEM yields a shared `verify` context used by both calls (Req 3.3)
  - Observe & test case 4 - Service error preserved: a mocked non-auth error status and a non-JSON Nova body each raise `OpenStackServiceError` → HTTP 502 code `OPENSTACK_ERROR` (Req 3.4)
  - Observe & test case 5 - Non-leak preserved: across success and every error path, generate secrets/tokens and assert they never appear in captured logs, exception messages, or the response body (Req 3.5, 2.4)
  - Write property-based tests generating the full non-bug input domain (empty proxy, mixed auth/service statuses, valid/invalid CA PEM, JSON/non-JSON Nova bodies) capturing the observed behavior patterns from the Preservation Requirements
  - Property-based testing generates many test cases for stronger guarantees that non-proxy behavior is unchanged
  - Run tests on UNFIXED code
  - **EXPECTED OUTCOME**: Tests PASS (this confirms the baseline behavior to preserve)
  - Mark task complete when tests are written, run, and passing on unfixed code
  - _Requirements: 3.1, 3.2, 3.3, 3.4, 3.5, 2.4_

- [x] 3. Fix OpenStack calls to route through the configured proxy

  - [x] 3.1 Add the `OPENSTACK_HTTPS_PROXY` setting to `app/config.py`
    - Add `OPENSTACK_HTTPS_PROXY: str = ""` to `Settings`, consistent with the existing environment-variable-backed fields
    - Because `Settings.model_config` uses `case_sensitive: True`, attach `AliasChoices("OPENSTACK_HTTPS_PROXY", "https_proxy", "http_proxy", "HTTPS_PROXY", "HTTP_PROXY")` so the explicit app var and the standard lowercase/uppercase proxy vars are all accepted
    - Default `""` means "no proxy configured" so callers treat empty/whitespace as unset and direct connections are preserved
    - _Bug_Condition: isBugCondition(input) - `input.proxy_url` is non-empty (there must be a settings field to read it from)_
    - _Expected_Behavior: expectedBehavior(result) - a resolvable proxy URL exists so both calls can be routed through it_
    - _Preservation: Preservation Requirements - empty default keeps direct-connection behavior (Req 3.1)_
    - _Requirements: 2.1, 2.2_

  - [x] 3.2 Add the `_resolve_proxy` helper and wire the proxy into both calls in `app/prerequisites/openstack.py`
    - Import settings: `from app.config import settings` (module already imports `httpx` and the logger)
    - Add module-level pure helper: `def _resolve_proxy() -> str | None:` returning `settings.OPENSTACK_HTTPS_PROXY` when it is non-empty after `strip()`, else `None` (returning `None` yields httpx's default, preserving today's behavior)
    - In `_get_token`, build `client_kwargs: dict = {"verify": verify}`, compute `proxy = _resolve_proxy()`, and add `client_kwargs["proxy"] = proxy` only when `proxy is not None`; construct `async with httpx.AsyncClient(**client_kwargs) as client:` so the direct-connection path is byte-for-byte the current call
    - Apply the same pattern in `_list_servers` so the same proxy routes both calls
    - Use the singular `proxy=` argument (httpx 0.28.1); do NOT use the removed `proxies=` argument
    - Preserve everything else: `verify` still built once in `retrieve` and shared by both calls; request URLs, JSON payload, headers, `_HTTP_TIMEOUT`, the 401/403 → `OpenStackAuthError`, non-2xx → `OpenStackServiceError`, connect/timeout → `OpenStackConnectionError` mappings, and the secret/token non-leak invariant are untouched
    - No change is needed in `app/prerequisites/router.py`: a proxied connect failure still surfaces as `OpenStackConnectionError` → 502 (Req 2.4)
    - _Bug_Condition: isBugCondition(input) - proxy configured and required but client built without it_
    - _Expected_Behavior: expectedBehavior(result) - both Keystone and Nova `httpx.AsyncClient` instances constructed with the configured proxy; flow returns mapped `{id, name, status}` rows_
    - _Preservation: Preservation Requirements - direct connection when proxy empty; auth/CA/service/non-leak behavior unchanged (Req 3.1-3.5)_
    - _Requirements: 2.1, 2.2, 2.3, 2.4_

  - [x] 3.3 Verify bug condition exploration test now passes
    - **Property 1: Expected Behavior** - OpenStack calls route through the configured proxy
    - **IMPORTANT**: Re-run the SAME test from task 1 - do NOT write a new test
    - The test from task 1 encodes the expected behavior (both clients built with the configured proxy)
    - When this test passes, it confirms the expected behavior is satisfied
    - Run the bug condition exploration test from step 1
    - **EXPECTED OUTCOME**: Test PASSES (confirms the bug is fixed)
    - _Requirements: 2.1, 2.2, 2.3, 2.4_

  - [x] 3.4 Verify preservation tests still pass
    - **Property 2: Preservation** - Behavior unchanged without a proxy and across all existing paths
    - **IMPORTANT**: Re-run the SAME tests from task 2 - do NOT write new tests
    - Run the preservation property tests from step 2
    - **EXPECTED OUTCOME**: Tests PASS (confirms no regressions)
    - Confirm all tests still pass after the fix (direct connection, auth, CA, service error, non-leak all preserved)
    - _Requirements: 3.1, 3.2, 3.3, 3.4, 3.5_

- [x] 4. Add supporting unit, property-based, and integration tests

  - [x] 4.1 Add unit tests for the resolver, both methods, and settings
    - `_resolve_proxy` returns `None` for empty/whitespace and the URL otherwise
    - `_get_token` builds the client with `proxy=` when configured and without it when empty; token read from `X-Subject-Token`; 401/403 and non-2xx mappings
    - `_list_servers` builds the client with `proxy=` when configured and without it when empty; server mapping to `{id, name, status}`; connect/timeout and non-2xx mappings; non-JSON body handling
    - `Settings` reads `OPENSTACK_HTTPS_PROXY` and the aliased `https_proxy` / `http_proxy` environment variables
    - _Requirements: 2.1, 2.2, 3.1, 3.2, 3.4_

  - [x] 4.2 Add property-based tests for Property 1 and Property 2
    - Generate random non-empty proxy URLs and assert both calls are constructed with that exact proxy (Property 1)
    - Generate the full space of non-bug inputs (empty proxy, mixed auth/service statuses, valid/invalid CA PEM, JSON/non-JSON bodies) and assert fixed behavior equals original behavior (Property 2)
    - Generate secrets/tokens and assert they never appear in captured logs, messages, or responses across all generated paths
    - _Requirements: 2.1, 2.2, 2.3, 3.1, 3.2, 3.3, 3.4, 3.5_

  - [x] 4.3 Add integration tests for the `retrieve_servers` route flow
    - Full route flow with a proxy configured and a mocked proxied transport returning a token then a server list: expect HTTP 200 and the mapped rows
    - Route flow with a proxy configured but a connect failure: expect HTTP 502 `CONNECTION_FAILED` and no secret/token in the body
    - Route flow with no proxy configured against a mocked directly-reachable OpenStack: expect unchanged HTTP 200 behavior
    - _Requirements: 2.3, 2.4, 3.1_

- [x] 5. Checkpoint - Ensure all tests pass
  - Run the full test suite (exploration, preservation, unit, property-based, integration)
  - Ensure all tests pass; ask the user if questions arise
