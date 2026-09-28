# Implementation Plan

## Overview

This plan fixes the event-creation validation failure where valid submissions are rejected (equal or timezone-naive dates rejected by a server-local-clock comparison), the 422 failure is silent server-side, and the frontend shows an opaque generic banner. Following the exploratory bugfix workflow, we first write a bug-condition exploration test (must fail on unfixed code) and observation-first preservation tests (must pass on unfixed code), then apply the fix across the backend schema/validators, a server-side validation-error log handler, and the frontend error extraction, and finally verify the exploration test passes and preservation tests still pass.

## Task Dependency Graph

```
Task 1 (Bug condition exploration test) ──────────────┐
                                                       │
Task 2 (Preservation property tests) ─────────────┐   │
                                                   │   │
Task 3 (Fix)                                       │   │
  ├─ 3.1 Normalize datetimes / clarify messages    │   │
  ├─ 3.2 Server-side validation logging            │   │
  ├─ 3.3 Frontend message surfacing                │   │
  ├─ 3.4 Verify exploration test passes  ◄─────────┼───┘  (depends on Task 1)
  └─ 3.5 Verify preservation tests pass  ◄─────────┘      (depends on Task 2)
        │
        ▼
Task 4 (Integration tests) ◄── depends on Task 3
        │
        ▼
Task 5 (Checkpoint) ◄── depends on all (Tasks 1-4)
```

- Tasks 1 and 2 are standalone and MUST be completed before the fix (Task 3).
- Task 3 sub-tasks 3.1-3.3 implement the fix; 3.4 depends on Task 1; 3.5 depends on Task 2.
- Task 4 depends on Task 3.
- Task 5 depends on all preceding tasks.

```json
{
  "waves": [
    {
      "wave": 1,
      "description": "Standalone exploration and preservation tests (parallel, no dependencies), run against the unfixed code before the fix",
      "tasks": ["1", "2"]
    },
    {
      "wave": 2,
      "description": "Fix implementation across backend schema, server-side validation logging, and frontend message surfacing",
      "tasks": ["3.1", "3.2", "3.3"],
      "dependsOn": [1]
    },
    {
      "wave": 3,
      "description": "Verification: exploration test now passes (depends on Task 1) and preservation tests still pass (depends on Task 2)",
      "tasks": ["3.4", "3.5"],
      "dependsOn": [1, 2]
    },
    {
      "wave": 4,
      "description": "Integration tests for the full create flow",
      "tasks": ["4"],
      "dependsOn": [3]
    },
    {
      "wave": 5,
      "description": "Checkpoint: ensure all tests pass",
      "tasks": ["5"],
      "dependsOn": [1, 2, 3, 4]
    }
  ]
}
```

## Tasks

- [x] 1. Write bug condition exploration test (BEFORE implementing fix)
  - **Property 1: Bug Condition** - Deterministic, diagnosable event-creation response
  - **CRITICAL**: This test MUST FAIL on unfixed code - failure confirms the bug exists
  - **DO NOT attempt to fix the test or the code when it fails**
  - **NOTE**: This test encodes the expected behavior - it will validate the fix when it passes after implementation
  - **GOAL**: Surface counterexamples that demonstrate the bug exists on the unfixed code
  - **Scoped PBT Approach**: For deterministic cases (equal dates), scope the property to concrete failing inputs for reproducibility; for the naive-clock case, generate naive future date pairs across offsets
  - Backend (`app/events/schemas.py`): instantiate `EventCreateRequest` directly (no HTTP needed) for the bug-condition date pairs from `isBugCondition(input)`:
    - Equal dates: `start_date == end_date` at a far-future instant (e.g. both `2030-01-01T10:00`) - assert the current rejection message is opaque/generic (fails the "clear, specific message" expectation)
    - Naive near-future start: `start_date` a few minutes ahead of wall-clock but rejected by the naive `datetime.now(v.tzinfo)` local-clock comparison - assert it is currently rejected as "not in the future"
  - Frontend (`frontend/src/pages/AdminEventsPage.tsx`): feed `extractApiError` an axios-shaped 422 with `detail: [{ msg: "Value error, end_date must be after start_date" }]` - assert current output is the raw prefixed message or the generic "Failed to create the event." fallback (demonstrates missing clean/prefer behavior)
  - Server visibility: confirm (by inspection / handler absence) that a 422 on create currently produces no application log entry
  - Run tests on UNFIXED code
  - **EXPECTED OUTCOME**: Tests FAIL / demonstrate the bug (this is correct - it proves the bug exists)
  - Document counterexamples found (e.g. "EventCreateRequest(start==end at 2030-01-01) raises 422 surfaced as generic banner", "naive future start rejected as not-in-future", "extractApiError returns 'Value error, ...' or generic fallback")
  - Mark task complete when tests are written, run, and failures are documented
  - _Requirements: 1.1, 1.2, 1.3, 1.4_

