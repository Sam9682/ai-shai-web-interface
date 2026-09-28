# Implementation Plan

- [x] 1. Write bug condition exploration test
  - **Property 1: Bug Condition** - FormData Uploads Use Multipart Content Type
  - **CRITICAL**: This test MUST FAIL on unfixed code - failure confirms the bug exists
  - **DO NOT attempt to fix the test or the code when it fails**
  - **NOTE**: This test encodes the expected behavior - it will validate the fix when it passes after implementation
  - **GOAL**: Surface counterexamples that demonstrate the bug exists and confirm/refute the root cause analysis
  - **Scoped PBT Approach**: Property over the bug-condition domain: for any request config whose `data` is a `FormData` instance (with the client's default `Content-Type: application/json`), run the request interceptor and assert the resulting `Content-Type` does not remain `application/json`. Generate varied FormData bodies (different fields/files) and varied per-request configs; scope concrete cases such as `documentService.uploadDocument(file, 'private')` for reproducibility.
  - Bug condition (from design `isBugCondition`): `isFormData(input.data) AND input.headers["Content-Type"] = "application/json"`
  - Create a new test file `frontend/src/services/api.test.ts` (co-located with `api.ts`), importing the request interceptor / exercising the shared axios client so the interceptor runs against a synthetic config
  - Test that after the request interceptor runs on a `FormData` config, `config.headers['Content-Type']` is not `'application/json'` and no forced JSON content type remains so the browser can add the `multipart/form-data` boundary
  - Include the upload-endpoint case: simulate `documentService.uploadDocument(file)` building a `FormData` with `file` and `access_level`, and assert the outgoing request would not carry `application/json`
  - Run test on UNFIXED code
  - **EXPECTED OUTCOME**: Test FAILS (this is correct - it proves the bug exists; the JSON content type is retained on a FormData body)
  - Document counterexamples found to understand root cause (e.g. "FormData upload config retains `Content-Type: application/json` instead of a multipart content type")
  - Mark task complete when test is written, run, and failure is documented
  - _Requirements: 1.1, 1.2, 2.1, 2.2_

- [x] 2. Write preservation property tests (BEFORE implementing fix)
  - **Property 2: Preservation** - Non-FormData Requests Are Unchanged
  - **IMPORTANT**: Follow observation-first methodology - run the UNFIXED interceptor on non-bug-condition inputs, record actual outputs, then encode those outputs as property-based assertions
  - Non-bug condition (from design): `NOT (isFormData(input.data) AND Content-Type = "application/json")` — i.e. JSON/non-FormData bodies
  - Observe on UNFIXED code and capture:
    - JSON/plain-object request body retains `Content-Type: application/json` after the request interceptor runs
    - The `Authorization: Bearer <token>` header is attached when `localStorage` holds an `access_token` (for both JSON and FormData configs), and is absent when no token is present
    - A 401 response on a protected (non-auth) endpoint clears the stored token and redirects to `/login`; a 401 on `/auth/login` or `/auth/login/2fa` does NOT redirect and is surfaced to the caller
  - Write property-based tests capturing the observed patterns from the Preservation Requirements:
    - For all non-FormData request configs (varied URLs, methods, header presence), the interceptor's resulting `Content-Type` and `Authorization` handling equals the original behavior
    - For all token/no-token states, the `Authorization` header behavior is unchanged across FormData and JSON requests
    - The response interceptor: for all protected-endpoint 401s the token is cleared and redirect occurs; for all `AUTH_ENDPOINTS` 401s it does not
  - Run tests on UNFIXED code
  - **EXPECTED OUTCOME**: Tests PASS (this confirms the baseline behavior to preserve)
  - Mark task complete when tests are written, run, and passing on unfixed code
  - _Requirements: 3.1, 3.2, 3.3_

- [x] 3. Fix for forced JSON content type on FormData uploads

  - [x] 3.1 Implement the fix in the request interceptor
    - In `frontend/src/services/api.ts`, inside the existing `api.interceptors.request.use` success handler, after attaching the `Authorization` header, detect `config.data instanceof FormData`
    - When the body is `FormData`, `delete config.headers['Content-Type']` and defensively remove the lowercase `content-type` variant if present, so axios omits the header and the browser generates `multipart/form-data; boundary=...`
    - Leave non-FormData (JSON) requests untouched so the instance default `Content-Type: application/json` continues to apply
    - Do not alter the token-attaching branch, the `AUTH_ENDPOINTS` list, `isAuthEndpoint`, or the response interceptor
    - _Bug_Condition: isBugCondition(input) = isFormData(input.data) AND input.headers["Content-Type"] = "application/json" (from design)_
    - _Expected_Behavior: FormData requests are sent with a browser-generated multipart/form-data content type (with boundary) and never application/json (expectedBehavior from design)_
    - _Preservation: JSON requests keep application/json; Authorization header attach logic and 401 clear-token-and-redirect behavior unchanged (Preservation Requirements from design)_
    - _Requirements: 2.1, 2.2, 2.3, 3.1, 3.2, 3.3_

  - [x] 3.2 Verify bug condition exploration test now passes
    - **Property 1: Expected Behavior** - FormData Uploads Use Multipart Content Type
    - **IMPORTANT**: Re-run the SAME test from task 1 - do NOT write a new test
    - The test from task 1 encodes the expected behavior; when it passes it confirms the expected behavior is satisfied
    - Run the bug condition exploration test from step 1
    - **EXPECTED OUTCOME**: Test PASSES (confirms the FormData body no longer carries `application/json` and the browser can set the multipart boundary — bug is fixed)
    - _Requirements: 2.1, 2.2 (Expected Behavior / Property 1 from design)_

  - [x] 3.3 Verify preservation tests still pass
    - **Property 2: Preservation** - Non-FormData Requests Are Unchanged
    - **IMPORTANT**: Re-run the SAME tests from task 2 - do NOT write new tests
    - Run the preservation property tests from step 2
    - **EXPECTED OUTCOME**: Tests PASS (JSON bodies still send `application/json`, the `Authorization` header still attaches, and 401 handling is unchanged — no regressions)
    - _Requirements: 3.1, 3.2, 3.3_

- [x] 4. Checkpoint - Ensure all tests pass
  - Run the full frontend test suite (single run, e.g. `vitest --run`) and confirm the new exploration and preservation tests plus the existing suite all pass
  - Confirm Property 1 (bug fixed) and Property 2 (no regressions) both hold
  - Ensure all tests pass, ask the user if questions arise
  - _Requirements: 2.1, 2.2, 2.3, 3.1, 3.2, 3.3, 3.4, 3.5_
