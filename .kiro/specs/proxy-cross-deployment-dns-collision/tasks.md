# Implementation Plan

- [ ] 1. Write bug condition exploration test (cross-deployment DNS collision)
  - **Property 1: Bug Condition** - Proxied Assets Resolve Within the Same Deployment
  - **CRITICAL**: This test MUST FAIL on the unfixed configuration (`name: shai-network`) - failure confirms the collision exists
  - **DO NOT attempt to fix the test or the config when it fails** - the failure is the point
  - **NOTE**: This test encodes the expected behavior; it will validate the fix once it passes after implementation
  - **GOAL**: Surface counterexamples that demonstrate the collision (shared network real name -> ambiguous `frontend` DNS -> upstream round-robin)
  - **Scoped PBT Approach**: Bug is nondeterministic (round-robin), so scope to the concrete reproducible setup: two deployments with distinct `USER_ID` (e.g. 1 and 2) on the unfixed shared network; drive the property over a set of deployment-1-only hashed asset paths and repeated requests
  - Bring up `USER_ID=1` and `USER_ID=2` on the unfixed `docker-compose.yml` (fixed `name: shai-network`)
  - Repeatedly `curl` a deployment-1-only hashed asset through deployment 1's proxy (HTTPS port `8524`/`${HTTPS_PORT}`) and record `status` + `Content-Type`
  - From inside deployment 1's nginx container, resolve `frontend` and observe more than one container IP spanning deployments (DNS ambiguity check)
  - Capture a 404 response body and confirm it is the SPA `index.html` from a foreign build (foreign fallback confirmation)
  - Assertion the test encodes (Expected Behavior): every proxied hashed-asset request returns `status = 200`, `Content-Type = application/javascript`, and is served by the requesting deployment's own frontend (`isBugCondition(input)` from design)
  - Run test on UNFIXED code
  - **EXPECTED OUTCOME**: Test FAILS - alternating `200 application/javascript` / `404 text/html` and multiple `frontend` IPs (this is correct - it proves the collision exists)
  - Document counterexamples found (e.g. "GET /assets/index-abc123.js through deployment 1 proxy returned 404 text/html served by deployment 2's frontend")
  - Mark task complete when the test is written, run, and the failure is documented
  - _Requirements: 1.1, 1.2, 1.3_

- [ ] 2. Write preservation property tests (BEFORE implementing fix)
  - **Property 2: Preservation** - Non-Proxied and Single-Deployment Behavior Unchanged
  - **IMPORTANT**: Follow observation-first methodology - record actual behavior on the UNFIXED configuration first, then assert it holds after the fix
  - Observe and record on unfixed code, then write property-based tests capturing the patterns from the Preservation Requirements in design:
    - Direct-to-container preservation: port `8529`/`${HTTP_PORT2}` serves assets with 200 (observe status/Content-Type across a set of asset paths)
    - Intra-deployment DNS preservation: within a single deployment, `frontend`, `ai-shai-web-interface`, and `postgres` resolve via the `shai-network` alias
    - Single-deployment proxy preservation: with only one deployment running, proxied serving works error-free
    - Backend route preservation: `/api`, `/docs`, `/openapi.json`, and `/health` proxy to the backend correctly
    - Config invariants: `conf/nginx.conf` and `conf/nginx.conf.template` remain byte-for-byte unchanged (`upstream frontend { server frontend:8001; }`); every service still references the `shai-network` alias
  - Property-based testing generates many request/deployment combinations across the non-buggy input domain for stronger guarantees (cases where `isBugCondition(input)` returns false)
  - Run tests on UNFIXED code
  - **EXPECTED OUTCOME**: Tests PASS (this confirms the baseline behavior to preserve)
  - Mark task complete when tests are written, run, and passing on unfixed code
  - _Requirements: 3.1, 3.2, 3.3_

