# Requirements Document

## Introduction

This feature adds a "CA Certificate" field to the OpenStack credentials panel on the "OPCP Installations" > "Servers nodes" tab. Operators can paste a PEM-encoded certificate authority (CA) certificate alongside the existing credential fields (Authentication URL / Keystone, Credential ID, Credential secret, Nova endpoint). When a CA certificate is supplied, the backend uses it to verify TLS on both outbound OpenStack calls: Keystone token acquisition and the Nova server list. The field is optional and non-secret: when left empty, the backend falls back to the system default trust store, and the stored value is returned to the client like the other non-secret configuration fields.

## Glossary

- **CA_Certificate**: A PEM-encoded certificate authority certificate, provided as multi-line text, used to verify the TLS server certificates presented by OpenStack endpoints.
- **Credentials_Form**: The React component in `frontend/src/components/prerequisites/ServersTable.tsx` that displays and edits OpenStack credential fields for an Installation.
- **Prerequisites_API**: The FastAPI credential endpoints under `app/prerequisites/router.py` that load, save, and retrieve OpenStack credential configuration for an Installation.
- **OpenStack_Proxy**: The backend component `OpenStackProxy` in `app/prerequisites/openstack.py` that performs Keystone token acquisition and the Nova server list call via `httpx.AsyncClient`.
- **Credential_Config**: The persisted per-installation configuration backed by the `CredentialConfig` SQLAlchemy model and the `prerequisite_credential_config` table.
- **System_Trust_Store**: The default set of trusted certificate authorities used by `httpx` when no explicit CA certificate is configured.
- **Installation_Export**: The export routine in `installationExport.ts` that serializes an Installation's configuration.

## Requirements

### Requirement 1

**User Story:** As an OPCP operator, I want to paste a CA certificate into the OpenStack credentials panel, so that outbound OpenStack calls can be verified against a private or non-default certificate authority.

#### Acceptance Criteria

1. THE Credentials_Form SHALL display a multi-line text area labeled for the CA Certificate alongside the Authentication URL, Credential ID, Credential secret, and Nova endpoint fields.
2. WHEN the operator types or pastes PEM content into the CA Certificate text area, THE Credentials_Form SHALL retain the entered value in the form state.
3. WHERE the CA Certificate field is empty, THE Credentials_Form SHALL permit saving and retrieval without requiring a value.
4. THE Credentials_Form SHALL display the CA Certificate label text in both English and French from the `prereq.servers.credentials.*` i18n keys.

### Requirement 2

**User Story:** As an OPCP operator, I want my CA certificate saved with the other credential fields, so that it persists across sessions and is available for later retrievals.

#### Acceptance Criteria

1. WHEN the operator saves the credential configuration with a non-empty CA Certificate value, THE Prerequisites_API SHALL persist the CA Certificate value in Credential_Config.
2. WHEN the operator saves the credential configuration with an empty CA Certificate value, THE Prerequisites_API SHALL persist an empty CA Certificate value in Credential_Config.
3. THE Prerequisites_API SHALL store the CA Certificate as a non-secret field without encryption.
4. WHEN the operator loads the credential configuration for an Installation, THE Prerequisites_API SHALL return the stored CA Certificate value in the response.
5. THE Credential_Config SHALL associate exactly one CA Certificate value with each Installation.

### Requirement 3

**User Story:** As an OPCP operator, I want the CA certificate applied to TLS verification on OpenStack calls, so that connections to endpoints using a private CA succeed and are verified.

#### Acceptance Criteria

1. WHEN the OpenStack_Proxy acquires a Keystone token and a non-empty CA Certificate value is available, THE OpenStack_Proxy SHALL verify the TLS connection using the provided CA Certificate value.
2. WHEN the OpenStack_Proxy lists Nova servers and a non-empty CA Certificate value is available, THE OpenStack_Proxy SHALL verify the TLS connection using the provided CA Certificate value.
3. WHERE the CA Certificate value is empty, THE OpenStack_Proxy SHALL verify TLS connections using the System_Trust_Store for both the Keystone token acquisition and the Nova server list.
4. IF the provided CA Certificate value cannot be parsed as a valid PEM certificate, THEN THE Prerequisites_API SHALL return an error response identifying the CA Certificate as the cause.
5. WHEN the operator triggers RETRIEVE INFO with a CA Certificate value supplied in the request, THE Prerequisites_API SHALL use the supplied CA Certificate value for TLS verification on that retrieval.

### Requirement 4

**User Story:** As an OPCP operator, I want the CA certificate included when I export an Installation, so that the exported configuration is complete and portable.

#### Acceptance Criteria

1. WHEN Installation_Export serializes an Installation, THE Installation_Export SHALL include the stored CA Certificate value in the exported credential configuration.
