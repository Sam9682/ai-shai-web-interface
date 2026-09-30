# Proxy Cross-Deployment DNS Collision Bugfix Design

## Overview

When multiple per-`USER_ID` deployments of this stack run on the same Docker host, the reverse proxy intermittently serves the wrong deployment's frontend. A hashed JS asset request through the proxy (HTTPS port `8524`/`${HTTPS_PORT}`) returns a `text/html` SPA `index.html` with a 404 roughly every other request, and the browser blocks the main module with a disallowed-MIME-type error.

The bug originates entirely in `docker-compose.yml`. The Docker network is declared with a fixed real name, `name: shai-network`, which is identical across every compose project. Because Docker's embedded DNS is scoped per network, and every deployment joins the *same* named network, the service name `frontend` resolves to *any* `frontend` container attached to that network — including containers belonging to other deployments. The nginx upstream `server frontend:8001;` then round-robins across those foreign frontends, which ship different builds and lack the requesting deployment's hashed assets, so they return their SPA fallback.

The fix scopes the network's real name per deployment (`name: shai-network-${USER_ID:-1}`) while keeping the compose-internal network key/alias `shai-network` that every service references. This isolates embedded DNS per deployment so `frontend` resolves only within its own network, with zero changes to nginx or service references. The change is minimal and surgical: it touches only the `networks:` block.

This design formalizes the bug condition, the correctness properties, the specific compose change, the operational step of recreating running deployments so containers rejoin the renamed network, and a two-phase validation approach (surface the collision first, then confirm the fix and preserve unaffected behaviors).

## Glossary

- **Bug_Condition (C)**: The condition that triggers the bug — an asset request travels through the reverse proxy while more than one deployment shares the same fixed Docker network, making the `frontend` service name resolve ambiguously across deployments.
- **Property (P)**: The desired behavior — every proxied request resolves and routes to the frontend of the *same* deployment and returns the correct asset (200, JS MIME type).
- **Preservation**: Existing behaviors that must remain unchanged — direct-to-container serving (port `8529`/`${HTTP_PORT2}`), intra-deployment service name resolution, and single-deployment proxied serving.
- **Deployment**: One `docker compose` project instance keyed by a distinct `USER_ID`, running its own `postgres`, `ai-shai-web-interface`, `frontend`, and `nginx` containers.
- **Network key / alias (`shai-network`)**: The compose-internal name under `networks:` that services list in their `networks:` array. It is local to the compose project regardless of the real network name.
- **Network real name (`name:` field)**: The actual Docker network name registered on the host. When identical across projects, containers from different projects share one network and one DNS namespace.
- **Embedded DNS**: Docker's per-network DNS resolver that maps service names (e.g. `frontend`) to container IPs attached to that network.
- **`docker-compose.yml`**: The compose file whose `networks:` block declares the bug (fixed `name`) and receives the fix (per-`USER_ID` `name` + `shai-network` alias).
- **`conf/nginx.conf`**: The reverse proxy config with `upstream frontend { server frontend:8001; }`; it is unchanged by the fix and relies solely on DNS being correctly scoped.

## Bug Details

### Bug Condition

The bug manifests when a request is served through the reverse proxy while two or more deployments are attached to the same fixed-name Docker network. Under this condition Docker's embedded DNS may resolve the `frontend` service name to a `frontend` container belonging to a different deployment, so the nginx upstream `server frontend:8001;` forwards the request to a foreign frontend that does not have the requested hashed asset and returns its SPA `index.html` fallback (`text/html`, 404).

**Formal Specification:**
```
FUNCTION isBugCondition(input)
  INPUT: input of type ProxyAssetRequest
  OUTPUT: boolean

  RETURN input.viaReverseProxy = true
         AND input.dockerNetworkName is shared/fixed across deployments
         AND countDeploymentsOnNetwork(input.dockerNetworkName) > 1
END FUNCTION
```

