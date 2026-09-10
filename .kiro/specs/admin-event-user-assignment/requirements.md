# Requirements Document

## Introduction

This feature lets administrators assign an event to a specific existing user at creation time or when editing an event. When an event is assigned to a user, that event becomes private: only the assigned user and administrators can see it, and it is hidden from all other members. Assignment is optional. When no user is assigned, the event remains public and visible to all members, preserving the current behavior. Administrators set, change, or clear the assignment through a searchable user picker available on both the create and edit modals of the events administration page.

## Glossary

- **Events_System**: The backend and frontend components that manage events, including the events API endpoints, the Event data model, and the events administration page.
- **Events_API**: The backend FastAPI endpoints under `/api/events` responsible for creating, listing, and updating events.
- **Admin_Events_Page**: The frontend page at `/admin/events` where administrators create and edit events.
- **Events_Page**: The frontend page where members view the list of events available to them.
- **User_Picker**: The searchable selection control on the Admin_Events_Page create and edit modals used to choose the assigned user.
- **Administrator**: An authenticated user whose role is administrator, authorized through the `require_admin` dependency.
- **Member**: An authenticated non-administrator user whose role is member.
- **Assigned_User**: The existing user selected by an Administrator to whom an event is made private.
- **Assigned_Event**: An event that has a non-null Assigned_User.
- **Public_Event**: An event that has no Assigned_User and is visible to all Members and Administrators.
- **assigned_user_id**: The nullable foreign key column on the Event model that references the id of the Assigned_User.

## Requirements

### Requirement 1

**User Story:** As an administrator, I want to optionally assign an event to a specific existing user when creating it, so that the event is created privately for that user.

#### Acceptance Criteria

1. WHERE an Administrator selects a user in the User_Picker during event creation, THE Events_API SHALL store the selected user identifier as the assigned_user_id of the created event.
2. WHERE an Administrator creates an event without selecting a user in the User_Picker, THE Events_API SHALL store the assigned_user_id as null.
3. IF a non-administrator sends a request to create an assigned event, THEN THE Events_API SHALL reject the request with an authorization error and SHALL NOT create the event.
4. IF the submitted assigned_user_id does not correspond to an existing user, THEN THE Events_API SHALL reject the request with a validation error and SHALL NOT create the event.

### Requirement 2

**User Story:** As an administrator, I want to set, change, or clear the assigned user when editing an event, so that I can adjust an event's visibility after creation.

#### Acceptance Criteria

1. WHERE an Administrator selects a user in the User_Picker during event editing, THE Events_API SHALL update the assigned_user_id of the event to the selected user identifier.
2. WHERE an Administrator clears the selection in the User_Picker during event editing, THE Events_API SHALL set the assigned_user_id of the event to null.
3. IF the submitted assigned_user_id does not correspond to an existing user during editing, THEN THE Events_API SHALL reject the request with a validation error and SHALL NOT modify the assigned_user_id.
4. IF a non-administrator sends a request to update an event assignment, THEN THE Events_API SHALL reject the request with an authorization error and SHALL NOT modify the event.

### Requirement 3

**User Story:** As a member, I want to see only public events and events assigned to me, so that private events belonging to other users remain hidden from me.

#### Acceptance Criteria

1. WHEN a Member requests the event list, THE Events_API SHALL return all Public_Events.
2. WHEN a Member requests the event list, THE Events_API SHALL return every Assigned_Event whose Assigned_User is the requesting Member.
3. WHEN a Member requests the event list, THE Events_API SHALL exclude every Assigned_Event whose Assigned_User is a different user.
4. WHEN an Administrator requests the event list, THE Events_API SHALL return all Public_Events and all Assigned_Events regardless of Assigned_User.

### Requirement 4

**User Story:** As an administrator, I want a searchable user picker on the create and edit modals, so that I can find and select the correct user among many users.

#### Acceptance Criteria

1. WHEN an Administrator opens the create modal on the Admin_Events_Page, THE Admin_Events_Page SHALL display the User_Picker with no user selected.
2. WHEN an Administrator opens the edit modal for an Assigned_Event, THE Admin_Events_Page SHALL display the User_Picker pre-populated with the current Assigned_User.
3. WHEN an Administrator opens the edit modal for a Public_Event, THE Admin_Events_Page SHALL display the User_Picker with no user selected.
4. WHEN an Administrator enters text in the User_Picker, THE Admin_Events_Page SHALL filter the selectable users to those matching the entered text.
5. WHERE an Administrator has selected a user in the User_Picker, THE Admin_Events_Page SHALL provide a control to clear the selection.

### Requirement 5

**User Story:** As a developer, I want the event data model and API responses to carry the assignment, so that assignment persists and is available to the frontend.

#### Acceptance Criteria

1. THE Events_System SHALL persist a nullable assigned_user_id foreign key on the Event model that references the id of a user.
2. WHEN the Events_API returns an event, THE Events_API SHALL include the assigned_user_id field with the assigned user identifier or null.
3. WHILE an existing event has no assignment recorded, THE Events_System SHALL treat the event as a Public_Event with a null assigned_user_id.
