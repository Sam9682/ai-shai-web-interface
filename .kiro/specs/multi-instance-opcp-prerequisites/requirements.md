# Requirements Document

## Introduction

The OPCP installation prerequisites feature under the Forum menu currently supports a single, implicit installation whose answers are scoped per user via the key (user_id, slug, row_id). This feature introduces multiple named OPCP installations. Each installation carries a project name/title (for example "RACK DEMO MDC MAROC") and owns its own prerequisite content and answers, which are shared across all users viewing that installation. Administrators manage the lifecycle of installations (create, edit, delete), members contribute values and answers, and visitors read content. A list page becomes the entry point under the Forum prerequisites navigation, and existing single-instance data is migrated into a default installation.

## Glossary

- **Installation**: A named OPCP prerequisites instance identified by a unique installation identifier and described by a project name/title. Owns its own prerequisite content and answers.
- **Installation_Id**: The unique identifier assigned to an Installation.
- **Project_Name**: The human-readable title of an Installation, for example "RACK DEMO MDC MAROC".
- **Prerequisite_Content**: The static content for a prerequisite page, scoped to an Installation and keyed by slug.
- **Prerequisite_Answer**: A client answer for a prerequisite question, scoped to an Installation and keyed by (installation_id, slug, row_id).
- **Prerequisites_System**: The combined backend service (FastAPI/SQLAlchemy) and frontend (React) that manages Installations, Prerequisite_Content, and Prerequisite_Answers.
- **Administrator**: A user with the ADMINISTRATOR role.
- **Member**: A user with the MEMBER role.
- **Visitor**: A user with the VISITOR role.
- **Installation_List_Page**: The page under the Forum prerequisites navigation that lists existing Installations by Project_Name.
- **Default_Installation**: The single Installation created during data migration into which existing single-instance Prerequisite_Content and Prerequisite_Answers are moved.

## Requirements

### Requirement 1: Installation entity and data model

**User Story:** As a coordinator, I want prerequisite content and answers to belong to a named installation, so that multiple OPCP installations can be tracked independently.

#### Acceptance Criteria

1. THE Prerequisites_System SHALL persist an Installation with a unique Installation_Id, a Project_Name, a creation timestamp, and a last-updated timestamp.
2. THE Prerequisites_System SHALL associate each Prerequisite_Content record with exactly one Installation_Id.
3. THE Prerequisites_System SHALL associate each Prerequisite_Answer record with exactly one Installation_Id.
4. THE Prerequisites_System SHALL enforce uniqueness of Prerequisite_Answer records on the combination of Installation_Id, slug, and row_id.
5. THE Prerequisites_System SHALL enforce uniqueness of Prerequisite_Content records on the combination of Installation_Id and slug.
6. WHEN two users edit the same Prerequisite_Answer within the same Installation, THE Prerequisites_System SHALL persist the most recently submitted value.

### Requirement 2: Shared data per installation

**User Story:** As a member, I want the values I enter for an installation to be visible to everyone viewing that installation, so that the team collaborates on one shared record.

#### Acceptance Criteria

1. WHEN a user requests Prerequisite_Content for a given Installation_Id and slug, THE Prerequisites_System SHALL return the content stored for that Installation_Id and slug regardless of which user created it.
2. WHEN a user requests Prerequisite_Answers for a given Installation_Id and slug, THE Prerequisites_System SHALL return the answers stored for that Installation_Id and slug regardless of which user created them.
3. WHEN a Member saves a Prerequisite_Answer for a given Installation_Id, slug, and row_id, THE Prerequisites_System SHALL record the editing user identifier and the update timestamp on that record.

### Requirement 3: Installation lifecycle management

**User Story:** As an administrator, I want to create, edit, and delete installations, so that I can manage the set of OPCP projects.

#### Acceptance Criteria

