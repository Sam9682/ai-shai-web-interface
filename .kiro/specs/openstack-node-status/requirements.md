# Requirements Document

## Introduction

This feature adds live OpenStack node/server status retrieval to the "Servers nodes" tab of the OPCP installation prerequisites area (route slug `servers-nodes`, page `frontend/src/pages/InstallationPrereqPage.tsx`, component `frontend/src/components/prerequisites/ServersTable.tsx`).

Users enter OpenStack credentials (auth URL, application credential id, application credential secret, Nova compute endpoint) and press a "RETRIEVE INFO" button. The FastAPI backend acts as a proxy: it obtains an authentication token from OpenStack Keystone using the application credential method, then queries the Nova compute service for the current server list. Live results (id, name, status) render in a new results section below the credentials form, while the existing static servers table stays intact.

Credential configuration is persisted per installation so it prefills on subsequent loads. The credential secret is stored write-only server-side and is never returned to the client.

## Glossary

- **Installation_Prereq_Page**: The frontend page component at `frontend/src/pages/InstallationPrereqPage.tsx` that renders installation prerequisite tabs.
- **Servers_Table_Component**: The frontend component at `frontend/src/components/prerequisites/ServersTable.tsx` rendered on the `servers-nodes` tab.
- **Credentials_Form**: The new frontend form on the `servers-nodes` tab collecting Auth URL, Credential ID, Credential Secret, and Nova compute endpoint.
- **Retrieve_Info_Button**: The new button labeled "RETRIEVE INFO" that triggers live OpenStack retrieval.
- **Live_Results_Section**: The new frontend section below the Credentials_Form that displays live Nova server records.
- **Prerequisites_Service**: The frontend API module at `frontend/src/services/prerequisitesService.ts` using the shared axios client.
- **Backend_Proxy**: The FastAPI backend module under `app/prerequisites/` that performs OpenStack Keystone and Nova calls server-side.
- **Credential_Config**: The persisted record holding Auth URL, Credential ID, Nova compute endpoint, and the write-only credential secret, scoped by installation identifier.
- **Auth_URL**: The OpenStack Keystone base URL (`OS_AUTH_URL`) used to request a token.
- **Credential_ID**: The OpenStack application credential identifier.
- **Credential_Secret**: The OpenStack application credential secret, treated as write-only.
- **Nova_Endpoint**: The OpenStack Nova compute service base URL used to list servers.
- **Auth_Token**: The OpenStack Keystone token returned in the `X-Subject-Token` response header.
- **Nova_Server**: A server record returned by Nova containing at least id, name, and status.
- **Installation_ID**: The unique identifier of an OPCP installation used to scope Credential_Config.

## Requirements

### Requirement 1: Credentials input form

**User Story:** As an OPCP operator, I want a credentials form on the Servers nodes tab, so that I can supply the OpenStack connection details needed to retrieve live node status.

#### Acceptance Criteria

1. WHEN the Servers_Table_Component renders on the `servers-nodes` tab, THE Credentials_Form SHALL display input fields for Auth_URL, Credential_ID, Credential_Secret, and Nova_Endpoint.
2. THE Credentials_Form SHALL render the Credential_Secret field as a masked input.
3. THE Credentials_Form SHALL display the Retrieve_Info_Button labeled "RETRIEVE INFO".
4. THE Servers_Table_Component SHALL continue to render the existing static servers table when the Credentials_Form and Live_Results_Section are present.

### Requirement 2: Required field validation

**User Story:** As an OPCP operator, I want the form to validate required fields, so that I do not trigger retrieval with incomplete input.

#### Acceptance Criteria

1. IF the Auth_URL field is empty WHEN the Retrieve_Info_Button is activated, THEN THE Credentials_Form SHALL display a validation message and SHALL prevent the retrieval request.
2. IF the Credential_ID field is empty WHEN the Retrieve_Info_Button is activated, THEN THE Credentials_Form SHALL display a validation message and SHALL prevent the retrieval request.
3. IF the Nova_Endpoint field is empty WHEN the Retrieve_Info_Button is activated, THEN THE Credentials_Form SHALL display a validation message and SHALL prevent the retrieval request.
4. IF the Credential_Secret field is empty AND no Credential_Secret is already stored for the Installation_ID WHEN the Retrieve_Info_Button is activated, THEN THE Credentials_Form SHALL display a validation message and SHALL prevent the retrieval request.

### Requirement 3: Persisting credential configuration

**User Story:** As an OPCP operator, I want my connection details saved per installation, so that they prefill the next time I open the tab.

#### Acceptance Criteria

1. WHEN the Retrieve_Info_Button is activated with valid input, THE Backend_Proxy SHALL persist the Auth_URL, Credential_ID, and Nova_Endpoint in Credential_Config scoped by Installation_ID.
2. WHEN the Credential_Secret field contains a value WHILE the Retrieve_Info_Button is activated, THE Backend_Proxy SHALL store the Credential_Secret in Credential_Config as a write-only value scoped by Installation_ID.
3. THE Backend_Proxy SHALL exclude the Credential_Secret from every response returned to the Prerequisites_Service.
4. THE Backend_Proxy SHALL provide a new persisted model and an Alembic migration that create the Credential_Config table.

