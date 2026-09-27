# Implementation Plan

- [x] 1. Write bug condition exploration tests (BEFORE implementing the fix)
  - **Property 1: Bug Condition** - Editable and Persistable "Réponse client" for Any Authenticated User
  - **CRITICAL**: These tests MUST FAIL on the unfixed code - failure confirms the bug exists (authenticated administrators are wrongly blocked on QA tabs)
  - **DO NOT attempt to fix the tests or the code when they fail** at this stage
  - **NOTE**: These tests encode the expected behavior - they will validate the fix once they pass after implementation
  - **GOAL**: Surface counterexamples showing the two mirrored gates (`canAnswer` includes `!isAdmin()`; backend `get_answering_member` blocks administrators)
  - **Scoped PBT Approach**: The bug condition is deterministic (`X.tab.kind = 'qa' AND isAuthenticated(X.user) AND NOT canAnswer(X.user)`, i.e. authenticated administrators). Scope the property to the concrete failing cases: an authenticated administrator across the QA slugs `network-checklist`, `core-control-plane`, `cloudstore`, `vcf`.
  - Frontend (`QuestionAnswerForm.test.tsx`): render `QuestionAnswerForm` as an authenticated administrator (`isAuthenticated() === true`, `isAdmin() === true`) for each QA slug and assert every "Réponse client" input is editable — NOT `readOnly`, NOT `disabled`, and without the `cursor-not-allowed` (`READONLY_FIELD_CLASS`) style. **EXPECTED OUTCOME on unfixed code: FAILS** (input renders `readOnly`/`disabled`).
  - Backend (`tests/test_prerequisites_answers_authz.py` / new fix-checking test): issue a PUT to `.../installations/{installation_id}/{slug}/answers/{row_id}` as an authenticated administrator for each QA slug and assert HTTP 200 and that the value is persisted (upserted with `updated_by` set). **EXPECTED OUTCOME on unfixed code: FAILS with HTTP 403 `ANSWER_NOT_ALLOWED_FOR_ADMIN`**.
  - VCF overlay: with an admin-entered non-empty answer for a mapped VCF row, assert `buildVcfDomainJson` overlays that value onto the domain template (fails indirectly on unfixed code because no admin answer can be saved).
  - Document the counterexamples found (e.g. "authenticated admin sees `node_uuids (management)` input `disabled` with not-allowed cursor"; "admin PUT to `cloudstore` returns 403 `ANSWER_NOT_ALLOWED_FOR_ADMIN`") to confirm the root cause
  - Mark this task complete when the tests are written, run, and their failures are documented
  - _Requirements: 1.1, 1.2, 1.3, 1.4, 2.1, 2.2, 2.3, 2.6_

- [x] 2. Write preservation property tests (BEFORE implementing the fix)
  - **Property 2: Preservation** - Non-Buggy Inputs Behave Identically
  - **IMPORTANT**: Follow the observation-first methodology — run the UNFIXED code for non-bug-condition inputs, record actual outputs, then write property-based tests asserting those observed outputs across the input domain
  - **Non-bug condition** (`isBugCondition` returns false): authenticated non-admin members, unauthenticated visitors, non-QA tabs, static-content saves, installation CRUD, VCF structure/type rules, and 404 semantics
  - Frontend preservation:
    - Observe on unfixed code: an authenticated non-admin member (`isAuthenticated() === true`, `isAdmin() === false`) sees each "Réponse client" input editable and can save on blur; write/keep a property-based test asserting this for arbitrary `QuestionFormConfig` sections/rows.
    - Observe on unfixed code: an unauthenticated visitor (`isAuthenticated() === false`) sees each "Réponse client" input `readOnly`/`disabled`; write a property-based test asserting it stays read-only.
  - Backend preservation:
    - Observe on unfixed code: an authenticated non-admin member PUT to a QA answers route returns success and upserts the row (shared, per-installation, last-write-wins, `updated_by` recorded); a PUT with a missing/invalid Bearer token returns 401.
    - Observe on unfixed code: unknown installation id / unknown slug returns the structured 404 (`INSTALLATION_NOT_FOUND` / `PREREQUISITE_SLUG_NOT_FOUND`) on both load and save.
    - Observe on unfixed code: static-content PUT and installation CRUD remain admin-only (403 for members).
  - VCF preservation: generate arbitrary `answers` maps and assert `buildVcfDomainJson` output equals the overlay of non-empty mapped answers onto the template — same key set, non-customer defaults (`debug`, `openstack_*`, `pairing_source`), and JSON type coercion (booleans stay boolean, quoted numeric fields stay strings), for both `management` and `workload` domains.
  - Servers preservation: the "Servers nodes" tab (`ServersTable`) stays a read-only inventory with no editable "Réponse client" fields.
  - Run all preservation tests on the UNFIXED code
  - **EXPECTED OUTCOME**: Tests PASS (this confirms the baseline behavior to preserve)
  - Mark this task complete when the tests are written, run, and passing on unfixed code
  - _Requirements: 3.1, 3.2, 3.3, 3.4, 3.5, 3.6, 3.7_

