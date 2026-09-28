# Implementation Plan: OpenStack Node Status

## Overview

Implement live OpenStack server-status retrieval on the `servers-nodes` prerequisites tab. Work proceeds backend-first: persist a per-installation `CredentialConfig` with a Fernet-encrypted write-only secret, add the two-step OpenStack proxy (Keystone application-credential token → Nova server list), expose three router endpoints on the existing `/api/prerequisites` router, then extend the frontend service, thread `installationId` through the tab hierarchy, add the credentials form + live results to `ServersTable`, and wire i18n. Each task builds on the previous ones and ends by wiring components into the existing app.

## Tasks

- [x] 1. Backend: persistence model + registration
  - [x] 1.1 Create `CredentialConfig` model
    - Add `app/models/credential_config.py` with the `prerequisite_credential_config` table: `id`, `installation_id` (FK, CASCADE), `auth_url`, `credential_id`, `nova_endpoint`, nullable `credential_secret_encrypted` (Text), `updated_at`, `updated_by`
    - Add `UniqueConstraint("installation_id")` and `Index` on `installation_id`
    - Add `credential_config` relationship on `Installation` (`back_populates`, `cascade="all, delete-orphan"`, `uselist=False`)
    - Register the model in `app/models/__init__.py`
    - _Requirements: 3.1, 3.4_

  - [x] 1.2 Create Alembic migration for the credential config table
    - Add `migrations/versions/20260927_0000_add_credential_config_add_openstack_credential_config.py` with `revision = 'add_openstack_credential_config'`, `down_revision = 'add_event_assignments'`
    - `upgrade()` creates `prerequisite_credential_config` (columns, FKs, unique constraint) and the installation index; `downgrade()` drops index then table
    - _Requirements: 3.4_

- [x] 2. Backend: secret encryption helper
  - [x] 2.1 Implement Fernet encrypt/decrypt keyed off `SECRET_KEY`
    - Add `app/prerequisites/security.py` with `_fernet()` deriving a urlsafe base64 32-byte key (SHA-256 of `settings.SECRET_KEY`), plus `encrypt_secret(plaintext) -> str` and `decrypt_secret(ciphertext) -> str`
    - Never log plaintext; ciphertext is the only persisted form
    - _Requirements: 3.2_

  - [x]* 2.2 Write property test for secret encryption round-trip
    - **Property 1: Secret encryption round-trip**
    - Use `hypothesis` (≥100 iterations): for any secret string, `decrypt_secret(encrypt_secret(s)) == s` and the ciphertext never equals the plaintext
    - **Validates: Requirements 3.2**

- [x] 3. Backend: OpenStack proxy module
  - [x] 3.1 Implement `OpenStackProxy` and error hierarchy
    - Add `app/prerequisites/openstack.py` with `OpenStackError` (with `code`), `OpenStackAuthError` (`AUTH_FAILED`), `OpenStackConnectionError` (`CONNECTION_FAILED`), `OpenStackServiceError` (`OPENSTACK_ERROR`), and a `NovaServerDTO`
    - `_get_token`: POST `{auth_url}/auth/tokens` with the `application_credential` body, read `X-Subject-Token`; map 401/403 → auth error, `httpx.ConnectError`/`httpx.TimeoutException` → connection error, other non-2xx → service error
    - `_list_servers`: GET `{nova_endpoint}/servers` with `X-Auth-Token`, map each server to `{id, name, status}`; same connection/service error mapping
    - `retrieve(...)` chains `_get_token` then `_list_servers`; secret and token stay in local variables only, never logged
    - Use `httpx.AsyncClient`, matching `app/oracle/ai_providers.py`
    - _Requirements: 5.1, 5.2, 6.1, 6.2_