### Requirement 4: Loading persisted configuration

**User Story:** As an OPCP operator, I want previously saved details to appear when I return, so that I avoid re-entering connection information.

#### Acceptance Criteria

1. WHEN the Servers_Table_Component loads for an Installation_ID that has a stored Credential_Config, THE Prerequisites_Service SHALL prefill the Auth_URL, Credential_ID, and Nova_Endpoint fields with the stored values.
2. WHERE a Credential_Secret is stored for the Installation_ID, THE Credentials_Form SHALL indicate that a secret is stored while leaving the Credential_Secret field masked and empty.
3. THE Prerequisites_Service SHALL request Credential_Config through the shared axios client in `frontend/src/services/prerequisitesService.ts`.

### Requirement 5: Token acquisition through the backend proxy

**User Story:** As an OPCP operator, I want the backend to authenticate to OpenStack on my behalf, so that credentials are handled server-side.

#### Acceptance Criteria

1. WHEN the Backend_Proxy receives a valid retrieval request, THE Backend_Proxy SHALL send a POST request to `{Auth_URL}/auth/tokens` using the application credential method with the Credential_ID and Credential_Secret.
2. WHEN OpenStack returns a successful token response, THE Backend_Proxy SHALL read the Auth_Token from the `X-Subject-Token` response header.
3. THE Backend_Proxy SHALL exclude the Auth_Token and Credential_Secret from every response returned to the Prerequisites_Service.

### Requirement 6: Retrieving live server list

**User Story:** As an OPCP operator, I want the backend to list OpenStack servers, so that I can see live node status.

#### Acceptance Criteria

1. WHEN the Backend_Proxy holds a valid Auth_Token, THE Backend_Proxy SHALL send a GET request to `{Nova_Endpoint}/servers` with the header `X-Auth-Token` set to the Auth_Token.
2. WHEN Nova returns a successful server list, THE Backend_Proxy SHALL return each Nova_Server with its id, name, and status to the Prerequisites_Service.

### Requirement 7: Displaying live results

**User Story:** As an OPCP operator, I want live results shown on the page, so that I can review current node status.

#### Acceptance Criteria

1. WHEN the Prerequisites_Service receives a Nova_Server list, THE Live_Results_Section SHALL render each Nova_Server with its id, name, and status below the Credentials_Form.
2. WHEN the Retrieve_Info_Button is activated, THE Live_Results_Section SHALL display a loading indicator until the response is received.
3. WHEN a subsequent retrieval succeeds, THE Live_Results_Section SHALL replace the previously displayed Nova_Server records with the newly received records.

### Requirement 8: Error handling

**User Story:** As an OPCP operator, I want clear error messages, so that I can diagnose failed retrievals.

#### Acceptance Criteria

1. IF OpenStack rejects the credentials during token acquisition, THEN THE Backend_Proxy SHALL return an authentication error and THE Live_Results_Section SHALL display an invalid-credentials message.
2. IF a network failure occurs WHILE the Backend_Proxy contacts OpenStack, THEN THE Backend_Proxy SHALL return a connection error and THE Live_Results_Section SHALL display a connection-error message.
3. IF OpenStack returns an error status for the server list request, THEN THE Backend_Proxy SHALL return an error response and THE Live_Results_Section SHALL display an OpenStack-error message.
4. WHEN the Backend_Proxy returns any error response, THE Backend_Proxy SHALL exclude the Credential_Secret and Auth_Token from the response.

### Requirement 9: Internationalization

**User Story:** As a French- or English-speaking operator, I want the interface in my language, so that I can use the feature comfortably.

#### Acceptance Criteria

1. THE Credentials_Form SHALL render all labels, the Retrieve_Info_Button text, validation messages, and error messages using i18n keys under the `prereq.*` namespace defined in `frontend/src/i18n/translations.ts`.
2. THE Live_Results_Section SHALL render all static labels using i18n keys under the `prereq.*` namespace.
3. THE i18n keys used by the Credentials_Form and Live_Results_Section SHALL provide both French and English translations in `frontend/src/i18n/translations.ts`.

### Requirement 10: Testing

**User Story:** As a developer, I want automated tests, so that the feature behavior is verified and protected against regressions.

#### Acceptance Criteria

1. THE Servers_Table_Component SHALL include vitest tests covering required-field validation, successful live-results rendering, and error-message rendering.
2. THE Prerequisites_Service SHALL include vitest tests covering saving configuration, loading configuration, and invoking retrieval through the shared axios client.
3. THE Backend_Proxy SHALL include pytest tests covering configuration persistence with write-only secret handling, successful token-and-servers retrieval, and error handling for invalid credentials and OpenStack errors.
