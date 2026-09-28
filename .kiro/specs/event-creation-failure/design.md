# Event Creation Failure Bugfix Design

## Overview

An administrator creating an event via "Event management" > "New event" can hit the red
banner "Failed to create the event." while no line is written to the backend logs. The
missing log line is the diagnostic clue: the request is rejected during Pydantic
request-schema validation (`EventCreateRequest`), which produces an HTTP 422 *before*
the `create_event` handler body runs, so none of the handler's `logger` calls execute.

Two schema-validation conditions reachable from the form trigger this:

1. **Equal start/end dates.** The two `datetime-local` inputs were both set to
   "09/28/2026, 05:56 PM". `EventCreateRequest.validate_end_date` rejects
   `end_date <= start_date`, raising a `ValueError` that FastAPI turns into a 422.
2. **Timezone-naive comparison.** A `datetime-local` value (`2026-09-28T17:56`) has no
   offset, so `start_date` parses as timezone-naive. `validate_start_date` compares it
   against `datetime.now(v.tzinfo)` where `v.tzinfo` is `None`, i.e. a naive *local*
   "now". Whether a submitted time counts as "in the future" then depends on the
   server's local clock and timezone rather than an unambiguous instant.

The user sees the same generic banner for both because the 422 `detail` array is not
surfaced with a clear, human-readable reason for this flow.

The fix has three coordinated parts, kept minimal and targeted:

- **Backend schema (`app/events/schemas.py`)**: normalize incoming datetimes to a
  consistent, timezone-aware reference before comparing, and produce clear validator
  messages. This removes the local-clock dependency (root cause 2) and defines
  deterministic behavior for equal dates (root cause 1).
- **Backend visibility**: ensure validation failures are diagnosable server-side (a
  request-validation handler / log) so a failed submission is never silent
  (Requirement 2.2).
- **Frontend (`AdminEventsPage.tsx` + `eventService.ts`)**: surface the specific 422
  validation message instead of only the generic fallback banner (Requirement 2.3),
  cleaning the Pydantic `"Value error, ..."` prefix so the message reads naturally.

## Glossary

- **Bug_Condition (C)**: The event-creation submission triggers a schema-validation
  rejection (HTTP 422) that surfaces to the admin as the generic
  "Failed to create the event." banner with no diagnosable reason. Concretely: equal
  `start_date`/`end_date`, or timezone-naive dates rejected only because of the
  server's local-clock comparison.
- **Property (P)**: For a bug-condition submission, the system responds deterministically —
  either it creates the event (HTTP 201) when the dates are genuinely valid and
  well-ordered, or it returns a clear, specific, actionable validation message (not the
  generic banner) and the failure reason is diagnosable server-side.
- **Preservation**: All non-bug behavior (valid creation, assignment handling, public
  events, INVALID_ASSIGNED_USER 400, non-admin 403, listing/updating/cancelling) is
  unchanged.
- **`EventCreateRequest`**: The Pydantic request schema in `app/events/schemas.py` with
  `validate_start_date` and `validate_end_date` field validators.
- **`validate_start_date` / `validate_end_date`**: Field validators that enforce
  "start in the future" and "end after start"; the source of the 422 rejections.
- **`create_event`**: The handler in `app/events/router.py`; its body (and its `logger`
  calls) only run *after* request-schema validation passes.
- **`extractApiError`**: Helper in `AdminEventsPage.tsx` that derives a message from an
  axios error; it already inspects `detail[0].msg` for 422 arrays but does not clean the
  Pydantic prefix or reliably prefer it for this flow.
- **`datetime-local` value**: A browser input string with no timezone offset
  (`YYYY-MM-DDTHH:MM`), parsed timezone-naive on the backend.

## Bug Details

### Bug Condition

The bug manifests when an admin submits the New event form and the date pair triggers a
Pydantic request-schema rejection: either `end_date == start_date` (equal dates), or
timezone-naive `start_date`/`end_date` that the admin intends as a future, well-ordered
event but that the server's naive local-clock comparison rejects. The failure is a 422
raised before `create_event` runs, so it is unlogged and surfaces as the generic banner.

**Formal Specification:**
```
FUNCTION isBugCondition(input)
  INPUT: input of type NewEventSubmission   // as produced by the New event form
  OUTPUT: boolean

  // Admin session, title present, assignees exist (otherwise-valid form),
  // but the date pair triggers a silent schema-validation rejection.
  RETURN otherwiseValid(input)
     AND ( (input.end_date = input.start_date)
        OR ( isTimezoneNaive(input.start_date) AND isTimezoneNaive(input.end_date)
             AND adminIntendsFutureWellOrdered(input)
             AND naiveLocalClockComparisonRejects(input) ) )
END FUNCTION
```