- [x] 4. Backend: schemas + router endpoints
  - [x] 4.1 Add Pydantic schemas
    - In `app/prerequisites/schemas.py` add `CredentialConfigResponse` (auth_url, credential_id, nova_endpoint, secret_stored — **no secret field**), `CredentialConfigSaveRequest` (non-empty auth_url/credential_id/nova_endpoint, optional `credential_secret`), `NovaServerSchema`, `RetrieveServersResponse`
    - _Requirements: 3.3, 5.3, 8.4_

  - [x] 4.2 Add GET and PUT credentials endpoints
    - In `app/prerequisites/router.py` add `GET .../servers-nodes/credentials` returning `CredentialConfigResponse` with `secret_stored` reflecting presence (never the secret), and `PUT .../servers-nodes/credentials` upserting config by `installation_id`, encrypting+storing the secret only when provided
    - Reuse `_get_installation_or_404`, auth deps, and the `ErrorResponse` contract
    - _Requirements: 3.1, 3.2, 3.3, 4.1_

  - [x] 4.3 Add POST servers/retrieve endpoint with error mapping
    - Add `POST .../servers-nodes/servers/retrieve`: upsert config, resolve the effective secret (inline else stored; neither → `MISSING_CREDENTIAL_SECRET` 400), call `OpenStackProxy.retrieve`, return `RetrieveServersResponse`
    - Map `OpenStackAuthError`→401 `AUTH_FAILED`, `OpenStackConnectionError`→502 `CONNECTION_FAILED`, `OpenStackServiceError`→502 `OPENSTACK_ERROR`; error bodies exclude secret and token; DB failures → rollback + `DATABASE_ERROR` 500
    - _Requirements: 3.1, 3.2, 5.3, 6.2, 8.1, 8.2, 8.3, 8.4_

- [x] 5. Checkpoint - backend wiring
  - Ensure the model, migration, proxy, schemas, and endpoints import and register cleanly. Ensure all tests pass, ask the user if questions arise.

- [x] 6. Backend: proxy and endpoint tests
  - [x]* 6.1 Write persistence + secret-handling tests
    - In `tests/prerequisites/test_openstack_credentials.py`: PUT/POST stores the encrypted secret; GET returns config with `secret_stored=True` and no secret field; stored ciphertext differs from plaintext
    - **Validates: Requirements 3.1, 3.2, 3.3, 4.1** (backs Property 4)
    - _Requirements: 10.3_

  - [x]* 6.2 Write property test for secret never in any response
    - **Property 2: Secret never appears in any response**
    - With `hypothesis`, assert save/load/retrieve/error serialized bodies contain neither the secret nor the Keystone token
    - **Validates: Requirements 3.3, 5.3, 8.4**
    - _Requirements: 10.3_

  - [x]* 6.3 Write successful token-and-servers retrieval test
    - Mock `httpx`: `POST /auth/tokens` returns `X-Subject-Token`, `GET /servers` returns a list; assert mapped `{id, name, status}` and no secret/token in the body
    - **Validates: Requirements 5.1, 5.2, 6.1, 6.2** (backs Property 5)
    - _Requirements: 10.3_

  - [x]* 6.4 Write error-handling tests
    - Keystone 401 → `AUTH_FAILED`; connection error → `CONNECTION_FAILED`; Nova 5xx → `OPENSTACK_ERROR`; every error body excludes secret and token
    - **Validates: Requirements 8.1, 8.2, 8.3, 8.4** (backs Property 6)
    - _Requirements: 10.3_

- [x] 7. Frontend: prerequisites service extension
  - [x] 7.1 Add types and methods to `prerequisitesService`
    - In `frontend/src/services/prerequisitesService.ts` add `CredentialConfig`, `SaveCredentialConfigRequest`, `NovaServer`, `RetrieveServersResponse` types and `SERVERS_SLUG = 'servers-nodes'`
    - Add `loadCredentialConfig`, `saveCredentialConfig`, `retrieveServers` calling the installation-scoped `credentials` / `servers/retrieve` URLs via the shared axios `api` client
    - _Requirements: 4.1, 4.3_

  - [x]* 7.2 Write service tests
    - In `frontend/src/services/prerequisitesService.test.ts`: the three methods call the correct installation-scoped URLs on the axios mock; responses never carry a secret field
    - _Requirements: 10.2_

- [x] 8. Frontend: i18n keys
  - [x] 8.1 Add `prereq.*` keys to fr and en dictionaries
    - In `frontend/src/i18n/translations.ts` add the full `prereq.servers.*` key set (credentials labels, retrieve/retrieving, validation messages, results labels, error messages incl. `generic`) to both `fr` and `en` with identical keys
    - _Requirements: 9.1, 9.2, 9.3_

