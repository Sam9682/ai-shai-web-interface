# Event Creation No Response Fix Bugfix Design

## Overview

On the admin events page (`/admin/events`), an administrator opens the "New event" modal, fills the form, and clicks "Create". When the create request does not succeed, the button appears dead: no event is created, the modal stays open, and no message explains what happened. The failure is invisible.

The root cause is entirely in the frontend submit handler `handleCreate` in `AdminEventsPage.tsx`. It wraps `eventService.createEvent(...)` in a `try/catch`, but the `catch` block only calls `console.error(...)`. There is no error state and no error UI in the create modal, so every failure (validation `400`/`422`, server `500`, network error) is swallowed silently.

The fix is minimal and local to the create flow: introduce a `createError` state, populate it in the `catch` block using the error-extraction convention already used across this codebase (`err.response?.data?.error?.message || err.response?.data?.detail || fallback`), clear it before each new attempt, and render a visible error banner inside the create modal. The success path stays byte-for-byte identical in behavior (event created, modal closed, form reset, list reloaded), and every other operation (edit, delete/cancel, initial list load) is untouched.

## Glossary

- **Bug_Condition (C)**: A create attempt whose backend outcome is failure — the request to create an event does not succeed (validation error, server error, or network error).
- **Property (P)**: The desired behavior when C holds — the create modal stays open and shows a visible, descriptive error message; no event is falsely reported as created.
- **Preservation**: The behavior that must remain unchanged — a successful create still creates the event, closes the modal, resets the form, and reloads the list; and the edit, delete/cancel, and initial-load flows are unaffected.
- **handleCreate**: The submit handler in `frontend/src/pages/AdminEventsPage.tsx` bound to the "Create" button of the create modal. Calls `eventService.createEvent(...)`.
- **handleCreate' (F')**: The fixed handler that sets/clears a `createError` state and lets the UI surface a visible error on failure, while leaving the success path identical.
- **createError**: New React state (`string | null`) in `AdminEventsPage` holding the current create-modal error message, or `null` when there is nothing to show.
- **eventService.createEvent**: `frontend/src/services/eventService.ts`; performs `api.post('/events', data)` and resolves `void` on success or rejects with an `AxiosError` on failure.
- **backendOutcome**: Whether the `createEvent` promise resolves (SUCCESS) or rejects (FAILURE).

## Bug Details

### Bug Condition

The bug manifests whenever a create attempt does not succeed. `handleCreate` catches the rejected promise from `eventService.createEvent` and only logs it via `console.error`. It is either not capturing the error into any UI-visible state, not rendering any error element in the create modal, or both — so the administrator sees no feedback and the "Create" button appears non-functional.

**Formal Specification:**
```
FUNCTION isBugCondition(input)
  INPUT: input of type CreateEventAttempt   // { formData, backendOutcome }
  OUTPUT: boolean

  // True whenever the create attempt does not succeed. In every such case the
  // current handler swallows the failure and shows nothing to the user.
  RETURN input.backendOutcome = FAILURE
         AND createModalIsOpen(input)
         AND NOT visibleErrorMessageShown(input)
END FUNCTION
```

### Examples

- Administrator submits with `start_date` in the past. Backend responds `400 VALIDATION_ERROR` ("start_date must be in the future"). Expected: modal stays open with a visible message. Actual: modal stays open, no message, only a `console.error` line.
- Administrator submits with `end_date` before `start_date`. Backend responds `400 VALIDATION_ERROR` ("end_date must be after start_date"). Expected: visible message. Actual: silent, button looks broken.
- Administrator submits with an empty title. Backend responds `422` (missing required field). Expected: visible validation message. Actual: silent.
- Network drops mid-request; the promise rejects with no `response`. Expected: a visible generic error message. Actual: silent `console.error`.
- Edge case — valid data: backend responds `201`. Expected: event created, modal closes, form resets, list reloads (unchanged, not a bug).

## Expected Behavior

### Preservation Requirements

**Unchanged Behaviors:**
- A successful create (valid data) still creates the event, closes the create modal, resets the form fields, and refreshes the events list (Req 3.1).
- Editing an existing event via the edit modal still saves and refreshes the list (Req 3.2).
- Cancelling/deleting an event still cancels it and refreshes the list (Req 3.3).
- The initial events-list load on page open still displays upcoming events (Req 3.4).
- On success the backend still sends member notifications and returns its response unchanged — the backend is not modified by this fix (Req 3.5).

