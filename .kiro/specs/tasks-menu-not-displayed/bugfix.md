# Bugfix Requirements Document

## Introduction

The top navigation bar does not display a "Tasks" menu, even though the Tasks feature is coded in the frontend (`frontend/src/services/taskService.ts`) and fully described in the existing `manage-tasks` design spec. The "Events" menu renders correctly with a "Manage events" dropdown for admins, but there is no equivalent "Tasks" menu.

Investigation of the navigation layer confirms the root cause: the Tasks entry was never wired into the navigation. Specifically:

- `frontend/src/components/Layout.tsx` renders Home, Forum, Events (with a `/admin/events` dropdown), Documents, AI Oracle, OPCP installations, Users, and Configuration — but nothing for Tasks, in either the desktop menu or the mobile menu.
- `frontend/src/i18n/translations.ts` defines `nav.events` and `nav.events.manage` in both FR and EN, but has no `nav.tasks.manage` (or equivalent) key.
- `frontend/src/App.tsx` defines a `/admin/events` route but no `/admin/tasks` route.

The `manage-tasks` design spec prescribes the intended wiring: a Tasks entry alongside Events, a `nav.tasks.manage` translation key, a "Manage tasks" dropdown link, a `/admin/tasks` route, and matching mobile menu entries. This bug fixes the missing navigation wiring so the Tasks menu appears consistently with the Events menu.

Impact: users (and admins in particular) cannot discover or reach the Tasks feature from the navigation bar, making the coded Tasks functionality effectively inaccessible from the UI.

## Bug Analysis

### Current Behavior (Defect)

The Tasks menu is entirely absent from the navigation because the navigation layer contains no Tasks wiring.

1.1 WHEN an authenticated user views the desktop navigation bar THEN the system renders no "Tasks" menu item alongside the existing "Events" menu item
1.2 WHEN an authenticated admin hovers the navigation area where a Tasks dropdown would appear THEN the system shows no "Manage tasks" dropdown entry (no `nav.tasks.manage` label and no `/admin/tasks` link exist)
1.3 WHEN an authenticated user opens the mobile navigation menu THEN the system renders no "Tasks" entry and no admin "Manage tasks" sub-entry
1.4 WHEN the application resolves navigation labels THEN the system finds no `nav.tasks.manage` translation key in either the French or English translation set
1.5 WHEN a user navigates to `/admin/tasks` THEN the system has no route defined for it and does not render the Tasks admin page

### Expected Behavior (Correct)

The Tasks menu should appear and behave analogously to the Events menu, per the `manage-tasks` design spec.

2.1 WHEN an authenticated user views the desktop navigation bar THEN the system SHALL render a "Tasks" menu item positioned analogously to the "Events" menu item
2.2 WHEN an authenticated admin hovers the Tasks menu THEN the system SHALL show a "Manage tasks" dropdown entry that links to `/admin/tasks`, mirroring the "Manage events" dropdown behavior
2.3 WHEN an authenticated user opens the mobile navigation menu THEN the system SHALL render a "Tasks" entry, and for admins a "Manage tasks" sub-entry linking to `/admin/tasks`, consistent with the mobile Events entries
2.4 WHEN the application resolves navigation labels THEN the system SHALL provide a `nav.tasks.manage` (or equivalent) translation key in both the French and English translation sets
2.5 WHEN a user navigates to `/admin/tasks` THEN the system SHALL resolve a defined route that renders the Tasks admin page under the same protection used for `/admin/events`

### Unchanged Behavior (Regression Prevention)

Existing navigation and Events behavior must remain intact.

3.1 WHEN an authenticated user views the navigation bar THEN the system SHALL CONTINUE TO display the "Events" menu with its "Manage events" dropdown for admins exactly as before
3.2 WHEN an authenticated user views the navigation bar THEN the system SHALL CONTINUE TO display Home, Forum, Documents, AI Oracle, OPCP installations, Users, and Configuration items with their existing routes and admin gating
3.3 WHEN a user switches language between French and English THEN the system SHALL CONTINUE TO resolve all existing navigation labels (including `nav.events` and `nav.events.manage`) correctly
3.4 WHEN a user navigates to `/admin/events` or any other existing route THEN the system SHALL CONTINUE TO render the corresponding page under its existing route protection
3.5 WHEN a non-admin authenticated user views the navigation THEN the system SHALL CONTINUE TO hide admin-only dropdown entries, applying the same gating to the new Tasks "Manage tasks" entry as is applied to "Manage events"
