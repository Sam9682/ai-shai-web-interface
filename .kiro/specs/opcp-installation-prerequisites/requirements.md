# Requirements Document

## Introduction

This feature adds an "OPCP installation prerequisites" navigation dropdown to the OPCP web interface, mirroring the existing "Événements" dropdown pattern in both desktop and mobile menus. The dropdown exposes three submenus that route to three authentication-gated pages: OPCP Core, CloudStore, and LandingZone. Each page presents a structured tracking form. The CloudStore page reproduces the parameter set from the reference installation-tracking document (organized into sub-sections, each parameter carrying Value, Status, Date Received, and Comments fields), while the OPCP Core and LandingZone pages provide inferred placeholder fields for later refinement. All entered data is held in component state and persisted to browser localStorage; the feature is frontend-only with no backend or API involvement. The user interface follows the existing OPCP blue theme (#000E9C) and French-language conventions.

## Glossary

- **Prerequisites_Menu**: The "OPCP installation prerequisites" navigation dropdown, present in both the desktop and mobile navigation menus.
- **Prerequisites_Page**: Any one of the three pages reached from the Prerequisites_Menu (OPCP Core page, CloudStore page, LandingZone page).
- **OPCP_Core_Page**: The Prerequisites_Page for OPCP Core parameters, reached at route `/prerequisites/opcp-core`.
- **CloudStore_Page**: The Prerequisites_Page for CloudStore parameters, reached at route `/prerequisites/cloudstore`.
- **LandingZone_Page**: The Prerequisites_Page for LandingZone parameters, reached at route `/prerequisites/landingzone`.
- **Tracking_Form**: The set of parameter rows rendered on a Prerequisites_Page, where each parameter row contains a Value field, a Status field, a Date Received field, and a Comments field.
- **Status_Value**: The value of a parameter's Status field, one of: Received (✅), Pending (⏳), Blocked (❌), N/A.
- **Status_Legend**: A visible key on each Prerequisites_Page that maps each Status_Value to its meaning and icon.
- **Local_Store**: The browser localStorage mechanism used to persist Tracking_Form data.
- **Auth_Guard**: The existing ProtectedRoute wrapper that restricts access to authenticated users.
- **Authenticated_User**: A user whose session is recognized as authenticated by the authentication service.

## Requirements

### Requirement 1

**User Story:** As an authenticated OPCP user, I want a "OPCP installation prerequisites" dropdown in the desktop navigation, so that I can reach the three prerequisites pages from the main menu.

#### Acceptance Criteria

1. WHILE the current user is an Authenticated_User, THE Prerequisites_Menu SHALL appear in the desktop navigation menu.
2. WHILE the current user is not an Authenticated_User, THE Prerequisites_Menu SHALL be hidden from the desktop navigation menu.
3. WHEN the pointer enters the Prerequisites_Menu in the desktop navigation, THE Prerequisites_Menu SHALL display three submenu entries labeled "OPCP Core", "CloudStore", and "LandingZone".
4. WHEN the pointer leaves the Prerequisites_Menu in the desktop navigation, THE Prerequisites_Menu SHALL hide the three submenu entries.
5. WHEN the "OPCP Core" desktop submenu entry is selected, THE Prerequisites_Menu SHALL navigate to route `/prerequisites/opcp-core`.
6. WHEN the "CloudStore" desktop submenu entry is selected, THE Prerequisites_Menu SHALL navigate to route `/prerequisites/cloudstore`.
7. WHEN the "LandingZone" desktop submenu entry is selected, THE Prerequisites_Menu SHALL navigate to route `/prerequisites/landingzone`.

### Requirement 2

**User Story:** As an authenticated OPCP user on a mobile device, I want the prerequisites entries in the mobile menu, so that I can reach the three prerequisites pages on a small screen.

#### Acceptance Criteria

1. WHILE the current user is an Authenticated_User, THE Prerequisites_Menu SHALL display a "OPCP installation prerequisites" section with three nested entries labeled "OPCP Core", "CloudStore", and "LandingZone" in the mobile navigation menu.
2. WHILE the current user is not an Authenticated_User, THE Prerequisites_Menu SHALL hide the prerequisites section from the mobile navigation menu.
3. WHEN a mobile prerequisites entry is selected, THE Prerequisites_Menu SHALL navigate to the route corresponding to that entry and close the mobile navigation menu.

### Requirement 3

**User Story:** As the application, I want the three prerequisites pages to be protected routes, so that only authenticated users can view prerequisites data.

#### Acceptance Criteria

1. THE OPCP_Core_Page SHALL be registered at route `/prerequisites/opcp-core` behind the Auth_Guard.
2. THE CloudStore_Page SHALL be registered at route `/prerequisites/cloudstore` behind the Auth_Guard.
3. THE LandingZone_Page SHALL be registered at route `/prerequisites/landingzone` behind the Auth_Guard.
4. IF a user who is not an Authenticated_User requests a Prerequisites_Page route, THEN THE Auth_Guard SHALL redirect the request to the login route.

### Requirement 4

**User Story:** As an OPCP installation coordinator, I want the CloudStore page to present the reference document's parameters grouped into sub-sections, so that I can track every CloudStore prerequisite in one place.

#### Acceptance Criteria

1. THE CloudStore_Page SHALL present a "Network Configuration" sub-section containing parameter rows for Network Name, Subnet Name, Subnet CIDR, Gateway IP, VLAN ID, and DHCP range (10 IPs excluded).
2. THE CloudStore_Page SHALL present a "Server Information (Standalone)" sub-section containing parameter rows for Role, Hostname, IP Address, Node UUID, Ingress VIP (Cilium L2, static), an optional 3-node cluster indicator, and cluster-endpoint VIP.
3. THE CloudStore_Page SHALL present a "DNS Configuration" sub-section containing parameter rows for DNS Zone Name, Delegation Target (ingress VIP), Primary DNS Server IP, and Fallback DNS Server IP.
4. THE CloudStore_Page SHALL present a "NTP Configuration" sub-section containing parameter rows for NTP Server 1 IP, NTP Server 1 DNS Name, NTP Server 2 IP, and NTP Server 2 DNS Name.
5. THE CloudStore_Page SHALL present a "Security & Certificates" sub-section containing a parameter row for Root CA Certificate.
6. THE CloudStore_Page SHALL present a "Backup storage (S3)" sub-section containing parameter rows for Backup enabled, S3 endpoint URL, region, bucket, access key, secret key, and backup path with a default value of `cs-backups`.
7. THE CloudStore_Page SHALL present a "Client-Side Actions" sub-section containing parameter rows for Network/Subnet created, Networks wired to OPCP rack edge, Bastion host provisioned, Bastion access provided, DNS zone delegation configured, and S3 backup bucket provided and reachable.

### Requirement 5

**User Story:** As an OPCP installation coordinator, I want each parameter row to capture a value, a status, a received date, and comments, so that I can record the full state of each prerequisite.

#### Acceptance Criteria

1. THE Tracking_Form SHALL render, for each parameter row, a Value field, a Status field, a Date Received field, and a Comments field.
2. WHEN a coordinator selects a Status field, THE Tracking_Form SHALL offer the Status_Value choices Received (✅), Pending (⏳), Blocked (❌), and N/A.
3. THE Prerequisites_Page SHALL display a Status_Legend that maps Received to ✅, Pending to ⏳, Blocked to ❌, and N/A to its meaning.
4. WHEN a coordinator edits any field of a parameter row, THE Tracking_Form SHALL update the in-memory value for that field to the entered content.

### Requirement 6

**User Story:** As an OPCP installation coordinator, I want the OPCP Core and LandingZone pages to provide starter fields, so that I can begin tracking those areas before their exact parameters are finalized.

#### Acceptance Criteria

1. THE OPCP_Core_Page SHALL render a Tracking_Form containing placeholder parameter rows that a coordinator can refine later.
2. THE LandingZone_Page SHALL render a Tracking_Form containing placeholder parameter rows that a coordinator can refine later.
3. THE OPCP_Core_Page SHALL apply the same Value, Status, Date Received, and Comments field structure and Status_Legend used by the CloudStore_Page.
4. THE LandingZone_Page SHALL apply the same Value, Status, Date Received, and Comments field structure and Status_Legend used by the CloudStore_Page.

### Requirement 7

**User Story:** As an OPCP installation coordinator, I want my entries to survive page reloads, so that I do not lose tracking progress when I return to a page.

#### Acceptance Criteria

1. WHEN a coordinator edits any field on a Prerequisites_Page, THE Local_Store SHALL persist the current Tracking_Form data for that page.
2. WHEN a Prerequisites_Page loads AND the Local_Store contains previously saved data for that page, THE Prerequisites_Page SHALL populate the Tracking_Form from the Local_Store data.
3. WHEN a Prerequisites_Page loads AND the Local_Store contains no saved data for that page, THE Prerequisites_Page SHALL populate the Tracking_Form with its default parameter rows.
4. IF the Local_Store data for a Prerequisites_Page cannot be parsed, THEN THE Prerequisites_Page SHALL populate the Tracking_Form with its default parameter rows.
5. THE Local_Store SHALL store data for each Prerequisites_Page under a distinct key so that data for one page does not overwrite data for another page.

### Requirement 8

**User Story:** As an OPCP user, I want the prerequisites interface to match the rest of the application, so that the experience feels consistent.

#### Acceptance Criteria

1. THE Prerequisites_Menu SHALL apply the OPCP blue theme color #000E9C consistently with the existing navigation menu styling.
2. THE Prerequisites_Page SHALL present all labels, section headings, and status descriptions in French.
3. THE Prerequisites_Page SHALL apply Tailwind CSS styling consistent with the existing pages of the application.
