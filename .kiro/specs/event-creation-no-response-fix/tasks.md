# Implementation Plan

- [ ] 1. Write bug condition exploration test
  - **Property 1: Bug Condition** - Failed create surfaces a visible error and keeps the modal open
  - **CRITICAL**: This test MUST FAIL on unfixed code - failure confirms the bug exists
  - **DO NOT attempt to fix the test or the code when it fails**
  - **NOTE**: This test encodes the expected behavior - it will validate the fix when it passes after implementation
  - **GOAL**: Surface counterexamples that demonstrate the silent-failure bug on the unfixed `AdminEventsPage`
  - **Scoped PBT Approach**: The bug is deterministic (every failed create is swallowed), so scope the property to concrete failing outcomes - a rejected `eventService.createEvent` with (a) an AxiosError carrying `response.data.error.message`, (b) one carrying `response.data.detail`, and (c) a network error with no `response`.
  - Create the test file `frontend/src/pages/AdminEventsPage.createError.test.tsx` using React Testing Library + Vitest, with `eventService` mocked (matching the existing `frontend/src` test setup)
  - Test implementation details from the Bug Condition in design: `isBugCondition(input)` is `input.backendOutcome = FAILURE AND createModalIsOpen(input) AND NOT visibleErrorMessageShown(input)`
  - Test cases (all assert the fixed behavior, so all FAIL on unfixed code):
    - Validation error (400): mock `createEvent` to reject with an AxiosError where `response.data.error.message = 'start_date must be in the future'`; open the create modal, fill fields, click "Create"; assert the message text is visible and the modal is still open
    - End-before-start (400): reject with `response.data.error.message = 'end_date must be after start_date'`; assert the message is visible and modal open
    - Missing required field (422): reject with a 422 payload; assert a visible validation message and modal open
    - Network error: reject with an error having no `response`; assert the generic fallback (`page.adminEvents.error.create`) is visible and modal open
    - Retry clears prior error (edge case): first submit fails and shows a message; a second submit that succeeds must not still show the old message
  - The test assertions match the Expected Behavior in Property 1: `visibleErrorMessageShown = true`, `createModalStillOpen = true`, `noEventFalselyReportedAsCreated = true`
  - Run test on UNFIXED code
  - **EXPECTED OUTCOME**: Test FAILS (this is correct - it proves the bug exists: on failure no error element renders and the modal stays open with no feedback)
  - Document counterexamples found (e.g. "createEvent rejects with 'start_date must be in the future' but no error element is rendered; only a console.error line is emitted")
  - Mark task complete when test is written, run, and failure is documented
  - _Requirements: 1.1, 1.2, 1.3_

- [ ] 2. Write preservation property tests (BEFORE implementing fix)
  - **Property 2: Preservation** - Success path and unrelated operations unchanged
  - **IMPORTANT**: Follow observation-first methodology - run the UNFIXED code first, record actual outputs, then write tests that assert those outputs
  - Observe behavior on UNFIXED code for non-bug-condition inputs (cases where `isBugCondition` returns false):
    - Successful create: `createEvent` resolves → modal closes (`setShowCreateModal(false)`), `formData` is reset, `loadEvents()` is called
    - Edit: `handleSave` → `updateEvent` is called and the list reloads
    - Delete/cancel: `handleDelete` → `deleteEvent` is called and the list reloads
    - Initial load: on mount `listEvents` is called and events render
  - Write tests (property-based where practical) capturing the observed behavior from the Preservation Requirements in design:
    - Successful create preservation: assert modal closes, form resets, and `loadEvents` is called (Req 3.1)
    - Edit preservation: assert `updateEvent` is called and the list reloads, unaffected by the create-error changes (Req 3.2)
    - Delete/cancel preservation: assert `deleteEvent` is called and the list reloads (Req 3.3)
    - Initial load preservation: assert `listEvents` is called on mount and events render (Req 3.4)
    - No stale error on success after a prior failure: after a failed attempt shows a message, a subsequent successful attempt closes the modal with no lingering error (Req 3.1)
  - Property-based approach: generate random `formData` with a successful outcome and assert modal-close + form-reset + list-reload always occur; generate random failed-then-succeeded submit sequences and assert no stale error remains after success
  - Run tests on UNFIXED code
  - **EXPECTED OUTCOME**: Tests PASS (this confirms the baseline behavior to preserve)
  - Mark task complete when tests are written, run, and passing on unfixed code
  - _Requirements: 3.1, 3.2, 3.3, 3.4, 3.5_