- [x] 9. Frontend: credentials form + live results in ServersTable
  - [x] 9.1 Add `installationId` prop and CredentialsForm
    - In `frontend/src/components/prerequisites/ServersTable.tsx` add optional `installationId` prop; when present render `CredentialsForm` (controlled `authUrl`, `credentialId`, masked `credentialSecret`, `novaEndpoint`, RETRIEVE INFO button, inline validation, "secret stored" indicator) above the unchanged static table
    - On mount with `installationId`, call `loadCredentialConfig` to prefill non-secret fields and set `secretStored`
    - Client-side validation blocks retrieval and shows the mapped message when any required field is empty, or the secret is empty while none is stored
    - _Requirements: 1.1, 1.2, 1.3, 1.4, 2.1, 2.2, 2.3, 2.4, 4.1, 4.2_

  - [x] 9.2 Add LiveResultsSection and retrieval flow
    - Render loading indicator while pending, error banner keyed by backend error code (fallback `prereq.servers.error.generic`), and a `{id, name, status}` table below the form; a successful retrieve replaces prior rows
    - Wire RETRIEVE INFO to `retrieveServers` (persist + retrieve in one call)
    - _Requirements: 6.2, 7.1, 7.2, 7.3, 8.1, 8.2, 8.3, 9.1, 9.2_

  - [x]* 9.3 Write validation vitest tests
    - **Property 3: Required-field validation gates retrieval**
    - Assert each empty-field branch (incl. secret-required-only-when-none-stored) shows the message and sends no request
    - **Validates: Requirements 2.1, 2.2, 2.3, 2.4**
    - _Requirements: 10.1_

  - [x]* 9.4 Write live-results and error vitest tests
    - **Property 5: Live results reflect the retrieved server list** and **Property 6: Error responses map to the correct client message**
    - Successful retrieval renders one row per server with id/name/status; loading appears while pending; a second retrieve replaces rows; each error code renders its mapped message
    - **Validates: Requirements 6.2, 7.1, 7.2, 7.3, 8.1, 8.2, 8.3**
    - _Requirements: 10.1_

  - [x]* 9.5 Extend static-table preservation test
    - In `ServersTable.preservation.test.tsx`, assert the existing static table still renders alongside the form when `installationId` is set
    - **Validates: Requirements 1.4**
    - _Requirements: 10.1_

- [x] 10. Frontend: thread installationId into the tab
  - [x] 10.1 Pass `installationId` through ChecklistTabs and InstallationPrereqPage
    - In `ChecklistTabs.tsx` pass `installationId` to `ServersTable` for the servers tab; in `InstallationPrereqPage.tsx` pass the route `installationId` on the single-slug `servers` branch
    - _Requirements: 1.1, 4.1_

- [x] 11. Final checkpoint - Ensure all tests pass
  - Run backend pytest and frontend vitest suites. Ensure all tests pass, ask the user if questions arise.

## Notes

- Tasks marked with `*` are optional (tests) and can be skipped for a faster MVP.
- Each task references specific requirements for traceability; property tests reference the design's Correctness Properties.
- The design has a Correctness Properties section, so property-based tests (Properties 1–6) are included as optional sub-tasks near the code they validate.
- Backend work (tasks 1–6) precedes frontend work (tasks 7–10) so the service methods have live endpoints to call.
- Checkpoints (tasks 5, 11) provide incremental validation.

## Task Dependency Graph

```json
{
  "waves": [
    { "id": 0, "tasks": ["1.1", "2.1"] },
    { "id": 1, "tasks": ["1.2", "2.2", "3.1", "8.1"] },
    { "id": 2, "tasks": ["4.1", "7.1"] },
    { "id": 3, "tasks": ["4.2", "4.3", "7.2"] },
    { "id": 4, "tasks": ["6.1", "6.2", "6.3", "6.4", "9.1"] },
    { "id": 5, "tasks": ["9.2", "10.1"] },
    { "id": 6, "tasks": ["9.3", "9.4", "9.5"] }
  ]
}
```