- [ ] 3. Fix for cross-deployment DNS collision (per-deployment network real name)

  - [ ] 3.1 Apply the compose network-name fix
    - In `docker-compose.yml`, top-level `networks:` block, change the network real name from the fixed value to per-deployment: `name: shai-network` -> `name: shai-network-${USER_ID:-1}`
    - Keep the compose-internal network key/alias `shai-network` unchanged; every service (`postgres`, `ai-shai-web-interface`, `ingest`, `frontend`, `nginx`) continues to reference `shai-network` in its `networks:` array with NO edits
    - **VERIFY THE CORRECT FILE**: the on-disk `docker-compose.yml` still shows `name: shai-network`; confirm the edit lands in the active file and matches the design's `networks:` block exactly
    - Make NO changes to `conf/nginx.conf` or `conf/nginx.conf.template` (`upstream frontend { server frontend:8001; }` stays as-is)
    - Make NO `container_name`, port, volume, or `depends_on` edits
    - _Bug_Condition: isBugCondition(input) - viaReverseProxy AND shared/fixed dockerNetworkName AND countDeploymentsOnNetwork > 1 (from design)_
    - _Expected_Behavior: expectedBehavior(result) - status 200, Content-Type application/javascript, servedBy sameDeploymentFrontend (from design)_
    - _Preservation: direct-to-container serving on `8529`, intra-deployment DNS via `shai-network` alias, single-deployment proxied serving, unchanged nginx config (from design Preservation Requirements)_
    - _Requirements: 2.1, 2.2, 2.3_

  - [ ] 3.2 Recreate running deployments onto the renamed network (required operational step)
    - Renaming the network real name creates a NEW Docker network; existing containers stay attached to the old shared `shai-network` until recreated
    - Recreate each already-running deployment with its `USER_ID` set: `USER_ID=<id> docker compose up -d --force-recreate`
    - Confirm each deployment's containers are now attached to `shai-network-${USER_ID}` (e.g. via `docker network inspect shai-network-<id>`)
    - Once no containers reference the old shared network, remove it: `docker network rm shai-network`
    - New deployments need no extra step; they create their per-`USER_ID` network on first `up`
    - _Requirements: 2.3_

  - [ ] 3.3 Verify bug condition exploration test now passes
    - **Property 1: Expected Behavior** - Proxied Assets Resolve Within the Same Deployment
    - **IMPORTANT**: Re-run the SAME test from task 1 - do NOT write a new test
    - The test from task 1 encodes the expected behavior; when it passes it confirms the expected behavior is satisfied
    - Run the bug condition exploration test from step 1 against the fixed, recreated deployments
    - **EXPECTED OUTCOME**: Test PASSES - every proxied hashed-asset request returns 200 `application/javascript` served by the requesting deployment; no alternating 404/200; `frontend` resolves only within the deployment
    - _Requirements: 2.1, 2.2, 2.3_

  - [ ] 3.4 Verify preservation tests still pass
    - **Property 2: Preservation** - Non-Proxied and Single-Deployment Behavior Unchanged
    - **IMPORTANT**: Re-run the SAME tests from task 2 - do NOT write new tests
    - Run the preservation property tests from step 2 against the fixed configuration
    - **EXPECTED OUTCOME**: Tests PASS - direct-to-container serving (`8529`), intra-deployment DNS, single-deployment proxied serving, and backend routes are unchanged; nginx config still byte-for-byte identical
    - Confirm all tests still pass after the fix (no regressions)
    - _Requirements: 3.1, 3.2, 3.3_

- [ ] 4. Checkpoint - Ensure all tests pass
  - Confirm the bug condition exploration test (Property 1) now passes and the preservation tests (Property 2) still pass
  - Confirm the full multi-deployment integration flow: repeated proxied asset requests always return the requesting deployment's assets (no alternating 404)
  - Confirm the regression flow: direct-to-container serving and single-deployment proxied serving remain intact end to end
  - Ensure all tests pass; ask the user if questions arise