### Examples

- **Equal dates (reported case)**: title "test", `start_date` = `end_date` =
  "09/28/2026, 05:56 PM", location "test", max_participants 1, one assignee.
  *Expected*: a clear message "The end date must be after the start date." (or event
  created if the decided behavior were to allow it — see Correctness Properties).
  *Actual*: generic "Failed to create the event." banner, no backend log.
- **Naive future time near "now"**: `start_date` a few minutes ahead of the admin's wall
  clock but behind the server's local clock (or evaluated in a different offset).
  *Expected*: event created (HTTP 201). *Actual*: 422 "start_date must be in the future",
  no backend log, generic banner.
- **Naive well-ordered future**: `start_date` "2026-09-28T17:56", `end_date`
  "2026-09-28T18:56". *Expected*: event created. *Actual (already works)*: created — this
  is the preservation baseline, included to bound the condition.
- **Edge case — equal dates at a far-future instant**: both dates
  "2030-01-01T10:00". *Expected*: deterministic clear message (end must be after start),
  never the generic banner.

## Expected Behavior

### Preservation Requirements

**Unchanged Behaviors:**
- Creating an event with `end_date` strictly after a clearly-future `start_date`
  continues to return HTTP 201 with the created event details (Req 3.1).
- Valid `assigned_user_ids` continue to be persisted, with the first assignee mirrored
  into the deprecated `assigned_user_id` field (Req 3.2).
- Empty or omitted `assigned_user_ids` continue to be treated as a public event (Req 3.3).
- A non-existent assigned user continues to be rejected with INVALID_ASSIGNED_USER
  (HTTP 400) and no event created (Req 3.4).
- A non-admin attempting to create an event continues to be rejected with HTTP 403
  (Req 3.5).
- Listing, updating, and cancelling events continue to behave exactly as before (Req 3.6).

**Scope:**
All inputs that do NOT meet the bug condition should be completely unaffected by this
fix. This includes:
- Already-valid create submissions (strictly-later end, clearly-future start).
- Assignment validation, public/private handling, and the INVALID_ASSIGNED_USER path.
- Authorization (require_admin / 403) and all other event endpoints (list, register,
  unregister, update, cancel).

**Note:** The actual expected correct behavior for bug-condition inputs is defined in the
Correctness Properties section (Property 1). This section focuses on what must NOT change.

## Hypothesized Root Cause

Based on the bug description and the code read, the causes are:

1. **Equal-date rejection is correct but opaque**: `validate_end_date` uses
   `v <= info.data['start_date']`, so equal dates are rejected as intended, but the
   resulting 422 is never surfaced with a readable reason. The *behavior* (disallow
   equal) is defensible; the *diagnosability* is the defect.
   - Decision (documented in Correctness Properties): **equal dates remain disallowed**,
     but the system must return a clear, actionable message and be diagnosable
     server-side.

2. **Timezone-naive local-clock comparison**: `validate_start_date` compares against
   `datetime.now(v.tzinfo)`. For a naive input `v.tzinfo` is `None`, producing a naive
   local "now". The accept/reject boundary then depends on the server's local timezone
   and clock rather than an unambiguous instant. This is the core correctness defect
   behind "a time the admin considers valid is rejected."
   - Fix: normalize a naive incoming datetime to a consistent, timezone-aware reference
     (interpret naive input as UTC) and compare start against `datetime.now(timezone.utc)`,
     removing the local-clock dependency.

3. **Silent failure (no server visibility)**: because validation fails before the handler,
   nothing is logged. There is no application-level record of *why* the 422 occurred.
   - Fix: ensure request-validation failures for this route are diagnosable server-side
     (a `RequestValidationError` handler / log entry) so no submission fails silently.

4. **Frontend does not surface the 422 detail cleanly**: `extractApiError` reads
   `detail[0].msg`, but Pydantic v2 prefixes `ValueError` messages with
   `"Value error, "`, and the generic fallback can win when the shape is unexpected.
   - Fix: prefer and clean the 422 `msg` so the admin sees the specific reason.

## Correctness Properties

Property 1: Bug Condition - Deterministic, diagnosable event-creation response

