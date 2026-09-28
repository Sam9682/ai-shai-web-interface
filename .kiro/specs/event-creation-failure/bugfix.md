# Bugfix Requirements Document

## Introduction

When an administrator creates an event through "Event management" > "New event", the
submission can fail with the red banner "Failed to create the event." while no error
is written to the backend logs. The absence of a log line is itself a clue: the
failure happens during request-schema validation (a 422 response produced before the
`create_event` handler body runs), so none of the `logger` calls inside the handler
are ever reached.

Investigation of the end-to-end flow identified two schema-validation conditions that
trigger this failure, both reachable from the form as reported:

- The create form uses two `datetime-local` inputs (`start_date`, `end_date`). In the
  reported case both were set to the same value ("09/28/2026, 05:56 PM"). The backend
  schema `EventCreateRequest.validate_end_date` rejects `end_date <= start_date`,
  raising a `ValueError` that FastAPI converts into a 422 validation response. Equal
  start/end dates therefore fail before the handler runs.
- A `datetime-local` value carries no timezone offset (e.g. `2026-09-28T17:56`), so the
  parsed `start_date` is timezone-naive. `validate_start_date` compares it against
  `datetime.now(v.tzinfo)` (a naive local "now"), making the "start_date must be in the
  future" check depend on the server's local clock rather than an unambiguous instant.
  Any submitted time that is not strictly in the future by the server's local clock is
  rejected as a 422, again without an application log line.

The user-facing symptom is identical for both conditions: the generic fallback banner
"Failed to create the event." appears, because the frontend receives a 422 whose
`detail` array is not surfaced with a clear message for this flow.

The bug affects only event creation submissions that meet these validation conditions;
event creation with a strictly-later end date and a clearly-future start time already
succeeds, as do listing, updating, and cancelling events.

## Bug Analysis

### Current Behavior (Defect)

1.1 WHEN an admin submits the New event form with `start_date` equal to `end_date` THEN the system rejects the request with a validation error (HTTP 422) and no event is created
1.2 WHEN the New event form submission fails schema validation THEN the system writes no entry to the backend logs, because the failure occurs before the `create_event` handler body executes
1.3 WHEN a schema-validation failure (HTTP 422) is returned for event creation THEN the frontend displays the generic banner "Failed to create the event." without communicating the specific reason (e.g. that the end date must be after the start date)
1.4 WHEN an admin submits a `start_date`/`end_date` from the `datetime-local` inputs THEN the system receives a timezone-naive datetime and evaluates the "start date must be in the future" rule against the server's local clock, so a time the admin considers valid can be rejected as not in the future

### Expected Behavior (Correct)

2.1 WHEN an admin submits the New event form with `start_date` equal to `end_date` THEN the system SHALL respond deterministically and, if this is disallowed, SHALL return a clear, actionable message indicating the end date must be after the start date rather than the generic failure banner
2.2 WHEN an event creation request fails validation THEN the system SHALL surface enough information (logged server-side and/or returned in the response) for the failure reason to be diagnosable, so a failed submission is never silent
2.3 WHEN a schema-validation failure (HTTP 422) is returned for event creation THEN the frontend SHALL display the specific validation message from the response instead of only the generic "Failed to create the event." fallback
2.4 WHEN an admin submits `start_date`/`end_date` values that are timezone-naive local times THEN the system SHALL evaluate the "start date in the future" and "end after start" rules against an unambiguous, consistent time reference so a genuinely future, well-ordered event is accepted

### Unchanged Behavior (Regression Prevention)

3.1 WHEN an admin submits the New event form with an `end_date` strictly after a clearly-future `start_date` THEN the system SHALL CONTINUE TO create the event and return HTTP 201 with the created event details
3.2 WHEN an admin creates an event with one or more valid `assigned_user_ids` THEN the system SHALL CONTINUE TO persist the assignments and mirror the first assignee into the deprecated `assigned_user_id` field
3.3 WHEN an admin creates an event with an empty or omitted `assigned_user_ids` THEN the system SHALL CONTINUE TO treat it as a public event
3.4 WHEN an admin submits an event referencing a non-existent assigned user THEN the system SHALL CONTINUE TO reject it with the INVALID_ASSIGNED_USER (HTTP 400) error and create no event
3.5 WHEN a non-admin user attempts to create an event THEN the system SHALL CONTINUE TO reject the request with HTTP 403
3.6 WHEN listing, updating, or cancelling existing events THEN the system SHALL CONTINUE TO behave as before

## Deriving the Bug Condition

**F** is the current event-creation path (frontend submission + `EventCreateRequest`
validation + `create_event` handler). **F'** is the fixed path.

```pascal
FUNCTION isBugCondition(X)
  INPUT: X of type NewEventSubmission   // as produced by the New event form
  OUTPUT: boolean

  // The form is otherwise valid (admin session, title present, assignees exist),
  // but the date pair triggers a silent schema-validation rejection.
  RETURN (X.end_date = X.start_date)
      OR (X.start_date and X.end_date are timezone-naive local times
          that the admin intends as future/well-ordered but that the
          server's naive local-clock comparison rejects)
END FUNCTION
```

```pascal
// Property: Fix Checking
FOR ALL X WHERE isBugCondition(X) DO
  result <- createEvent'(X)
  ASSERT (event is created AND result.status = 201)
      OR (result is a clear, specific validation message that names the
          offending date rule; NOT the generic "Failed to create the event."
          banner, AND the failure reason is diagnosable server-side)
END FOR
```

```pascal
// Property: Preservation Checking
FOR ALL X WHERE NOT isBugCondition(X) DO
  ASSERT F(X) = F'(X)
END FOR
```

**Counterexample (from the report):** New event with title "test", description "test",
`start_date` = `end_date` = "09/28/2026, 05:56 PM", location "test",
max_participants 1, one assignee ("samuel LEPETRE"), submitted by admin — fails with
"Failed to create the event." and no backend log entry.
