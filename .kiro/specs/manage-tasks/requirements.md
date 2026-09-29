# Requirements Document

## Introduction

This feature adds a "Manage Tasks" capability to the OPCP web interface, exposed under a renamed "Events/Tasks" navigation menu. Tasks mirror the existing Events feature but with three behavioral differences: Tasks have no participant limit, Tasks carry a mandatory single "owner" user (in addition to the existing multi-user assignee list), and Task visibility is private-by-default — a task is only visible to its owner, its assigned users, or an administrator.

The implementation reuses the established Events architecture as a template: a backend model + FastAPI router + Alembic migration, and a frontend page + service + navigation entry, all with FR/EN i18n.

## Glossary

- **Task**: A work item mirroring an Event, without participant limits and with a mandatory owner.
- **Owner**: The single user accountable for a task. Mandatory; defaults to the creator when unspecified.
- **Assignee**: A user assigned to a task via the multi-user picker. A task may have zero or more assignees.
- **Admin**: A user with the ADMIN role who can see and manage all tasks.
- **Private-by-default**: Visibility rule where a task with no assignees is still only visible to its owner and admins (unlike Events, where empty assignment means public).

## Requirements

### Requirement 1: Navigation menu

**User Story:** As a logged-in user, I want a "Manage Tasks" entry under the top navigation so that I can reach the task management page.

#### Acceptance Criteria
1. WHEN the top navigation renders THEN the system SHALL display the primary menu item labeled "Events/Tasks" (FR: "Événements/Tâches") in place of the current "Events" label.
2. WHEN a user hovers or opens the "Events/Tasks" menu THEN the system SHALL show a "Manage Tasks" submenu item (FR: "Gérer les tâches") alongside the existing "Manage events" item.
3. WHEN a user clicks "Manage Tasks" THEN the system SHALL navigate to the task management page route.
4. The navigation labels SHALL be provided through the i18n translation table for both FR and EN.

### Requirement 2: Task creation

**User Story:** As a logged-in user, I want to create a task with an owner and assignees so that responsibility is clearly recorded.

#### Acceptance Criteria
1. WHEN a user opens the "New task" modal THEN the system SHALL display fields: Title, Description, Start date, End date, Location, Owner (single user), and Assign to users (multiple users).
2. The task modal SHALL NOT display a "Max number of participants" field.
3. WHEN a user submits a task without a Title THEN the system SHALL reject the request and surface a validation error.
4. WHEN a user submits a task with an Owner that does not reference an existing user THEN the system SHALL reject the request with a clear error.
5. WHEN a user submits a task without explicitly choosing an Owner THEN the system SHALL default the owner to the creating user.
6. WHEN a valid task is submitted THEN the system SHALL persist it and refresh the task list.

### Requirement 3: Owner field single-select

**User Story:** As a user creating a task, I want to designate exactly one owner so that a single person is accountable.

#### Acceptance Criteria
1. The Owner field SHALL allow selecting at most one user.
2. WHEN a user selects an owner while one is already selected THEN the system SHALL replace the previous selection.
3. The Owner field SHALL be searchable by name and email, consistent with the existing assignee picker behavior.
4. The Owner SHALL be distinct in the data model from the multi-user assignee list, and a user MAY be both owner and an assignee.

### Requirement 4: Task editing and cancellation

**User Story:** As an authorized user, I want to edit or cancel a task so that I can keep it current.

#### Acceptance Criteria
1. WHEN a user opens the edit modal for a task THEN the system SHALL prefill all task fields including Owner and Assignees.
2. WHEN a user saves edits THEN the system SHALL persist the changes and refresh the list.
3. WHEN a user cancels a task and confirms THEN the system SHALL mark the task cancelled without hard-deleting it, consistent with event cancellation behavior.
4. WHEN an update references a non-existent owner or assignee THEN the system SHALL reject the change without mutating state.

### Requirement 5: Task visibility

**User Story:** As a user, I want to see only tasks that concern me so that my task list is relevant, while admins retain full oversight.

#### Acceptance Criteria
1. WHEN an unauthenticated visitor requests tasks THEN the system SHALL deny access because authentication is required.
2. WHEN a non-admin logged-in user lists tasks THEN the system SHALL return only tasks where the user is the owner OR is one of the assigned users.
3. WHEN an administrator lists tasks THEN the system SHALL return all tasks regardless of owner or assignment.
4. WHEN a task has an empty assignee list THEN the system SHALL keep it visible only to its owner and admins and SHALL NOT treat it as public.

### Requirement 6: Data model and persistence

**User Story:** As a maintainer, I want tasks stored in their own structures so that they evolve independently from events.

#### Acceptance Criteria
1. The system SHALL persist tasks in a dedicated table separate from events.
2. Each task SHALL store title, description, start and end dates, location, owner as a mandatory FK to users, creator, status, and timestamps.
3. Task-to-assignee relationships SHALL be stored in a dedicated join structure supporting multiple assignees.
4. The schema change SHALL be delivered as a reversible Alembic migration.

### Requirement 7: Internationalization and styling

**User Story:** As a bilingual user, I want the tasks UI in my language and consistent with the rest of the app.

#### Acceptance Criteria
1. All task UI strings SHALL have FR and EN entries in the translation table.
2. The task page and modals SHALL reuse the existing visual styling used by the events page.