- [x] 2. Write preservation property tests (BEFORE implementing fix)
  - **Property 2: Preservation** - Non-bug-condition behavior unchanged
  - **IMPORTANT**: Follow observation-first methodology - run the UNFIXED code first, record actual outputs, then assert them
  - Observe behavior on UNFIXED code for inputs where `isBugCondition` returns false, then write property-based tests capturing the observed patterns:
    - Valid creation: strictly-later `end_date` + clearly-future `start_date` returns HTTP 201 with the created event details (Req 3.1)
    - Assignment handling: valid `assigned_user_ids` persisted and first assignee mirrored into deprecated `assigned_user_id`; empty/omitted `assigned_user_ids` treated as public event (Req 3.2, 3.3)
    - INVALID_ASSIGNED_USER: non-existent assignee yields HTTP 400 and no event created (Req 3.4)
    - Authorization: non-admin create rejected with HTTP 403 (Req 3.5); listing, updating, cancelling unchanged (Req 3.6)
  - Property-based approach: generate random future date pairs with `end > start` (naive and aware), random assignment sets, and roles; assert fixed behavior will equal observed original behavior across the input domain
  - Frontend preservation: `extractApiError` still returns nested `error.message` for business errors and the generic fallback when nothing usable is present
  - Run tests on UNFIXED code
  - **EXPECTED OUTCOME**: Tests PASS (this confirms the baseline behavior to preserve)
  - Mark task complete when tests are written, run, and passing on unfixed code
  - _Requirements: 3.1, 3.2, 3.3, 3.4, 3.5, 3.6_

