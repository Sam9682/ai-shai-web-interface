# Bugfix Requirements Document

## Introduction

The navigation bar (`frontend/src/components/Layout.tsx`) renders an "Events" link pointing to `/events` for every authenticated user. However, `frontend/src/App.tsx` defines no `<Route path="/events">`; the only events route is `/admin/events`, which renders `AdminEventsPage` and is intended for admins.

As a result, when a non-admin member navigates to `/events`, the inner `<Routes>` matches no route, no page component mounts, and `eventService.listEvents()` (GET `/api/events`) is never called. The member sees a blank content area instead of their assigned and public events.

The backend is confirmed correct: `list_events` returns public events plus events assigned to the requesting non-admin user, so the data is available through the API. The defect is purely on the frontend routing/UI side — the `/events` path has no route, and no non-admin-facing component exists that calls `listEvents()` and renders the results (that logic lives only inside `AdminEventsPage`).

This fix restores the ability for authenticated members to view their assigned and public events when they follow the existing "Events" navigation link.

## Bug Analysis

### Current Behavior (Defect)

When an authenticated non-admin member follows the "Events" navigation link to `/events`:

1.1 WHEN an authenticated non-admin member navigates to `/events` THEN the system matches no route inside the layout's inner `<Routes>` and renders a blank content area

1.2 WHEN an authenticated non-admin member navigates to `/events` THEN the system never mounts any events component and never calls `eventService.listEvents()`, so the member's assigned and public events are never fetched or displayed

### Expected Behavior (Correct)

2.1 WHEN an authenticated non-admin member navigates to `/events` THEN the system SHALL render a member-facing events view (not a blank area)

2.2 WHEN an authenticated non-admin member navigates to `/events` THEN the system SHALL call `eventService.listEvents()` and display the assigned and public events returned by the API

### Unchanged Behavior (Regression Prevention)

3.1 WHEN an admin navigates to `/admin/events` THEN the system SHALL CONTINUE TO render `AdminEventsPage` with full create, edit, and cancel management capabilities

3.2 WHEN an unauthenticated user navigates to `/events` THEN the system SHALL CONTINUE TO enforce authentication via `ProtectedRoute` (redirect to login) as it does for other protected routes

3.3 WHEN a user navigates to any other existing route (e.g. `/`, `/forum`, `/documents`, `/oracle`, `/admin/*`) THEN the system SHALL CONTINUE TO render the same page component and behavior as before

3.4 WHEN an admin uses the "Events" navigation dropdown THEN the system SHALL CONTINUE TO show the "Manage events" link to `/admin/events`