_For any_ New event submission where the bug condition holds (isBugCondition returns
true), the fixed system SHALL respond deterministically: it SHALL create the event and
return HTTP 201 when the dates are genuinely valid and well-ordered under an unambiguous
time reference (in particular, a genuinely-future, strictly-ordered naive submission is
accepted); otherwise it SHALL return a clear, specific validation message that names the
offending date rule (e.g. "The end date must be after the start date.") rather than the
generic "Failed to create the event." banner, and the failure reason SHALL be diagnosable
server-side. Equal `start_date`/`end_date` is disallowed and yields the specific
"end must be after start" message.

**Validates: Requirements 2.1, 2.2, 2.3, 2.4**

Property 2: Preservation - Non-bug-condition behavior unchanged

_For any_ input where the bug condition does NOT hold (isBugCondition returns false), the
fixed code SHALL produce the same result as the original code, preserving valid event
creation (HTTP 201), assignment persistence and public-event handling, the
INVALID_ASSIGNED_USER (HTTP 400) rejection, non-admin rejection (HTTP 403), and all
listing, updating, and cancelling behavior.

**Validates: Requirements 3.1, 3.2, 3.3, 3.4, 3.5, 3.6**

## Fix Implementation

### Changes Required

Assuming the root cause analysis is correct:

**File**: `app/events/schemas.py`

**Function**: `EventCreateRequest.validate_start_date`, `EventCreateRequest.validate_end_date`
(and a shared normalization helper)

**Specific Changes**:
1. **Normalize naive datetimes to a consistent reference**: add a field validator (or
   normalize inside the existing validators) that, when an incoming `start_date` /
   `end_date` is timezone-naive, attaches UTC (`v.replace(tzinfo=timezone.utc)`), so all
   subsequent comparisons use an unambiguous, aware instant. This removes the
   server-local-clock dependency (Req 2.4).
2. **Future check against an unambiguous "now"**: change `validate_start_date` to compare
   against `datetime.now(timezone.utc)` using the normalized aware value, instead of
   `datetime.now(v.tzinfo)` where `tzinfo` may be `None`.
3. **Clear, specific validator messages**: keep `end_date > start_date` (equal disallowed)
   and `start_date` in the future, but ensure the `ValueError` messages are concise and
   actionable ("End date must be after start date.", "Start date must be in the future.")
   so the surfaced 422 `msg` reads naturally.
4. **Consistent ordering of comparisons**: ensure both `start_date` and `end_date` are
   normalized before `validate_end_date` reads `info.data['start_date']`, so the two are
   compared as aware instants.

**File**: `app/main.py` (or wherever the FastAPI app / exception handlers are registered)

**Specific Changes**:
5. **Server-side visibility for validation failures**: add (or confirm) a
   `RequestValidationError` handler that logs the validation errors (route, field, msg)
   at warning level, so a 422 on event creation is diagnosable and never silent
   (Req 2.2). This must not change the response contract for other routes.

**File**: `frontend/src/pages/AdminEventsPage.tsx`

**Function**: `extractApiError` (and its use in `handleCreate`)

**Specific Changes**:
6. **Surface and clean the 422 message**: when `detail` is an array, read `detail[0].msg`,
   strip the leading Pydantic `"Value error, "` prefix, and prefer it over the generic
   fallback so the create banner shows the specific reason (Req 2.3). Keep the existing
   string and nested `error.message` handling unchanged for business errors.

**File**: `frontend/src/services/eventService.ts`

**Specific Changes**:
7. **No behavioral change required** for `createEvent`; it already forwards the request
   and lets the caller handle errors. (Listed for completeness / traceability; if
   client-side send normalization of the `datetime-local` value is added it must not
   alter the already-working valid path — preservation.)

## Testing Strategy

### Validation Approach

The testing strategy follows a two-phase approach: first, surface counterexamples that
demonstrate the bug on the unfixed code, then verify the fix works correctly and
preserves existing behavior.

### Exploratory Bug Condition Checking

**Goal**: Surface counterexamples that demonstrate the bug BEFORE implementing the fix,
and confirm or refute the root-cause analysis. If refuted, re-hypothesize.

**Test Plan**: Instantiate `EventCreateRequest` directly (backend, no HTTP needed) with
the bug-condition date pairs, and drive the create endpoint / `extractApiError` on the
frontend, observing the current failures. Run against the UNFIXED code.

