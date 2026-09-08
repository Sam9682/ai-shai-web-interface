# Requirements Document

## Introduction

This feature restructures the "OPCP installation prerequisites" menu so that each tab of the source Excel workbook maps to a dedicated submenu page. The new structure replaces the previous LandingZone-based menu and introduces seven pages: How to use, Basics, Network Checklist, Core Control Plane, CloudStore, VCF, and Network Flux.

Pages fall into three behavioral categories: a static read-only informational page (How to use), Admin-editable static content pages (Basics, Network Flux), and question-and-answer pages where fixed question columns are presented to the customer alongside an editable "Client answer" column (Network Checklist, Core Control Plane, CloudStore, VCF).

Navigation is centralized in a single `PREREQ_NAV_ITEMS` definition consumed by the shared layout. All page content and customer answers are persisted server-side through new backend endpoints and shared across users and sessions, replacing the previous browser-local persistence model. Per-tab content is scaffolded now with placeholder and example rows; the definitive question text and values will be supplied later.

## Glossary

- **Prerequisites_Menu**: The "OPCP installation prerequisites" navigation dropdown rendered by the layout component, whose entries are defined by `PREREQ_NAV_ITEMS`.
- **Prerequisites_Page**: A page rendered under the route `/prerequisites/{slug}` for one workbook tab.
- **Navigation_Config**: The `PREREQ_NAV_ITEMS` constant in `types.ts` that lists the label and route of each Prerequisites_Page.
- **Layout_Component**: The `Layout.tsx` component that renders the Prerequisites_Menu from the Navigation_Config.
- **Router_Component**: The `App.tsx` component that registers routes for each Prerequisites_Page.
- **Route_Guard**: The `ProtectedRoute` component that restricts access to authenticated users.
- **Auth_Service**: The `authService` module exposing `isAuthenticated()` and `isAdmin()`.
- **Admin_User**: An authenticated user whose `user_role` equals `administrator`, for whom `Auth_Service.isAdmin()` returns true.
- **Member_User**: An authenticated user whose `user_role` is not `administrator` (the customer role); no new role is introduced.
- **How_To_Use_Page**: The static, read-only informational Prerequisites_Page.
- **Static_Content_Page**: A Prerequisites_Page (Basics, Network Flux) whose content is static and editable only by an Admin_User.
- **Question_Answer_Page**: A Prerequisites_Page (Network Checklist, Core Control Plane, CloudStore, VCF) that presents fixed question columns plus an editable Client_Answer column.
- **Client_Answer**: The editable answer column on a Question_Answer_Page, editable by a Member_User.
- **Prerequisites_Service**: The frontend service module that calls the backend prerequisites API.
- **Prerequisites_API**: The backend endpoints that persist and retrieve Prerequisites_Page content and Client_Answer data.
- **Legend**: The Mandatory/Optional marker legend shown on a Prerequisites_Page.
- **Config_Module**: The `configs.ts` module defining the `FormConfig` structure for each Prerequisites_Page.

## Requirements

### Requirement 1

**User Story:** As a coordinator, I want each Excel workbook tab represented as a submenu entry, so that I can navigate directly to the prerequisites content for a specific tab.

#### Acceptance Criteria

1. THE Navigation_Config SHALL define one entry for each of the following pages: How to use, Basics, Network Checklist, Core Control Plane, CloudStore, VCF, Network Flux.
2. THE Navigation_Config SHALL define each entry with a label and a route of the form `/prerequisites/{slug}`.
3. THE Navigation_Config SHALL exclude the LandingZone entry.
4. THE Navigation_Config SHALL map the former "OPCP Core" concept to the "Core Control Plane" entry.
5. THE Layout_Component SHALL render the Prerequisites_Menu entries from the Navigation_Config.
6. WHERE the Prerequisites_Menu is rendered on desktop and on mobile, THE Layout_Component SHALL render the same Navigation_Config entries.

### Requirement 2

**User Story:** As an authenticated user, I want each submenu entry to open its own page behind authentication, so that prerequisites content is reachable only after login.

#### Acceptance Criteria

1. THE Router_Component SHALL register a route of the form `/prerequisites/{slug}` for each Navigation_Config entry.
2. THE Router_Component SHALL wrap each Prerequisites_Page route in the Route_Guard.
3. WHEN an unauthenticated user requests a Prerequisites_Page route, THE Route_Guard SHALL redirect the user to the login flow.
4. WHEN an authenticated user selects a Prerequisites_Menu entry, THE Router_Component SHALL render the Prerequisites_Page matching the selected route.