### Examples

- **Foreign frontend serves fallback (bug)**: With deployments `USER_ID=1` and `USER_ID=2` both on `shai-network`, a browser requests `/assets/index-abc123.js` through deployment 1's proxy. DNS resolves `frontend` to deployment 2's container. Deployment 2's build has no `index-abc123.js`, so it returns `index.html` with `text/html` and 404. Expected: deployment 1's frontend returns `index-abc123.js` with 200 and `application/javascript`.
- **Alternating pattern (bug)**: Repeated requests for the same hashed asset round-robin between deployment 1 (200, correct asset) and deployment 2 (404, `text/html`), producing the intermittent MIME-block error and blank page.
- **Module blocked (bug symptom)**: The main JS module response is the SPA `index.html` (`text/html`); the browser refuses to execute it and renders an empty page.
- **Single deployment (edge case, not the bug)**: With only `USER_ID=1` running, `frontend` resolves only to deployment 1's container even on the fixed network, and assets load correctly — the bug does not manifest.

## Expected Behavior

### Preservation Requirements

**Unchanged Behaviors:**
- Requests hitting the frontend container directly on port `8529`/`${HTTP_PORT2}` must continue to serve assets reliably with 200.
- Intra-deployment service name resolution via the `shai-network` alias must continue to work for `frontend`, `ai-shai-web-interface`, `postgres`, and `nginx`.
- Single-deployment proxied serving must continue to work without error.
- The nginx configuration (`conf/nginx.conf`, `conf/nginx.conf.template`) and the `frontend` service definition remain byte-for-byte unchanged.

**Scope:**
All inputs that do NOT satisfy the bug condition should be completely unaffected by this fix. This includes:
- Direct-to-container requests that never pass through the reverse proxy.
- Any request when only a single deployment is running.
- Backend/API, `/docs`, `/openapi.json`, and `/health` proxying, which route to `ai-shai-web-interface` and are governed by the same intra-deployment DNS.

**Note:** The expected correct behavior for buggy inputs is defined in the Correctness Properties section (Property 1). This section documents what must NOT change.

## Hypothesized Root Cause

Based on the confirmed analysis, the cause is a single declaration in `docker-compose.yml`:

1. **Fixed network real name shared across deployments (confirmed root cause)**: The `networks:` block declares
   ```yaml
   networks:
     shai-network:
       driver: bridge
       name: shai-network
   ```
   The `name: shai-network` field forces the *real* Docker network name to be identical for every compose project. All per-`USER_ID` deployments therefore attach to one shared network with one shared DNS namespace.

2. **Ambiguous service-name resolution**: Because containers named `frontend` from multiple deployments live on the same network, Docker's embedded DNS resolves the `frontend` service name to a set of container IPs spanning deployments.

3. **Upstream round-robin across deployments**: `upstream frontend { server frontend:8001; }` in `conf/nginx.conf` relies on that DNS name; nginx forwards to whichever container DNS returns, so requests round-robin across deployments' frontends.

4. **Build mismatch produces the SPA fallback**: A foreign deployment's frontend ships a different Vite build with different hashed filenames, so it cannot serve the requested asset and returns its `index.html` SPA fallback (`text/html`, 404).

The root cause does not lie in nginx, the frontend image, or the Vite build — those are correct in isolation. It lies solely in the shared network real name collapsing multiple deployments into one DNS namespace.

## Correctness Properties

Property 1: Bug Condition - Proxied assets resolve within the same deployment

_For any_ input where the bug condition holds (isBugCondition returns true) — a request served through the reverse proxy while multiple deployments would otherwise share the network — the fixed configuration SHALL resolve the `frontend` service name only to the requesting deployment's own frontend container, route the request there, and return the requested hashed asset with HTTP status 200 and a JavaScript MIME type (`application/javascript`).

**Validates: Requirements 2.1, 2.2, 2.3**

