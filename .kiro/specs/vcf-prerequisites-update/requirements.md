# Requirements Document

## Introduction

This feature covers two related pieces of work on the OPCP installation prerequisites area under the Forum menu.

Part A refines the VCF prerequisites page. The VCF page is driven by `vcfConfig: QuestionFormConfig` in `frontend/src/components/prerequisites/configs.ts` and rendered by `QuestionAnswerForm`. Today that config holds placeholder rows (management VLAN, vMotion VLAN, DNS servers, NTP servers, certificates, automation script). The real VCF parameters are defined in the reference document `docs/to_publish/OPCP - CloudStore VCF parameters_0.2.pdf`. Part A replaces the placeholder rows with the real customer-input VCF parameters from that document, keeping the `QuestionFormConfig`/`QuestionAnswerForm` archetype and the existing French labeling convention, and staying consistent with the parent spec `multi-instance-opcp-prerequisites` (installation-scoped, question archetype). The legacy `TrackingForm`/`FormConfig` archetype is not reintroduced.

Part B fixes the create-Installation failure in the UI. The frontend `prerequisitesService.ts` calls installation-scoped backend paths (`GET/POST /api/prerequisites/installations`, `PUT/DELETE /api/prerequisites/installations/{id}`, and `.../installations/{id}/{slug}/content` and `.../installations/{id}/{slug}/answers[/{row_id}]`). The backend `app/prerequisites/router.py` exposes only the older single-instance paths (`/{slug}/content`, `/{slug}/answers`) and scopes `PrerequisiteAnswer` by `user_id` only. The migration `migrations/versions/20260223_0000_multi_instance_opcp_prerequisites_multi_instance_opcp_prerequisites.py` already created the `installations` table and references a model `app/models/installation.py` that does not exist, and no installations router/handler exists. As a result the frontend POST to create an Installation has no matching backend route and creation fails. Part B adds the missing Installation model, the installation-scoped CRUD and content/answer endpoints, and the schema wiring so the frontend contract is satisfied.

The scanner log noise observed in the environment (PostgreSQL "invalid startup packet", nginx malformed-TLS 400 responses, uvicorn "Invalid HTTP request received") is internet port-scanner traffic and is explicitly out of scope; it is documented here only as context and is not addressed by this feature.

## Glossary

- **VCF_Config**: The `vcfConfig` export of type `QuestionFormConfig` in `frontend/src/components/prerequisites/configs.ts` that drives the VCF prerequisites page.
- **Question_Answer_Form**: The `QuestionAnswerForm` React component that renders a `QuestionFormConfig` as read-only question columns plus an editable client answer.
- **Question_Row**: A single row in a `QuestionFormConfig` section, composed of `id`, `questionPrimary`, optional `questionSecondary`, `mandatory` flag, `exampleValue`, and `commentsHint`.
- **VCF_Reference_Document**: The file `docs/to_publish/OPCP - CloudStore VCF parameters_0.2.pdf` that lists the VCF deployment parameters.
- **Customer_Input_Parameter**: A VCF parameter in the VCF_Reference_Document that requires a customer-supplied value (has a "Value:" field), as opposed to a parameter marked "Provided by the CloudStore / keep default".
- **Prerequisites_Frontend**: The React service `frontend/src/services/prerequisitesService.ts` and the prerequisites pages/components that call it.
- **Prerequisites_Backend**: The FastAPI router `app/prerequisites/router.py` (and any supporting router), plus the SQLAlchemy models and Pydantic schemas that serve the `/api/prerequisites/*` routes.
- **Installation**: A named OPCP prerequisites instance identified by a unique Installation_Id and described by a Project_Name; owns its own content and answers (as defined by the parent spec `multi-instance-opcp-prerequisites`).
- **Installation_Id**: The unique UUID identifier of an Installation.
- **Project_Name**: The human-readable title of an Installation.
- **Installation_Model**: The SQLAlchemy model `app/models/installation.py` mapping the `installations` table created by the multi-instance migration.
- **Administrator**: A user with the ADMINISTRATOR role.
- **Member**: A user with the MEMBER role.
- **Prerequisite_Content**: The static content for a prerequisite page, keyed by slug and (per the migration) scoped to an Installation_Id.
- **Prerequisite_Answer**: A client answer for a prerequisite question, keyed by (Installation_Id, slug, row_id) per the migration.

## Requirements