### Requirement 3

**User Story:** As a customer, I want a "How to use" page, so that I understand how to complete the prerequisites and what precautions to take.

#### Acceptance Criteria

1. THE How_To_Use_Page SHALL present its content as read-only for all users.
2. THE How_To_Use_Page SHALL display the Legend describing the Mandatory and Optional markers.
3. THE How_To_Use_Page SHALL display completion tips and example guidance.
4. THE How_To_Use_Page SHALL display a warning that instructs users not to enter secrets, PSK, or credentials on the page and to provide such values through a secure channel instead.

### Requirement 4

**User Story:** As an administrator, I want to edit the Basics and Network Flux content, so that reference information stays accurate while remaining read-only to customers.

#### Acceptance Criteria

1. THE Static_Content_Page SHALL display its static content to every authenticated user.
2. WHERE the current user is an Admin_User, THE Static_Content_Page SHALL present controls for editing the static content.
3. WHERE the current user is a Member_User, THE Static_Content_Page SHALL present the static content as read-only.
4. WHEN an Admin_User saves an edit to a Static_Content_Page, THE Prerequisites_Service SHALL send the updated content to the Prerequisites_API.
5. THE Static_Content_Page SHALL determine edit permission using `Auth_Service.isAdmin()`.

### Requirement 5

**User Story:** As a customer, I want to answer prerequisites questions in a dedicated answer column, so that I can supply the information required for installation.

#### Acceptance Criteria

1. THE Question_Answer_Page SHALL display the first two columns as read-only questions addressed to the customer.
2. THE Question_Answer_Page SHALL display an editable Client_Answer column.
3. WHERE the current user is a Member_User, THE Question_Answer_Page SHALL allow the Member_User to edit the Client_Answer column.
4. THE Question_Answer_Page SHALL display a Mandatory or Optional marker for each question.
5. THE Question_Answer_Page SHALL display example values for each question.
6. THE Question_Answer_Page SHALL display Comments and Details hints for each question.
7. WHEN a Member_User saves a Client_Answer entry, THE Prerequisites_Service SHALL send the updated Client_Answer to the Prerequisites_API.

### Requirement 6

**User Story:** As a coordinator, I want prerequisites data persisted on the server, so that answers and content are shared across all users and sessions.

#### Acceptance Criteria

1. THE Prerequisites_API SHALL persist Static_Content_Page content and Question_Answer_Page Client_Answer entries on the server.
2. WHEN a Prerequisites_Page is opened, THE Prerequisites_Service SHALL retrieve the persisted content and Client_Answer data from the Prerequisites_API.
3. WHEN a user saves a change to a Prerequisites_Page, THE Prerequisites_API SHALL make the saved change available to other users and sessions.
4. THE Prerequisites_Page SHALL retrieve and persist data through the Prerequisites_Service instead of browser-local storage.
5. IF a save request to the Prerequisites_API fails, THEN THE Prerequisites_Page SHALL display an error indication to the user.

### Requirement 7

**User Story:** As a developer, I want each tab's content scaffolded with placeholder rows following the existing config pattern, so that the real content can be filled in later without restructuring.

#### Acceptance Criteria

1. THE Config_Module SHALL define a `FormConfig` structure for each Question_Answer_Page.
2. WHERE definitive question text is not yet available, THE Config_Module SHALL populate each Question_Answer_Page with placeholder or example rows.
3. THE Config_Module SHALL define each row with a stable identifier that is unique within its page.
4. THE Config_Module SHALL follow the `FormConfig` pattern defined in `types.ts`.

### Requirement 8

**User Story:** As a developer, I want the existing test suites kept green, so that the restructuring does not regress navigation, routing, or config behavior.

#### Acceptance Criteria

1. THE feature SHALL keep the tests in `Layout.prereq.test.tsx` passing.
2. THE feature SHALL keep the tests in `prerequisitesRoutes.test.tsx` passing.
3. THE feature SHALL keep the tests in `configs.test.ts` passing.
4. THE feature SHALL keep the tests in `TrackingForm.test.tsx` passing.
5. WHERE existing tests reference the removed LandingZone entry or renamed entries, THE feature SHALL update those tests to match the new Navigation_Config.