**Scope:**
All inputs that do NOT involve a failed create attempt must be completely unaffected by this fix. This includes:
- Successful create submissions (`backendOutcome = SUCCESS`).
- The edit flow (`handleSave`) and its modal.
- The delete/cancel flow (`handleDelete`).
- The initial list load (`loadEvents`) and rendering of existing events.

**Note:** The expected correct behavior for the failing case is defined in the Correctness Properties section (Property 1). This section captures only what must NOT change.

## Hypothesized Root Cause

Based on the bug description and the code in `AdminEventsPage.tsx`, the cause is confirmed to be silent error handling in the create flow:

1. **No error state exists for the create modal**: `AdminEventsPage` holds no `createError`/error state, so a failure has nowhere to be recorded for rendering.

2. **The `catch` block only logs**: `handleCreate`'s `catch (error)` calls `console.error('Failed to create event:', error)` and returns, discarding the error from the user's view.

3. **The create modal has no error UI**: The create modal JSX contains only form fields and the Cancel/Create buttons — no element that would display an error message even if one were captured.

4. **Prior error would persist across attempts if added naively**: Once an error state is introduced, it must be cleared at the start of each submit so a stale message does not linger after a corrected retry.

## Correctness Properties

Property 1: Bug Condition - Failed create surfaces a visible error and keeps the modal open

_For any_ create attempt where the bug condition holds (isBugCondition returns true — the create request fails for any reason), the fixed handleCreate SHALL keep the create modal open, display a visible error message describing why creation failed (derived from the backend error payload when available, otherwise a generic fallback), and SHALL NOT close the modal, reset the form, or otherwise report the event as created.

**Validates: Requirements 2.1, 2.2, 2.3, 2.4**

Property 2: Preservation - Success path and unrelated operations unchanged

_For any_ input where the bug condition does NOT hold (isBugCondition returns false — a successful create, or an edit/delete/load operation), the fixed code SHALL produce the same result as the original code, preserving event creation, modal close, form reset, and list reload on success, and preserving the edit, delete/cancel, and initial-load behaviors exactly.

**Validates: Requirements 3.1, 3.2, 3.3, 3.4, 3.5**

## Fix Implementation

### Changes Required

Assuming the root cause analysis is correct, all changes are confined to the create flow in one file (plus two translation entries).

**File**: `frontend/src/pages/AdminEventsPage.tsx`

**Function/Component**: `AdminEventsPage` — state, `handleCreate`, the create modal JSX, and the create-modal close handlers.

**Specific Changes**:
1. **Add create-error state**: Introduce `const [createError, setCreateError] = useState<string | null>(null);` alongside the existing state.

2. **Clear the error at the start of each submit (Req 2.4)**: At the top of `handleCreate`, call `setCreateError(null)` before awaiting `eventService.createEvent(...)`, so a prior error is cleared before the new attempt's result is shown.

3. **Capture the error in the `catch` block (Req 2.1, 2.2, 2.3)**: Replace the log-only `catch` with one that both logs (kept for developer diagnostics) and sets a user-facing message using the codebase's existing extraction pattern:
   ```
   catch (err: any) {
     console.error('Failed to create event:', err);
     setCreateError(
       err?.response?.data?.error?.message ||
       err?.response?.data?.detail ||
       t('page.adminEvents.error.create')
     );
   }
   ```
   The success branch is unchanged: on resolve it still calls `setShowCreateModal(false)`, resets `formData`, and calls `loadEvents()`. Note that `setCreateError(null)` must run only before the attempt (step 2), not in the success branch after closing, so the success behavior stays identical.

4. **Render a visible error banner in the create modal (Req 2.1, 2.2)**: Inside the create modal, above the form fields, conditionally render the message when `createError` is set, following the error-banner style already used elsewhere in the app:
   ```
   {createError && (
     <div className="mb-4 px-3 py-2 rounded bg-red-100 text-red-800 text-sm" role="alert">
       {createError}
     </div>
   )}
   ```

5. **Reset the error when the modal is dismissed/opened**: Clear `createError` when the create modal is closed via Cancel and when it is opened via "New event", so a stale message never reappears on a fresh open. (Set `setCreateError(null)` in the `onClick` that opens the modal and in the Cancel `onClick` that sets `setShowCreateModal(false)`.)

**File**: `frontend/src/i18n/translations.ts`

6. **Add the fallback message key** `page.adminEvents.error.create` in both the French and English blocks (e.g. FR: "Erreur lors de la création de l'événement", EN: "Error creating the event"), consistent with existing `*.error.*` keys such as `page.topicDetail.error.*`.

## Testing Strategy

### Validation Approach