Property 2: Preservation - Non-proxied and single-deployment behavior unchanged

_For any_ input where the bug condition does NOT hold (isBugCondition returns false) — direct-to-container requests, single-deployment operation, and intra-deployment service-name resolution — the fixed configuration SHALL produce the same result as the original configuration, preserving direct serving on port `8529`/`${HTTP_PORT2}`, intra-deployment DNS resolution via the `shai-network` alias, and error-free single-deployment proxied serving.

**Validates: Requirements 3.1, 3.2, 3.3**

## Fix Implementation

### Changes Required

The confirmed change scopes the network's real name per deployment while keeping the compose-internal alias that services reference.

**File**: `docker-compose.yml`

**Section**: the top-level `networks:` block

**Specific Changes**:

1. **Per-deployment real network name**: Change the `name` field from the fixed value to a per-`USER_ID` value so each compose project registers a distinct Docker network:
   ```yaml
   networks:
     shai-network:
       driver: bridge
       name: shai-network-${USER_ID:-1}
   ```
   - The `USER_ID:-1` default matches the defaulting convention used throughout the file (container names, ports).

2. **Preserve the compose-internal alias**: Keep the network key `shai-network` unchanged. Every service continues to reference `shai-network` in its `networks:` array (`postgres`, `ai-shai-web-interface`, `ingest`, `frontend`, `nginx`) with no edits. The compose key is local to the project, so intra-deployment resolution is unaffected while the real network becomes unique.

3. **No nginx changes**: `conf/nginx.conf` and `conf/nginx.conf.template` keep `upstream frontend { server frontend:8001; }`. Correctness now derives from DNS being scoped to a single deployment's network.

4. **No service reference changes**: No `container_name`, port, volume, or `depends_on` edits are required.

### Operational Step (Required for Existing Deployments)

Renaming the network real name creates a *new* Docker network; existing containers remain attached to the old `shai-network`. Each already-running deployment MUST be recreated so its containers join the renamed network:

- Recreate per deployment with the deployment's `USER_ID` set, for example:
  ```
  USER_ID=<id> docker compose up -d --force-recreate
  ```
- After all deployments are recreated, the shared old `shai-network` becomes unused and can be removed (`docker network rm shai-network`) once no containers reference it.
- New deployments require no extra step; they create their per-`USER_ID` network on first `up`.

## Testing Strategy

### Validation Approach

The strategy is two-phase: first reproduce the DNS collision on the *unfixed* configuration to confirm the round-robin root cause, then apply the fix and verify both that proxied assets resolve within the same deployment (fix checking) and that unaffected behaviors are unchanged (preservation checking). Because this bug lives in Docker networking and compose configuration, tests are primarily integration/system checks plus a config assertion; property-based testing is applied over the request/deployment input space where feasible.

### Exploratory Bug Condition Checking

**Goal**: Surface counterexamples that demonstrate the collision BEFORE applying the fix, and confirm the root cause (shared network real name → ambiguous `frontend` DNS → upstream round-robin). If the collision cannot be reproduced this way, re-hypothesize.

**Test Plan**: Bring up two deployments with distinct `USER_ID` values on the *unfixed* `docker-compose.yml` (fixed `name: shai-network`). From one deployment's proxy, repeatedly request a hashed asset that exists only in that deployment's build, and inspect status and `Content-Type`. Independently, resolve the `frontend` name from inside a container to observe multiple deployment IPs.

**Test Cases**:
1. **Cross-deployment asset fetch**: Start `USER_ID=1` and `USER_ID=2`; repeatedly `curl` a deployment-1-only hashed asset through deployment 1's proxy and observe alternating `200 application/javascript` / `404 text/html` (will fail/flake on unfixed code).
2. **DNS ambiguity check**: From within deployment 1's nginx container, resolve `frontend` and observe more than one container IP spanning deployments (will show collision on unfixed code).
3. **Foreign fallback confirmation**: Capture a 404 response body and confirm it is the SPA `index.html` from a foreign build (will fail on unfixed code).
4. **Single-deployment control (edge case)**: With only `USER_ID=1` running on unfixed code, confirm assets load correctly — establishes that the collision requires more than one deployment.

