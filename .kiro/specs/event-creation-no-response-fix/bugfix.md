# Bugfix Requirements Document

## Introduction

In the admin events menu (`/admin/events`), an administrator opens the "New event" modal, fills in the form, and clicks the "Create" button. When the create request does not succeed, the button appears non-functional: no event is created, the modal stays open, and no error message is shown. The administrator has no feedback about what went wrong or whether anything happened at all.

The root cause is that the create submit handler (`handleCreate` in `AdminEventsPage.tsx`) catches every failure from `eventService.createEvent` and only logs it to the browser console (`console.error`). There is no user-facing error state and no error UI in the create modal. Common failure paths that trigger this include backend validation rejections (HTTP 400 `VALIDATION_ERROR` such as `start_date must be in the future` or `end_date must be after start_date`, and HTTP 422 for missing required fields). Because these responses are swallowed, the click looks like it "does nothing."

This bug affects only the visible feedback and error handling of the create flow. The successful creation path and all other event operations already work and must remain unchanged.

## Bug Analysis

### Current Behavior (Defect)

When an event creation attempt fails, the failure is silent and the UI gives no indication of what happened.

1.1 WHEN an administrator clicks "Create" and the backend rejects the request with a validation error (e.g. missing title, `start_date` not in the future, or `end_date` not after `start_date`) THEN the system silently swallows the error (logs it only to the console), leaves the create modal open, creates no event, and displays no error message to the administrator
1.2 WHEN an administrator clicks "Create" and the create request fails for any reason (network error, server error, or validation error) THEN the system displays no visible feedback, so the "Create" button appears non-functional
1.3 WHEN an administrator submits the create form with empty required fields (empty title or empty start/end dates) THEN the system sends the request and the resulting failure is swallowed with no message indicating which fields are invalid

### Expected Behavior (Correct)

When an event creation attempt fails, the administrator must receive a clear, visible error message and be able to correct and retry.

2.1 WHEN an administrator clicks "Create" and the backend rejects the request with a validation error THEN the system SHALL keep the create modal open and display a visible error message describing why the creation failed
2.2 WHEN an administrator clicks "Create" and the create request fails for any reason (network error, server error, or validation error) THEN the system SHALL display a visible error message rather than failing silently
2.3 WHEN an administrator submits the create form with empty required fields THEN the system SHALL surface a visible validation message so the administrator understands what needs to be corrected
2.4 WHEN a previous create attempt showed an error and the administrator submits again THEN the system SHALL clear the prior error before showing the result of the new attempt

### Unchanged Behavior (Regression Prevention)

The existing successful flows and unrelated event operations must continue to behave exactly as before.

3.1 WHEN an administrator clicks "Create" with valid event data THEN the system SHALL CONTINUE TO create the event, close the create modal, reset the form fields, and refresh the events list
3.2 WHEN an administrator edits an existing event via the edit modal THEN the system SHALL CONTINUE TO save the changes and refresh the list as it does today
3.3 WHEN an administrator cancels/deletes an event THEN the system SHALL CONTINUE TO cancel it and refresh the list as it does today
3.4 WHEN the events list is loaded on page open THEN the system SHALL CONTINUE TO display the upcoming events as it does today
3.5 WHEN a create request succeeds THEN the system SHALL CONTINUE TO send member notifications and return a successful response from the backend endpoint unchanged

## Bug Condition and Property

### Bug Condition

```pascal
FUNCTION isBugCondition(X)
  INPUT: X of type CreateEventAttempt   // { formData, backendOutcome }
  OUTPUT: boolean

  // The bug manifests whenever a create attempt does NOT succeed:
  // the failure is swallowed and no feedback is shown to the user.
  RETURN X.backendOutcome = FAILURE   // validation error (400/422), server error (500), or network error
END FUNCTION
```

### Property: Fix Checking

```pascal
// For every failed create attempt, the UI must surface a visible error
// and must not silently close/reset as if it succeeded.
FOR ALL X WHERE isBugCondition(X) DO
  result ← handleCreate'(X)
  ASSERT visibleErrorMessageShown(result) = true
  ASSERT createModalStillOpen(result) = true
  ASSERT noEventFalselyReportedAsCreated(result) = true
END FOR
```

### Property: Preservation Checking

```pascal
// For every non-failing (successful) create attempt, behavior is unchanged:
// event created, modal closed, form reset, list refreshed.
FOR ALL X WHERE NOT isBugCondition(X) DO
  ASSERT handleCreate(X) = handleCreate'(X)   // modal closes, form resets, list reloads, event created
END FOR
```

**Definitions**
- **F** (`handleCreate`): the current submit handler that catches errors and only calls `console.error`.
- **F'** (`handleCreate'`): the fixed handler that keeps the modal open and shows a visible error message on failure, while leaving the success path identical.