- [ ] 3. Fix for silent create-failure in the admin events create modal

  - [ ] 3.1 Add the fallback translation key
    - In `frontend/src/i18n/translations.ts`, add `page.adminEvents.error.create` in both the French and English blocks, consistent with existing `*.error.*` keys (e.g. `page.topicDetail.error.*`)
    - FR: "Erreur lors de la création de l'événement"
    - EN: "Error creating the event"
    - _Bug_Condition: isBugCondition(input) where input.backendOutcome = FAILURE from design_
    - _Expected_Behavior: fallback message used when the backend payload has no extractable message (Property 1) from design_
    - _Requirements: 2.2_

  - [ ] 3.2 Implement the fix in AdminEventsPage
    - **File**: `frontend/src/pages/AdminEventsPage.tsx`
    - Add create-error state: `const [createError, setCreateError] = useState<string | null>(null);`
    - Clear the error at the start of each submit: call `setCreateError(null)` at the top of `handleCreate` before awaiting `eventService.createEvent(...)`
    - Capture the error in the `catch` block using the codebase extraction pattern (keep the `console.error` for developer diagnostics):
      `setCreateError(err?.response?.data?.error?.message || err?.response?.data?.detail || t('page.adminEvents.error.create'))`
    - Keep the success branch identical: on resolve still call `setShowCreateModal(false)`, reset `formData`, and call `loadEvents()`; do NOT set `createError` in the success branch
    - Render a visible error banner in the create modal, above the form fields, when `createError` is set (use `role="alert"` and the existing error-banner style: `mb-4 px-3 py-2 rounded bg-red-100 text-red-800 text-sm`)
    - Reset `createError` when the modal is dismissed via Cancel and when it is opened via "New event" (set `setCreateError(null)` in both `onClick` handlers) so a stale message never reappears on a fresh open
    - _Bug_Condition: isBugCondition(input) where input.backendOutcome = FAILURE (validation 400/422, server 500, or network error) from design_
    - _Expected_Behavior: keep modal open, show visible message derived from backend payload or fallback, do not falsely report the event as created (Property 1) from design_
    - _Preservation: success path (modal close, form reset, list reload) and edit/delete/load flows unchanged (Property 2) from design_
    - _Requirements: 2.1, 2.2, 2.3, 2.4_

  - [ ] 3.3 Verify bug condition exploration test now passes
    - **Property 1: Expected Behavior** - Failed create surfaces a visible error and keeps the modal open
    - **IMPORTANT**: Re-run the SAME test from task 1 - do NOT write a new test
    - The test from task 1 encodes the expected behavior; when it passes, it confirms the expected behavior is satisfied
    - Run the bug condition exploration test from step 1
    - **EXPECTED OUTCOME**: Test PASSES (confirms the bug is fixed - visible error, modal open, no false success across the validation/server/network cases and the retry-clears case)
    - _Requirements: 2.1, 2.2, 2.3, 2.4_

  - [ ] 3.4 Verify preservation tests still pass
    - **Property 2: Preservation** - Success path and unrelated operations unchanged
    - **IMPORTANT**: Re-run the SAME tests from task 2 - do NOT write new tests
    - Run the preservation property tests from step 2
    - **EXPECTED OUTCOME**: Tests PASS (confirms no regressions - successful create still closes the modal, resets the form, reloads the list; edit/delete/initial-load unchanged; no stale error after success)
    - Confirm all tests still pass after the fix (no regressions)
    - _Requirements: 3.1, 3.2, 3.3, 3.4, 3.5_

- [ ] 4. Checkpoint - Ensure all tests pass
  - Run the full frontend test suite (single run, e.g. `vitest --run`) and confirm the exploration test, preservation tests, and existing tests all pass
  - Ensure no regressions in related `AdminEventsPage` or translation tests
  - Ensure all tests pass, ask the user if questions arise.
