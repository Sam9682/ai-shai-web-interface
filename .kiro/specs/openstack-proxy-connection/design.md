# OpenStack Proxy Connection Bugfix Design

## Overview

Clicking "RETRIEVE INFO" fails because the two OpenStack outbound calls in
`OpenStackProxy._get_token` and `OpenStackProxy._list_servers`
(`app/prerequisites/openstack.py`) construct `httpx.AsyncClient(verify=verify)`
with no proxy routing. In the target environment, Keystone and Nova are reachable
**only** through a forward proxy (`http://51.178.90.72:9999/`), so a direct
connection cannot be established and httpx raises `httpx.ConnectError`. That is
mapped to `OpenStackConnectionError` → HTTP 502, and the UI shows
"Unable to reach OpenStack. Check the network and the URLs."

The fix routes both OpenStack calls through a proxy when one is configured, while
leaving direct-connection behavior unchanged when no proxy is configured. The
proxy is resolved from a single explicit application setting so behavior is
deterministic and testable, rather than relying on implicit process-environment
inheritance.

### Approach: explicit Settings value over implicit `trust_env`

httpx 0.28.1 offers two ways to route through a proxy:

1. **Implicit** — `httpx.AsyncClient` defaults to `trust_env=True`, which reads
   `http_proxy` / `https_proxy` / `HTTP_PROXY` / `HTTPS_PROXY` / `ALL_PROXY` /
   `NO_PROXY` from the process environment
   ([httpx environment variables](https://www.python-httpx.org/environment_variables/)).
2. **Explicit** — pass `proxy=<url>` on client construction
   ([httpx proxies](https://www.python-httpx.org/advanced/proxies/)). In 0.28.1
   the argument is the singular `proxy=`; the removed `proxies=` argument raises
   `TypeError`.

This design uses the **explicit** approach driven by a new `Settings` field, for
these reasons:

- **Fits the existing pattern.** Every other outbound integration in the app
  (SMTP, Stripe/PayPal, OVH/LLM endpoints, pgvector) is configured through
  fields on `app/config.py::Settings`, loaded from environment / `.env`. A
  dedicated field is consistent with that convention and self-documenting.
- **Deterministic and testable.** Relying on `trust_env` makes behavior depend
  on ambient process environment that is hard to assert in unit/property tests
  without mutating global `os.environ`. An explicit setting is injected and
  asserted directly.
- **Scoped blast radius.** A dedicated setting affects only the OpenStack calls,
  not every httpx client in the process (`ai_providers.py` also uses httpx and
  must stay unaffected).

The new field reads from `http_proxy` / `https_proxy` env vars via a pydantic
alias so the target environment's existing proxy variables are honored without
extra operator steps, but the resolved value is passed explicitly to httpx.

Content was rephrased for compliance with licensing restrictions.

## Glossary

- **Bug_Condition (C)**: The OpenStack proxy is configured (a non-empty proxy URL
  is resolved from settings) but the outbound Keystone/Nova client is built
  without that proxy, so the request attempts a non-routable direct connection.
- **Property (P)**: When a proxy is configured, both OpenStack calls SHALL be
  issued through that proxy, so Keystone/Nova become reachable and the mapped
  `{id, name, status}` rows are returned.
- **Preservation**: When no proxy is configured, both calls SHALL behave exactly
  as today (direct connection); and all existing auth (401/403), CA-certificate,
  service-error, and secret/token non-leak behavior SHALL remain unchanged.
- **`OpenStackProxy`**: The class in `app/prerequisites/openstack.py` that runs
  the two-step flow (`retrieve` → `_get_token` → `_list_servers`).
- **`_get_token`**: Method issuing `POST {auth_url}/auth/tokens`, returning the
  Keystone token from the `X-Subject-Token` header.
- **`_list_servers`**: Method issuing `GET {nova_endpoint}/servers` with the
  `X-Auth-Token` header.
- **`_build_verify`**: Helper that turns the CA-certificate PEM into an httpx
  `verify` value (`True` or an `ssl.SSLContext`) before any network call.
- **Proxy setting**: The new `Settings.OPENSTACK_HTTPS_PROXY` field (aliased to
  `https_proxy` / `http_proxy`) holding the forward-proxy URL, or empty for
  direct connection.
- **`verify`**: The httpx TLS-verification value shared by both calls.

## Bug Details

### Bug Condition

The bug manifests when a forward proxy is required to reach OpenStack (a non-empty
proxy URL is configured) but the httpx client for the Keystone token call and/or
the Nova server-list call is created without any proxy. The client then attempts
a direct connection to a host that is only reachable through the proxy, and httpx
raises `httpx.ConnectError`.

**Formal Specification:**
```
FUNCTION isBugCondition(input)
  INPUT: input of type OpenStackCall
         (fields: proxy_url, target_host_reachable_directly, client_proxy_used)
  OUTPUT: boolean

  RETURN input.proxy_url IS NON-EMPTY
         AND NOT input.target_host_reachable_directly
         AND NOT input.client_proxy_used
         // A proxy is configured and required, yet the client did not use it,
         // so the outbound Keystone/Nova request cannot connect.
END FUNCTION
```

### Examples

- **Keystone, proxy required (current defect)**: `OPENSTACK_HTTPS_PROXY` is set to
  `http://51.178.90.72:9999/`; user clicks RETRIEVE INFO. Expected: the token
  `POST` is sent through the proxy and succeeds. Actual (unfixed): client built
  without proxy → `httpx.ConnectError` → `OpenStackConnectionError` → 502.
- **Nova, proxy required (current defect)**: A token was obtained, but the Nova
  `GET .../servers` client is built without the proxy. Expected: sent through the
  proxy, server list returned. Actual (unfixed): `httpx.ConnectError` → 502.
- **Proxy unreachable (still an error, correctly)**: Proxy configured but the
  proxy host itself is down. Expected: `OpenStackConnectionError` → 502 with no
  secret/token leak. This is NOT the bug condition (proxy was used); it is
  correct error behavior.
- **No proxy configured (not the bug)**: `OPENSTACK_HTTPS_PROXY` empty and
  OpenStack directly reachable. Expected and actual: direct connection succeeds.
  `isBugCondition` is false because `proxy_url` is empty.

## Expected Behavior

### Preservation Requirements

**Unchanged Behaviors:**
- When no proxy is configured, the Keystone and Nova calls perform direct
  connections exactly as before (Req 3.1).
- Credential rejection (401/403) still raises `OpenStackAuthError` → HTTP 401,
  code `AUTH_FAILED` (Req 3.2).
- A non-empty CA certificate still builds the same TLS verification context,
  shared by both calls, and invalid PEM still raises `OpenStackCACertificateError`
  before any network call (Req 3.3).
- Non-auth error statuses and unreadable bodies still raise
  `OpenStackServiceError` → HTTP 502, code `OPENSTACK_ERROR` (Req 3.4).
- The credential secret and Keystone token remain in local variables only and are
  never logged or returned, on success or error (Req 3.5, 2.4).

**Scope:**
All inputs where a proxy is NOT configured (empty proxy setting), and all inputs
unrelated to transport routing, must be completely unaffected by this fix. This
includes:
- The direct-connection code path when the proxy setting is empty.
- Every non-OpenStack httpx client in the process (e.g. `app/oracle/ai_providers.py`),
  which must not be forced through the OpenStack proxy.
- The request payloads, headers, timeout, error mapping, and return shape of both
  OpenStack calls.

The actual expected correct behavior for the bug condition is defined in the
Correctness Properties section (Property 1).

## Hypothesized Root Cause

Based on the bug description and the source, the root cause is:

1. **Missing proxy on client construction (primary).** Both
   `httpx.AsyncClient(verify=verify)` calls omit any proxy. In the target
   environment OpenStack is only reachable via the forward proxy, so the direct
   connection attempt fails with `httpx.ConnectError`.
   - `_get_token`: `async with httpx.AsyncClient(verify=verify) as client:`
   - `_list_servers`: `async with httpx.AsyncClient(verify=verify) as client:`

2. **No proxy configuration source in the app.** `app/config.py::Settings` has no
   field for an OpenStack/forward proxy, so there is nothing to pass to httpx and
   no documented, testable control point.

3. **Implicit `trust_env` is insufficient/unreliable here.** Although httpx
   defaults `trust_env=True` and could in principle read `http_proxy`/`https_proxy`
   from the environment, that behavior is implicit, depends on how the process is
   launched (container/systemd/uvicorn worker environment may not export those
   vars to the app process), is not surfaced in the app's config, and is hard to
   assert in tests. The observed failure indicates the effective process
   environment did not route these calls through the proxy.

The fix targets cause (1) using an explicit setting introduced for cause (2),
avoiding reliance on (3).

## Correctness Properties

Property 1: Bug Condition - OpenStack calls route through the configured proxy

_For any_ input where the bug condition holds (`isBugCondition` returns true — a
non-empty proxy URL is configured and the target is reachable only via that
proxy), the fixed `OpenStackProxy` SHALL construct both the Keystone
(`_get_token`) and Nova (`_list_servers`) `httpx.AsyncClient` instances with the
configured proxy, so the requests are issued through the proxy and the flow
returns the mapped `{id, name, status}` server rows. When the proxied request
itself cannot connect, the fixed code SHALL still raise `OpenStackConnectionError`
→ HTTP 502 without leaking the credential secret or Keystone token.

**Validates: Requirements 2.1, 2.2, 2.3, 2.4**

Property 2: Preservation - Behavior unchanged without a proxy and for all existing paths

_For any_ input where the bug condition does NOT hold (`isBugCondition` returns
false — e.g. no proxy configured, or a path unrelated to transport routing), the
fixed `OpenStackProxy` SHALL produce the same result as the original: it builds
the clients with no proxy (direct connection) when the setting is empty, preserves
the credential-rejection mapping to `OpenStackAuthError` (401), preserves the
shared TLS `verify` context and the `OpenStackCACertificateError` behavior for
invalid PEM, preserves the `OpenStackServiceError` mapping for non-auth errors and
unreadable bodies, and keeps the credential secret and Keystone token out of all
logs, messages, and response bodies.

**Validates: Requirements 3.1, 3.2, 3.3, 3.4, 3.5**

## Fix Implementation

### Changes Required

Assuming the root cause analysis is correct, the fix is minimal and localized to
two files.

**File**: `app/config.py`

**Change**: Add one field to `Settings`, consistent with the existing
environment-variable-backed fields.

1. **New proxy setting**: Add
   `OPENSTACK_HTTPS_PROXY: str = ""` with a pydantic validation alias so it also
   reads the conventional `https_proxy` / `http_proxy` environment variables.
   - Default `""` means "no proxy configured" → preserves direct connections.
   - Because `Settings.model_config` uses `case_sensitive: True`, use
     `AliasChoices("OPENSTACK_HTTPS_PROXY", "https_proxy", "http_proxy",
     "HTTPS_PROXY", "HTTP_PROXY")` on the field so both the explicit app var and
     the standard lowercase/uppercase proxy vars are accepted.
   - Add a short property/helper is not required; callers read
     `settings.OPENSTACK_HTTPS_PROXY` and treat empty/whitespace as unset.

**File**: `app/prerequisites/openstack.py`

**Change**: Resolve the proxy once and pass it to both clients; add a tiny helper
so the two call sites and the tests share one resolution rule.

2. **Import settings**: `from app.config import settings` (module already imports
   `httpx` and the logger).

3. **Proxy resolver helper**: Add a module-level pure function:
   ```
   def _resolve_proxy() -> str | None:
       proxy = settings.OPENSTACK_HTTPS_PROXY
       return proxy if proxy and proxy.strip() else None
   ```
   Returning `None` yields httpx's default (no explicit proxy), preserving today's
   behavior when the setting is empty.

4. **Build client kwargs once**: In each method, compute
   `proxy = _resolve_proxy()` and construct the client with the proxy only when
   present, so the direct-connection path is byte-for-byte the current call:
   ```
   client_kwargs: dict = {"verify": verify}
   proxy = _resolve_proxy()
   if proxy is not None:
       client_kwargs["proxy"] = proxy
   async with httpx.AsyncClient(**client_kwargs) as client:
       ...
   ```
   Apply this in **both** `_get_token` and `_list_servers` so the same proxy
   routes both calls (Req 2.1, 2.2).

5. **Preserve everything else**: `verify` is still built once in `retrieve` and
   shared by both calls; request URLs, JSON payload, headers, `_HTTP_TIMEOUT`, the
   401/403 → `OpenStackAuthError`, non-2xx → `OpenStackServiceError`,
   connect/timeout → `OpenStackConnectionError` mappings, and the secret/token
   non-leak invariant are untouched. Use the singular `proxy=` argument (httpx
   0.28.1); do not use the removed `proxies=` argument.

No change is needed in `app/prerequisites/router.py`: a proxied connect failure
still surfaces as `OpenStackConnectionError` → 502, matching Req 2.4.

## Testing Strategy

### Validation Approach

Two phases: first surface counterexamples that demonstrate the bug on the unfixed
code (the client is built without a proxy even when one is configured), then verify
the fix routes both calls through the configured proxy and preserves every existing
behavior when no proxy is configured.

All tests inject the proxy value through `settings.OPENSTACK_HTTPS_PROXY`
(monkeypatched) and use httpx's `MockTransport` or a capturing fake so no real
network or real proxy is required. The credential secret and token are asserted to
never appear in captured logs, messages, or response data.

### Exploratory Bug Condition Checking

**Goal**: Surface counterexamples that demonstrate the bug BEFORE implementing the
fix, and confirm the root cause (client built with no proxy). If refuted (e.g. the
client already carries the proxy), re-hypothesize.

**Test Plan**: Patch `settings.OPENSTACK_HTTPS_PROXY` to a sentinel proxy URL and
capture how each `httpx.AsyncClient` is constructed (e.g. patch
`httpx.AsyncClient` with a spy, or route through a `MockTransport` and inspect
that no proxy transport is engaged). Run against the UNFIXED code to observe that
the proxy is absent from client construction.

**Test Cases**:
1. **Keystone client omits proxy**: With a proxy configured, `_get_token` builds a
   client with no `proxy` argument (will fail on unfixed code — assertion that the
   captured kwargs contain the proxy fails).
2. **Nova client omits proxy**: With a proxy configured, `_list_servers` builds a
   client with no `proxy` argument (will fail on unfixed code).
3. **End-to-end connect failure with proxy set**: With a proxy configured but the
   direct target unreachable, `retrieve` raises `OpenStackConnectionError` → the
   route returns 502 (reproduces the observed symptom on unfixed code).
4. **Edge — whitespace-only proxy**: A proxy value of `"   "` is treated as unset
   (may pass on unfixed code; pins the "empty means direct" rule).

**Expected Counterexamples**:
- The captured `httpx.AsyncClient` construction for both calls lacks the configured
  proxy.
- Possible causes: no proxy passed to the client, no settings field to read from,
  implicit `trust_env` not routing in the deployed process.

### Fix Checking

**Goal**: Verify that for all inputs where the bug condition holds, the fixed
function issues both calls through the configured proxy and returns the expected
result.

**Pseudocode:**
```
FOR ALL input WHERE isBugCondition(input) DO
  configureProxy(input.proxy_url)
  result := OpenStackProxy().retrieve(...)   // with mocked proxied transport succeeding
  ASSERT keystoneClientBuiltWith(proxy = input.proxy_url)
  ASSERT novaClientBuiltWith(proxy = input.proxy_url)
  ASSERT result == mappedServerRows
END FOR
```

### Preservation Checking

**Goal**: Verify that for all inputs where the bug condition does NOT hold, the
fixed function produces the same result as the original function.

**Pseudocode:**
```
FOR ALL input WHERE NOT isBugCondition(input) DO
  ASSERT originalOpenStackProxy(input) == fixedOpenStackProxy(input)
END FOR
```

**Testing Approach**: Property-based testing is recommended for preservation
because:
- It generates many inputs across the domain (empty proxy, various auth/service
  statuses, valid/invalid CA PEM, JSON/non-JSON Nova bodies).
- It catches edge cases manual unit tests miss.
- It gives strong assurance that non-proxy behavior is unchanged.

**Test Plan**: With `OPENSTACK_HTTPS_PROXY` empty, confirm on the current code that
the client is built with no proxy and that auth/CA/service/non-leak behaviors hold;
then encode those as tests that must still pass after the fix.

**Test Cases**:
1. **No-proxy direct connection preserved**: With the setting empty, both clients
   are built without a `proxy` argument; the flow behaves exactly as before.
2. **Auth rejection preserved**: A mocked 401/403 token response still raises
   `OpenStackAuthError` (regardless of proxy setting).
3. **CA handling preserved**: Invalid PEM raises `OpenStackCACertificateError`
   before any client is constructed; valid PEM yields the shared `verify` context
   used by both calls.
4. **Service error preserved**: A mocked non-auth error status and a non-JSON Nova
   body each raise `OpenStackServiceError`.
5. **Non-leak preserved**: Across success and every error path, captured logs,
   exception messages, and the response never contain the secret or the token.

### Unit Tests

- `_resolve_proxy` returns `None` for empty/whitespace and the URL otherwise.
- `_get_token` builds the client with `proxy=` when configured and without it when
  empty; token read from `X-Subject-Token`; 401/403 and non-2xx mappings.
- `_list_servers` builds the client with `proxy=` when configured and without it
  when empty; server mapping to `{id, name, status}`; connect/timeout and non-2xx
  mappings; non-JSON body handling.
- `Settings` reads `OPENSTACK_HTTPS_PROXY` and the aliased `https_proxy` /
  `http_proxy` environment variables.

### Property-Based Tests

- Generate random non-empty proxy URLs and assert both calls are constructed with
  that exact proxy (Property 1).
- Generate the full space of non-bug inputs (empty proxy, mixed auth/service
  statuses, valid/invalid CA PEM, JSON/non-JSON bodies) and assert fixed behavior
  equals original behavior (Property 2).
- Generate secrets/tokens and assert they never appear in captured logs, messages,
  or responses across all generated paths.

### Integration Tests

- Full `retrieve_servers` route flow with a proxy configured and a mocked proxied
  transport returning a token then a server list: expect 200 and the mapped rows.
- Route flow with a proxy configured but a connect failure: expect 502
  `CONNECTION_FAILED` and no secret/token in the body.
- Route flow with no proxy configured against a mocked directly-reachable
  OpenStack: expect unchanged 200 behavior.
