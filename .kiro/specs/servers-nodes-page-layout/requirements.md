# Requirements Document

## Introduction

This feature reorganizes the "Servers nodes" web page, reached through the "OPCP Installation" menu and rendered by the `ServersTable` component. Today the page shows the OpenStack credentials section (with the RETRIEVE INFO action and its live result) first, followed by a strictly read-only nodes inventory table. This feature reverses that order so the nodes table appears at the top of the page and the OpenStack credentials section appears below it. In addition, the nodes table becomes editable for members and administrators, with all six columns editable as free text, while visitors continue to see a read-only table. Edits are persisted to the backend, scoped per installation, so they survive page reloads, following the existing per-installation credentials and answers persistence pattern.

## Glossary

- **Servers_Nodes_Page**: The web page rendered by `frontend/src/components/prerequisites/ServersTable.tsx`, reached through the "OPCP Installation" menu, that presents the nodes table and the OpenStack credentials section for a single installation.
- **Nodes_Table**: The table on the Servers_Nodes_Page displaying one row per server node, with the columns Node UUID, Serial Number, Instance UUID, Power State, Provision State, and Remark.
- **Credentials_Section**: The region of the Servers_Nodes_Page containing the OpenStack credentials fields (Auth URL/Keystone, Credential ID, Credential secret, Nova endpoint, CA certificate PEM), the RETRIEVE INFO button, and the live result of the RETRIEVE INFO action.
- **Node_Row**: A single record in the Nodes_Table representing one server node, with the fields Node UUID, Serial Number, Instance UUID, Power State, Provision State, and Remark.
- **Installation**: The OPCP installation context that scopes the data shown and persisted on the Servers_Nodes_Page.
- **Member**: An authenticated user whose role is "member".
- **Administrator**: An authenticated user whose role is "administrator".
- **Visitor**: A user whose role is "visitor".
- **Persistence_Backend**: The Python backend endpoint and storage that save and retrieve Nodes_Table edits scoped per Installation.
- **Prerequisites_Service**: The frontend service (`frontend/src/services/prerequisitesService.ts`) that communicates with the Persistence_Backend on behalf of the Servers_Nodes_Page.

## Requirements

### Requirement 1

**User Story:** As a user viewing the OPCP installation, I want the nodes table at the top of the Servers nodes page, so that I see the server inventory before the credentials configuration.

#### Acceptance Criteria

1. WHEN the Servers_Nodes_Page is rendered, THE Servers_Nodes_Page SHALL display the Nodes_Table above the Credentials_Section.
2. WHEN the Servers_Nodes_Page is rendered, THE Nodes_Table SHALL display the columns Node UUID, Serial Number, Instance UUID, Power State, Provision State, and Remark in that order.
3. WHEN the Servers_Nodes_Page is rendered, THE Credentials_Section SHALL display the OpenStack credentials fields Auth URL/Keystone, Credential ID, Credential secret, Nova endpoint, and CA certificate PEM below the Nodes_Table.
4. WHEN the Servers_Nodes_Page is rendered, THE Credentials_Section SHALL display the RETRIEVE INFO button and the live result of the RETRIEVE INFO action below the Nodes_Table.

### Requirement 2

**User Story:** As a member or administrator, I want to edit every field of the nodes table, so that I can keep the server inventory accurate.

#### Acceptance Criteria

1. WHERE the current user is a Member or an Administrator, THE Nodes_Table SHALL allow editing of the Node UUID, Serial Number, Instance UUID, Power State, Provision State, and Remark fields of each Node_Row.
2. WHERE the current user is a Member or an Administrator, THE Nodes_Table SHALL accept free text for the Node UUID, Serial Number, Instance UUID, Power State, Provision State, and Remark fields.
3. WHERE the current user is a Visitor, THE Nodes_Table SHALL present the Node UUID, Serial Number, Instance UUID, Power State, Provision State, and Remark fields as read-only.
4. THE Nodes_Table SHALL restrict editing to existing Node_Rows without providing controls to add or remove Node_Rows.

### Requirement 3

**User Story:** As a member or administrator, I want my nodes table edits saved to the backend per installation, so that my changes remain after a page reload.

#### Acceptance Criteria

1. WHEN a Member or an Administrator confirms an edit to a Node_Row field, THE Prerequisites_Service SHALL send the updated Nodes_Table data to the Persistence_Backend scoped to the current Installation.
2. WHEN the Persistence_Backend receives updated Nodes_Table data for an Installation, THE Persistence_Backend SHALL store the updated Nodes_Table data scoped to that Installation.
3. WHEN the Servers_Nodes_Page is loaded for an Installation that has stored Nodes_Table data, THE Servers_Nodes_Page SHALL display the stored Nodes_Table data for that Installation.
4. IF the Prerequisites_Service fails to save the updated Nodes_Table data to the Persistence_Backend, THEN THE Servers_Nodes_Page SHALL display an error indication to the user.