- [x] 3. Fix for event creation validation failure (silent 422 / naive-clock / opaque message)

  - [x] 3.1 Normalize datetimes and clarify validator messages (backend schema)
    - In `app/events/schemas.py`, add a shared normalization step so a timezone-naive `start_date`/`end_date` is attached to UTC (`v.replace(tzinfo=timezone.utc)`) before any comparison
    - Change `validate_start_date` to compare the normalized aware value against `datetime.now(timezone.utc)` instead of `datetime.now(v.tzinfo)`, removing the server-local-clock dependency
    - Ensure both `start_date` and `end_date` are normalized before `validate_end_date` reads `info.data['start_date']`, so both are compared as aware instants
    - Keep equal-date rejection (`end_date > start_date`, equal disallowed) and future-start rejection, but make the `ValueError` messages concise and actionable: "End date must be after start date." and "Start date must be in the future."
    - _Bug_Condition: isBugCondition(input) - equal start/end dates OR timezone-naive dates rejected by naive local-clock comparison_
    - _Expected_Behavior: expectedBehavior(result) - genuinely-future well-ordered naive dates accepted (201); otherwise a clear, specific date-rule message (not the generic banner)_
    - _Preservation: Preservation Requirements - valid creation, assignment, public/private, INVALID_ASSIGNED_USER, authorization, list/update/cancel unchanged_
    - _Requirements: 2.1, 2.4, 3.1_

  - [x] 3.2 Add server-side visibility for validation failures (backend)
    - In `app/main.py` (or where the FastAPI app / exception handlers are registered), add or confirm a `RequestValidationError` handler that logs the validation errors (route, field, msg) at warning level, so a 422 on event creation is diagnosable and never silent
    - Ensure the handler does not change the response contract for other routes
    - _Bug_Condition: isBugCondition(input) - validation failure occurs before create_event handler, so nothing is logged_
    - _Expected_Behavior: expectedBehavior(result) - failure reason is diagnosable server-side; no submission fails silently_
    - _Preservation: response contract for all other routes unchanged (Req 3.6)_
    - _Requirements: 2.2_

  - [x] 3.3 Surface and clean the 422 message on the frontend
    - In `frontend/src/pages/AdminEventsPage.tsx`, update `extractApiError` so that when `detail` is an array it reads `detail[0].msg`, strips the leading Pydantic `"Value error, "` prefix, and prefers it over the generic "Failed to create the event." fallback
    - Keep existing string and nested `error.message` handling unchanged for business errors, and keep the generic fallback when nothing usable is present
    - Confirm `handleCreate` renders the specific message in the create-modal alert
    - _Bug_Condition: isBugCondition(input) - 422 detail not surfaced with a clear reason, generic banner shown_
    - _Expected_Behavior: expectedBehavior(result) - specific validation message from the response is displayed instead of the generic fallback_
    - _Preservation: business-error message handling and fallback behavior unchanged_
    - _Requirements: 2.3_

  - [x] 3.4 Verify bug condition exploration test now passes
    - **Property 1: Expected Behavior** - Deterministic, diagnosable event-creation response
    - **IMPORTANT**: Re-run the SAME tests from task 1 - do NOT write new tests
    - The tests from task 1 encode the expected behavior; when they pass, they confirm the expected behavior is satisfied
    - Run the bug condition exploration tests from task 1 against the fixed code
    - **EXPECTED OUTCOME**: Tests PASS (equal dates yield the specific "End date must be after start date." message and a server-side log entry; genuinely-future well-ordered naive dates yield 201; `extractApiError` returns the cleaned, specific message; bug is fixed)
    - _Requirements: 2.1, 2.2, 2.3, 2.4_

  - [x] 3.5 Verify preservation tests still pass
    - **Property 2: Preservation** - Non-bug-condition behavior unchanged
    - **IMPORTANT**: Re-run the SAME tests from task 2 - do NOT write new tests
    - Run the preservation property tests from task 2 against the fixed code
    - **EXPECTED OUTCOME**: Tests PASS (no regressions - valid creation, assignment persistence, public/private handling, INVALID_ASSIGNED_USER 400, non-admin 403, and list/update/cancel all unchanged)
    - _Requirements: 3.1, 3.2, 3.3, 3.4, 3.5, 3.6_

- [x] 4. Add integration tests for the full create flow
  - Full create flow via the API: equal dates => HTTP 422 with a clear, specific message AND a server-side log entry recording the validation failure (no silent failure)
  - Full create flow: genuinely-future well-ordered naive dates => HTTP 201 and event appears in the list
  - Frontend: a create submission that fails validation renders the specific message in the create-modal alert instead of the generic banner; a valid submission closes the modal and refreshes the list as before
  - _Requirements: 2.1, 2.2, 2.3, 2.4, 3.1, 3.6_

- [x] 5. Checkpoint - Ensure all tests pass
  - Run the full backend and frontend test suites (unit, property-based, integration)
  - Ensure all tests pass; ask the user if questions arise
  - _Requirements: 2.1, 2.2, 2.3, 2.4, 3.1, 3.2, 3.3, 3.4, 3.5, 3.6_

## Notes

- Follow the exploratory bugfix ordering strictly: Task 1 (exploration) and Task 2 (preservation) must be written and run against the UNFIXED code before any fix in Task 3. Task 1 is expected to FAIL and Task 2 is expected to PASS on unfixed code.
- Do not modify the tests in Tasks 1 and 2 when verifying in 3.4 and 3.5 - re-run the same tests. Task 1's test encodes the expected behavior and validates the fix when it passes.
- Bug Condition (C(X)): equal `start_date`/`end_date`, or timezone-naive dates rejected by the naive `datetime.now(v.tzinfo)` local-clock comparison.
- Expected Behavior (P(result)): genuinely-future well-ordered dates accepted (201); otherwise a clear, specific date-rule message; the 422 is logged server-side; the frontend surfaces the cleaned specific message.
- Preservation (¬C(X)): valid creation, assignment persistence, public/private handling, INVALID_ASSIGNED_USER (400), authorization (403), and list/update/cancel behavior remain unchanged.
- Files touched by the fix: `app/events/schemas.py` (normalization + validator messages), `app/main.py` (RequestValidationError logging handler), `frontend/src/pages/AdminEventsPage.tsx` (`extractApiError` cleanup).