### Requirement 1: VCF page uses real customer-input parameters

**User Story:** As a coordinator preparing a VCF deployment, I want the VCF prerequisites page to list the actual VCF parameters, so that customers fill in the values the deployment really needs.

#### Acceptance Criteria

1. THE VCF_Config SHALL define one Question_Row for each Customer_Input_Parameter of the VCF_Reference_Document.
2. THE VCF_Config SHALL exclude every VCF_Reference_Document parameter that is marked "Provided by the CloudStore / keep default — no customer input required".
3. THE VCF_Config SHALL retain the `QuestionFormConfig` shape, and Question_Answer_Form SHALL render the VCF_Config without changes to its rendering contract.
4. WHERE the legacy `FormConfig`/`TrackingForm` archetype exists, THE VCF_Config SHALL NOT use that archetype.

### Requirement 2: VCF row structure and content

**User Story:** As a customer filling the VCF page, I want each parameter presented with a clear question, an example, and guidance, so that I can supply the correct value.

#### Acceptance Criteria

1. THE VCF_Config SHALL define, for each Question_Row, a `questionPrimary` value derived from the parameter name and description in the VCF_Reference_Document.
2. WHERE the VCF_Reference_Document provides an example for a parameter, THE VCF_Config SHALL set the corresponding Question_Row `exampleValue` from that example.
3. WHERE the VCF_Reference_Document provides descriptive guidance for a parameter, THE VCF_Config SHALL set the corresponding Question_Row `commentsHint` from that guidance.
4. THE VCF_Config SHALL express Question_Row label text in French, consistent with the existing configs in `configs.ts`.
5. THE VCF_Config SHALL set the `mandatory` flag of each Question_Row according to whether the VCF_Reference_Document requires the parameter for the deployment.

### Requirement 3: VCF row grouping and identifiers

**User Story:** As a maintainer of the prerequisites configs, I want the VCF rows organized and uniquely identified, so that the page is navigable and answers persist against stable keys.

#### Acceptance Criteria

1. THE VCF_Config SHALL group Question_Rows into sections that reflect the VCF_Reference_Document structure, including the Management Domain and Workload Domain groupings and their sub-sections (Network, DNS, Authentication & OpenStack, Passwords & Secrets, Miscellaneous, General).
2. THE VCF_Config SHALL assign each Question_Row an `id` that is unique within the VCF page.
3. THE VCF_Config SHALL assign each section an `id` that is unique within the VCF page.
4. WHEN the VCF_Config is changed, THE VCF_Config SHALL keep each existing Question_Row `id` stable for parameters that remain present, so that previously saved Prerequisite_Answers continue to resolve.

### Requirement 4: Create-Installation failure is attributed to the missing backend contract

**User Story:** As a developer fixing the create-Installation bug, I want the failure reproduced and attributed to its root cause, so that the fix targets the real defect rather than the scanner log noise.

#### Acceptance Criteria

1. WHEN the Prerequisites_Frontend sends `POST /api/prerequisites/installations` against the current Prerequisites_Backend, THE Prerequisites_Backend SHALL return a not-found response because no matching installations route exists, confirming the reproduction.
2. THE feature SHALL attribute the create-Installation failure to the absence of the Installation_Model, the installations CRUD endpoints, and the installation-scoped content/answer endpoints in the Prerequisites_Backend.
3. THE feature SHALL treat the PostgreSQL "invalid startup packet", nginx malformed-TLS 400, and uvicorn "Invalid HTTP request received" log entries as out of scope for the create-Installation fix.

### Requirement 5: Installation SQLAlchemy model

**User Story:** As a backend developer, I want an Installation model matching the migration, so that installations can be persisted and queried.

#### Acceptance Criteria

1. THE Prerequisites_Backend SHALL provide an Installation_Model at `app/models/installation.py` that maps the `installations` table created by the multi-instance migration.
2. THE Installation_Model SHALL define a UUID `id` primary key, a `project_name` string column, a `created_at` timestamp column, an `updated_at` timestamp column, a nullable `created_by` user reference, and a nullable `updated_by` user reference.
3. THE Installation_Model SHALL be importable through the `app.models` package alongside the existing models.

### Requirement 6: Installations CRUD endpoints

**User Story:** As an administrator, I want to list, create, edit, and delete installations through the API, so that the Installation list page works end to end.

#### Acceptance Criteria