The strategy is two-phase: first surface counterexamples that demonstrate the silent-failure bug on the unfixed code, then verify the fix shows a visible error on failure and preserves the success and unrelated flows. Tests target the `AdminEventsPage` component with `eventService` mocked, matching the existing React Testing Library + Vitest setup used across `frontend/src`.

### Exploratory Bug Condition Checking

**Goal**: Surface counterexamples that demonstrate the bug BEFORE implementing the fix, and confirm the root cause (swallowed error, no UI). If refuted, re-hypothesize.

**Test Plan**: Render `AdminEventsPage`, open the create modal, fill valid-looking fields, mock `eventService.createEvent` to reject (e.g. an AxiosError with `response.data.error.message = 'start_date must be in the future'`), click "Create", and assert an error message is visible and the modal is still open. Run against UNFIXED code to observe the failure (no message rendered).

**Test Cases**:
1. **Validation error (400) surfaces message**: `createEvent` rejects with `400 VALIDATION_ERROR`; expect the message text visible in the modal (will fail on unfixed code).
2. **End-before-start (400) surfaces message**: `createEvent` rejects with "end_date must be after start_date"; expect visible message (will fail on unfixed code).
3. **Missing required field (422) surfaces message**: `createEvent` rejects with `422`; expect a visible validation message (will fail on unfixed code).
4. **Network error surfaces fallback**: `createEvent` rejects with an error having no `response`; expect the generic fallback message visible and modal open (will fail on unfixed code).
5. **Edge case — retry clears prior error**: first submit fails and shows a message; a second submit that succeeds must not still show the old message (may fail on unfixed code).

**Expected Counterexamples**:
- On failure, no error element is rendered and the modal stays open with no feedback.
- Possible causes: no error state, log-only `catch`, no error UI in the modal.

### Fix Checking

**Goal**: Verify that for all inputs where the bug condition holds, the fixed handler produces the expected behavior (visible error, modal open, no false success).

**Pseudocode:**
```
FOR ALL input WHERE isBugCondition(input) DO
  result := handleCreate_fixed(input)
  ASSERT visibleErrorMessageShown(result) = true
  ASSERT createModalStillOpen(result) = true
  ASSERT noEventFalselyReportedAsCreated(result) = true
END FOR
```

### Preservation Checking

**Goal**: Verify that for all inputs where the bug condition does NOT hold, the fixed handler produces the same result as the original (event created, modal closed, form reset, list reloaded on success; edit/delete/load unchanged).

**Pseudocode:**
```
FOR ALL input WHERE NOT isBugCondition(input) DO
  ASSERT handleCreate_original(input) = handleCreate_fixed(input)
END FOR
```

**Testing Approach**: Property-based testing is recommended for preservation because:
- It generates many form-data and outcome combinations automatically across the input domain.
- It catches edge cases that hand-written unit tests might miss.
- It gives strong assurance that behavior is unchanged for all successful/non-create inputs.

**Test Plan**: Observe success and unrelated-operation behavior on UNFIXED code first, then write tests (property-based where practical) that capture that behavior and assert it still holds after the fix.

**Test Cases**:
1. **Successful create preservation**: `createEvent` resolves; assert the modal closes, `formData` is reset, and `loadEvents` is called — unchanged from today.
2. **Edit preservation**: exercise `handleSave` and assert `updateEvent` is called and the list reloads, unaffected by the create-error changes.
3. **Delete/cancel preservation**: exercise `handleDelete` and assert `deleteEvent` is called and the list reloads.
4. **Initial load preservation**: on mount, assert `listEvents` is called and events render.
5. **No stale error on success after a prior failure**: after a failed attempt shows a message, a subsequent successful attempt closes the modal with no lingering error.

### Unit Tests

- Failure paths (400, 422, 500, network) each render a visible, appropriately-sourced message and keep the modal open.
- The error clears at the start of a new submit and when the modal is closed/reopened.
- Success path closes the modal, resets the form, and reloads the list.
- Fallback message (`page.adminEvents.error.create`) is used when the backend payload has no extractable message.

### Property-Based Tests

- Generate random `formData` and a random failing outcome; assert an error is always visible and the modal stays open.
- Generate random `formData` with a successful outcome; assert modal-close + form-reset + list-reload always occur (preservation).
- Generate random sequences of failed-then-succeeded submits; assert no stale error remains after a success.

### Integration Tests

- Full create flow: open modal → submit invalid data → see error → correct fields → submit → success closes modal and refreshes list.
- Context isolation: performing edit and delete/cancel operations does not trigger or interact with the create-error state.
- Feedback visibility: the error banner appears within the open modal (via `role="alert"`) and disappears on a corrected retry.