1. WHEN an Administrator submits a create request with a Project_Name, THE Prerequisites_System SHALL create a new Installation with that Project_Name and a new Installation_Id.
2. WHEN an Administrator submits an edit request with an Installation_Id and a new Project_Name, THE Prerequisites_System SHALL update the Project_Name of the identified Installation.
3. WHEN an Administrator confirms a delete request for an Installation_Id, THE Prerequisites_System SHALL permanently remove the identified Installation together with all associated Prerequisite_Content and Prerequisite_Answers.
4. IF a create or edit request omits the Project_Name, THEN THE Prerequisites_System SHALL reject the request and return a validation error.
5. IF a request references an Installation_Id that does not exist, THEN THE Prerequisites_System SHALL return a not-found error.

### Requirement 4: Role-based access control

**User Story:** As a security-conscious operator, I want installation management restricted to administrators and value editing restricted to members and above, so that access matches responsibility.

#### Acceptance Criteria

1. IF a user without the ADMINISTRATOR role submits a create, edit, or delete request for an Installation, THEN THE Prerequisites_System SHALL reject the request and return an authorization error.
2. WHERE a user holds the MEMBER role, THE Prerequisites_System SHALL permit that user to save Prerequisite_Answers for an Installation.
3. WHERE a user holds the VISITOR role, THE Prerequisites_System SHALL permit that user to read Prerequisite_Content and Prerequisite_Answers.
4. IF a user with the VISITOR role submits a save request for a Prerequisite_Answer, THEN THE Prerequisites_System SHALL reject the request and return an authorization error.
5. WHERE a user holds the ADMINISTRATOR role, THE Prerequisites_System SHALL permit that user to read Prerequisite_Content and Prerequisite_Answers for any Installation.

### Requirement 5: Installation list and navigation

**User Story:** As a user, I want to see a list of installations first and select one, so that I can open the prerequisite pages for a specific project.

#### Acceptance Criteria

1. WHEN a user opens the Forum prerequisites navigation, THE Prerequisites_System SHALL display the Installation_List_Page as the entry point.
2. THE Installation_List_Page SHALL display each existing Installation by its Project_Name.
3. WHEN a user selects an Installation on the Installation_List_Page, THE Prerequisites_System SHALL open the prerequisite pages scoped to the selected Installation_Id.
4. WHERE a user holds the ADMINISTRATOR role, THE Installation_List_Page SHALL display create, edit, and delete controls.
5. WHERE a user holds the MEMBER or VISITOR role, THE Installation_List_Page SHALL hide the create, edit, and delete controls.

### Requirement 6: Deletion confirmation

**User Story:** As an administrator, I want a confirmation step before deleting an installation, so that I do not remove project data by accident.

#### Acceptance Criteria

1. WHEN an Administrator activates the delete control for an Installation, THE Prerequisites_System SHALL present a confirmation dialog that identifies the Installation by Project_Name.
2. WHEN an Administrator confirms the deletion in the confirmation dialog, THE Prerequisites_System SHALL permanently remove the Installation and all associated content and answers.
3. WHEN an Administrator cancels the confirmation dialog, THE Prerequisites_System SHALL retain the Installation and all associated content and answers.

### Requirement 7: Data migration of existing single-instance data

**User Story:** As an operator upgrading the system, I want existing prerequisite data preserved, so that no answers or content are lost when multiple installations are introduced.

#### Acceptance Criteria

1. WHEN the schema migration runs, THE Prerequisites_System SHALL create a Default_Installation with a Project_Name.
2. WHEN the data migration runs, THE Prerequisites_System SHALL assign existing Prerequisite_Content records to the Default_Installation.
3. WHEN the data migration runs, THE Prerequisites_System SHALL assign existing Prerequisite_Answer records to the Default_Installation.
4. WHERE multiple existing Prerequisite_Answer records share the same slug and row_id across different users, THE Prerequisites_System SHALL resolve them into records that satisfy the Installation_Id, slug, row_id uniqueness constraint.