- [x] 3. Fix: allow any authenticated user (administrators included) to edit and persist "Réponse client" values

  - [x] 3.1 Relax the frontend editable gate in `QuestionAnswerForm.tsx`
    - Change `const canAnswer = authService.isAuthenticated() && !authService.isAdmin();` to `const canAnswer = authService.isAuthenticated();`
    - Leave the rendering wiring unchanged — `readOnly={!canAnswer}`, `disabled={!canAnswer}`, `className={canAnswer ? FIELD_CLASS : READONLY_FIELD_CLASS}`, and the `onBlur` guard (`if (canAnswer) void saveAnswer(...)`) all derive from `canAnswer`
    - Update the component doc comment that states the field is "editable only for authenticated non-admin members" to reflect "editable for any authenticated user"
    - _Bug_Condition: isBugCondition(X) where X.tab.kind = 'qa' AND isAuthenticated(X.user) AND NOT canAnswer(X.user) (authenticated administrators)_
    - _Expected_Behavior: expectedBehavior(result) — field editable (not readOnly, not disabled, no not-allowed cursor), typed value captured in state, and value savable per installation_
    - _Preservation: Preservation Requirements from design — unauthenticated visitors stay read-only; non-admin members unchanged_
    - _Requirements: 2.1, 2.2, 2.3, 2.6_

  - [x] 3.2 Relax the backend authorization in `app/prerequisites/router.py`
    - In `get_answering_member`, delete the `if current_user.role == UserRole.ADMINISTRATOR:` branch that raises HTTP 403 `ANSWER_NOT_ALLOWED_FOR_ADMIN`, so the dependency authorizes any authenticated user
    - Keep the dependency on `get_current_user` so unauthenticated/invalid-token requests still get 401 before reaching it
    - Keep the `update_answer` handler recording `updated_by=current_user.id` (last editor), preserving shared last-write-wins semantics
    - Update the `get_answering_member` docstring to state any authenticated user (administrators included) may save answers
    - Clean up the now-unused `ANSWER_NOT_ALLOWED_FOR_ADMIN` error code usage and the `UserRole` import if no longer referenced elsewhere in the file
    - _Bug_Condition: isBugCondition(X) where X.action = 'save' and X.user is an authenticated administrator on a QA slug_
    - _Expected_Behavior: expectedBehavior(result) — admin PUT accepted (HTTP 200) and value persisted per installation with updated_by set_
    - _Preservation: Preservation Requirements from design — non-admin member saves, 401 on missing/invalid token, structured 404s, admin-only static content and installation CRUD all unchanged_
    - _Requirements: 2.3, 3.1, 3.6_

  - [x] 3.3 Update existing tests that encode the old admin-blocked behavior
    - `tests/test_prerequisites_answers_authz.py`: replace the `TestAdminAnswerForbidden` expectations (admin PUT -> 403 `ANSWER_NOT_ALLOWED_FOR_ADMIN`, admin write does not persist) with the new contract — an authenticated admin PUT to each QA slug returns 200 and persists the row; update the module docstring accordingly
    - `tests/test_prerequisites_unit.py`: update `test_put_answer_forbidden_for_admin` (admin answer PUT -> 403) to reflect that admin answer PUT now succeeds; update the module docstring line describing "member-only answer PUT (403 for admin ... `ANSWER_NOT_ALLOWED_FOR_ADMIN`)"
    - `frontend/src/components/prerequisites/QuestionAnswerForm.test.tsx`: update the `setAuth` helper comment and the render assertions that model an authenticated admin as `canAnswer === false` (expecting `readonly`/`disabled`); after the fix an authenticated admin is editable, and only an unauthenticated visitor is read-only
    - _Requirements: 2.1, 2.3, 3.1_

  - [x] 3.4 Verify the bug condition exploration tests now pass
    - **Property 1: Expected Behavior** - Editable and Persistable "Réponse client" for Any Authenticated User
    - **IMPORTANT**: Re-run the SAME tests from task 1 — do NOT write new tests
    - Run the frontend admin-render editable test, the backend admin-save persists test, and the VCF admin-answer overlay test from task 1
    - **EXPECTED OUTCOME**: Tests PASS (confirms the bug is fixed for all bug-condition inputs)
    - _Requirements: 2.1, 2.2, 2.3, 2.6 (Expected Behavior Properties / Property 1 from design)_

  - [x] 3.5 Verify the preservation tests still pass
    - **Property 2: Preservation** - Non-Buggy Inputs Behave Identically
    - **IMPORTANT**: Re-run the SAME tests from task 2 — do NOT write new tests
    - Run the preservation property tests from task 2 (non-admin member editing, unauthenticated read-only, VCF structure/type coercion, 401, structured 404, admin-only static/CRUD, Servers read-only)
    - **EXPECTED OUTCOME**: Tests PASS (confirms no regressions)
    - _Requirements: 3.1, 3.2, 3.3, 3.4, 3.5, 3.6, 3.7_

- [x] 4. Checkpoint - Ensure all tests pass
  - Run the full frontend and backend test suites and confirm all tests pass (fix-checking, preservation, and the updated existing tests)
  - Ensure no unused imports or dead references to `UserRole` / `ANSWER_NOT_ALLOWED_FOR_ADMIN` remain
  - If any test fails or questions arise, stop and ask the user