**Test Cases**:
1. **Equal dates**: build `EventCreateRequest` with `start_date == end_date` (far future).
   Assert it currently raises a validation error whose message is opaque to the user
   (will fail the "clear message" expectation on unfixed code).
2. **Naive near-future start**: `start_date` a few minutes ahead of wall-clock but such
   that the naive local-clock comparison rejects it. Assert it is currently rejected as
   "not in the future" (will fail on unfixed code under the relevant server offset).
3. **Frontend surfacing**: feed `extractApiError` an axios-shaped 422 with
   `detail: [{ msg: "Value error, end_date must be after start_date" }]`. Assert the
   current output is either the raw prefixed message or the generic fallback (demonstrates
   the missing clean/prefer behavior).
4. **Edge case — no server log**: confirm (by inspection / handler absence) that a 422 on
   create produces no application log entry on unfixed code.

**Expected Counterexamples**:
- Equal-date and naive-future submissions rejected with 422 and surfaced as the generic
  banner with no diagnosable server-side record.
- Possible causes: `end_date <= start_date` check, `datetime.now(v.tzinfo)` naive
  comparison, missing request-validation logging, frontend not cleaning/preferring
  `detail[0].msg`.

### Fix Checking

**Goal**: Verify that for all inputs where the bug condition holds, the fixed function
produces the expected behavior (Property 1).

**Pseudocode:**
```
FOR ALL input WHERE isBugCondition(input) DO
  result := createEvent_fixed(input)
  ASSERT (event created AND result.status = 201)
      OR (result carries a clear, specific validation message naming the
          offending date rule, NOT the generic banner,
          AND the failure is diagnosable server-side)
END FOR
```

### Preservation Checking

**Goal**: Verify that for all inputs where the bug condition does NOT hold, the fixed
function produces the same result as the original function (Property 2).

**Pseudocode:**
```
FOR ALL input WHERE NOT isBugCondition(input) DO
  ASSERT createEvent_original(input) = createEvent_fixed(input)
END FOR
```

**Testing Approach**: Property-based testing is recommended for preservation checking
because:
- It generates many test cases automatically across the input domain (date pairs,
  assignment sets, roles).
- It catches edge cases manual unit tests might miss (e.g. dates far in the future,
  boundary offsets).
- It provides strong guarantees that behavior is unchanged for all non-bug inputs.

**Test Plan**: Observe behavior on UNFIXED code first for the already-working valid path
(strictly-later end, clearly-future start), assignment handling, and authorization, then
write property-based tests that assert the fixed code matches that behavior.

**Test Cases**:
1. **Valid creation preservation**: strictly-later end + clearly-future start still
   returns HTTP 201 with the created event (Req 3.1).
2. **Assignment preservation**: valid `assigned_user_ids` persisted and first assignee
   mirrored into `assigned_user_id`; empty/omitted => public (Req 3.2, 3.3).
3. **INVALID_ASSIGNED_USER preservation**: non-existent assignee still yields HTTP 400
   and no event created (Req 3.4).
4. **Authorization preservation**: non-admin still gets HTTP 403 (Req 3.5); list/update/
   cancel unchanged (Req 3.6).

### Unit Tests

- `validate_start_date` / `validate_end_date`: equal dates rejected with the specific
  message; naive genuinely-future well-ordered dates accepted; naive input normalized to
  UTC before comparison.
- Future check uses `datetime.now(timezone.utc)` and no longer depends on the server's
  local timezone.
- `extractApiError`: cleans the `"Value error, "` prefix and prefers `detail[0].msg` over
  the fallback; still returns nested `error.message` for business errors and the fallback
  when nothing usable is present.

### Property-Based Tests

- Generate random future date pairs with `end > start` (naive and aware) and assert the
  fixed schema accepts them regardless of server offset (fix + preservation of valid path).
- Generate random non-bug submissions (assignment sets, public/private, roles) and assert
  fixed behavior equals original behavior (preservation).
- Generate random `detail[0].msg` strings with/without the Pydantic prefix and assert
  `extractApiError` output is the cleaned, specific message.

### Integration Tests

- Full create flow via the API: equal dates => 422 with a clear, specific message AND a
  server-side log entry recording the validation failure (no silent failure).
- Full create flow: genuinely-future well-ordered naive dates => HTTP 201, event listed.
- Frontend: a create submission that fails validation renders the specific message in the
  create-modal alert instead of the generic banner; a valid submission closes the modal
  and refreshes the list as before.