1. WHEN a client sends `GET /api/prerequisites/installations`, THE Prerequisites_Backend SHALL return a response body of the form `{ "installations": [ ... ] }` listing existing Installations.
2. WHEN an Administrator sends `POST /api/prerequisites/installations` with a non-empty `project_name`, THE Prerequisites_Backend SHALL create a new Installation and return the created Installation including its Installation_Id, Project_Name, `created_at`, and `updated_at`.
3. WHEN an Administrator sends `PUT /api/prerequisites/installations/{id}` with a non-empty `project_name` for an existing Installation_Id, THE Prerequisites_Backend SHALL update the Project_Name and return the updated Installation.
4. WHEN an Administrator sends `DELETE /api/prerequisites/installations/{id}` for an existing Installation_Id, THE Prerequisites_Backend SHALL remove the identified Installation together with its associated Prerequisite_Content and Prerequisite_Answers.
5. IF a `POST` or `PUT` installations request supplies an empty or whitespace-only `project_name`, THEN THE Prerequisites_Backend SHALL reject the request and return a validation error.
6. IF a `PUT` or `DELETE` installations request references an Installation_Id that does not exist, THEN THE Prerequisites_Backend SHALL return a not-found error.
7. IF a user without the ADMINISTRATOR role sends a create, update, or delete installations request, THEN THE Prerequisites_Backend SHALL reject the request and return an authorization error.

### Requirement 7: Installation-scoped content and answer endpoints

**User Story:** As a member using a specific installation, I want content and answers scoped to that installation, so that each project keeps its own data as the frontend expects.

#### Acceptance Criteria

1. WHEN a client sends `GET /api/prerequisites/installations/{id}/{slug}/content` for an existing Installation_Id and known static slug, THE Prerequisites_Backend SHALL return the Prerequisite_Content stored for that Installation_Id and slug.
2. WHEN an Administrator sends `PUT /api/prerequisites/installations/{id}/{slug}/content` for an existing Installation_Id and known static slug, THE Prerequisites_Backend SHALL persist the content scoped to that Installation_Id and slug.
3. WHEN a client sends `GET /api/prerequisites/installations/{id}/{slug}/answers` for an existing Installation_Id and known question slug, THE Prerequisites_Backend SHALL return the `{ row_id: answer }` map stored for that Installation_Id and slug.
4. WHEN a Member sends `PUT /api/prerequisites/installations/{id}/{slug}/answers/{row_id}` for an existing Installation_Id and known question slug, THE Prerequisites_Backend SHALL persist the answer keyed by (Installation_Id, slug, row_id).
5. THE Prerequisites_Backend SHALL scope Prerequisite_Content and Prerequisite_Answer records by Installation_Id in accordance with the multi-instance migration schema.
6. IF a request references an Installation_Id that does not exist, THEN THE Prerequisites_Backend SHALL return a not-found error.
7. IF a request references a slug that is not a recognized prerequisite resource, THEN THE Prerequisites_Backend SHALL return a resource-specific not-found error.

### Requirement 8: Router registration and consistent authorization

**User Story:** As a maintainer, I want the new endpoints registered and secured like the rest of the API, so that behavior is consistent and predictable.

#### Acceptance Criteria

1. THE Prerequisites_Backend SHALL register the installations and installation-scoped endpoints on the application under the `/api/prerequisites` path family.
2. THE Prerequisites_Backend SHALL apply authentication to the new endpoints using the existing authentication dependencies used by the other prerequisites endpoints.
3. THE Prerequisites_Backend SHALL restrict create, update, and delete of Installations and static content to Administrators, matching the frontend admin-only controls.
4. WHERE the existing non-installation prerequisites behavior is still required by other consumers, THE Prerequisites_Backend SHALL preserve that behavior.

### Requirement 9: Verification

**User Story:** As a reviewer, I want the change verified by tests, so that the fix is correct and does not regress existing behavior.

#### Acceptance Criteria

1. THE feature SHALL include backend tests (pytest) covering the installations CRUD endpoints, the installation-scoped content and answer endpoints, the empty `project_name` rejection, and the non-administrator authorization rejection.
2. THE feature SHALL include frontend tests (vitest) covering the VCF_Config rows and the installation create flow in the Prerequisites_Frontend.
3. WHEN the existing prerequisites 404 tests run against the updated Prerequisites_Backend, THE Prerequisites_Backend SHALL continue to pass those tests without regression.