**Expected Counterexamples**:
- Hashed asset requests intermittently return `text/html` with 404 instead of the JS asset.
- `frontend` resolves to container IPs from more than one deployment.
- Possible causes ruled in/out: shared network real name (root cause), not nginx config, not the Vite build.

### Fix Checking

**Goal**: Verify that for all inputs where the bug condition holds, the fixed configuration routes to the same deployment's frontend and returns the correct asset.

**Pseudocode:**
```
FOR ALL input WHERE isBugCondition(input) DO
  result := serveAsset_fixed(input)
  ASSERT result.status = 200
     AND result.contentType = "application/javascript"
     AND result.servedBy = sameDeploymentFrontend(input)
END FOR
```

**Test Plan**: With the fix applied and both deployments recreated onto their per-`USER_ID` networks, repeat the exploratory requests and assert every request returns the requesting deployment's own asset.

### Preservation Checking

**Goal**: Verify that for all inputs where the bug condition does NOT hold, the fixed configuration produces the same result as the original.

**Pseudocode:**
```
FOR ALL input WHERE NOT isBugCondition(input) DO
  ASSERT serveAsset_original(input) = serveAsset_fixed(input)
END FOR
```

Where the original (**F**) uses `name: shai-network` and the fixed (**F'**) uses `name: shai-network-${USER_ID:-1}`.

**Testing Approach**: Property-based testing is recommended for preservation checking because:
- It generates many request/deployment combinations across the non-buggy input domain automatically.
- It catches edge cases (varied asset paths, backend routes, single vs. multiple deployments) that hand-written cases might miss.
- It provides strong evidence that non-proxied and single-deployment behavior is unchanged.

**Test Plan**: Observe behavior on the current configuration for direct-to-container requests, intra-deployment resolution, and single-deployment proxying; then assert identical behavior after the fix.

**Test Cases**:
1. **Direct-to-container preservation**: Confirm port `8529`/`${HTTP_PORT2}` serves assets with 200 before and after the fix.
2. **Intra-deployment DNS preservation**: Confirm `frontend`, `ai-shai-web-interface`, and `postgres` resolve within a single deployment via the `shai-network` alias before and after the fix.
3. **Single-deployment proxy preservation**: Confirm single-deployment proxied serving works error-free before and after the fix.
4. **Backend route preservation**: Confirm `/api`, `/docs`, `/openapi.json`, and `/health` continue to proxy to the backend correctly.

### Unit Tests

- Assert `docker-compose.yml` declares the network real name as `shai-network-${USER_ID:-1}` and retains the `shai-network` compose key.
- Assert every service still references the `shai-network` alias in its `networks:` array.
- Assert `conf/nginx.conf` and `conf/nginx.conf.template` are unchanged (`upstream frontend { server frontend:8001; }`).

### Property-Based Tests

- Over a generated set of hashed asset paths requested through the proxy with multiple deployments running, assert each response is served by the requesting deployment (200, JS MIME type).
- Over generated non-proxied / single-deployment requests, assert responses match the original configuration (preservation).
- Over generated `USER_ID` values, assert each deployment registers a distinct real network name and no two deployments share a network.

### Integration Tests

- Full multi-deployment flow: start two deployments with distinct `USER_ID`, recreate onto per-`USER_ID` networks, and verify repeated proxied asset requests always return the requesting deployment's assets (no alternating 404).
- Recreation flow: verify that after `docker compose up -d --force-recreate`, containers are attached to `shai-network-${USER_ID}` and the old shared network is no longer referenced.
- Regression flow: verify direct-to-container serving and single-deployment proxied serving remain intact end to end.
