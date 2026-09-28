# Implementation Plan: OpenStack CA Certificate

## Overview

This plan implements an optional, non-secret CA Certificate field for the OpenStack credentials panel as a thin vertical slice: a new nullable `ca_certificate` column, model/schema/router wiring, a `verify`-building helper threaded into both outbound OpenStack calls, and the frontend form, i18n, and export. Tasks are ordered database → model → schemas → proxy → router → frontend → export, so each step builds on the previous one and everything is wired end to end with no orphaned code. Property-based tests (Properties 1–7 from the design) are placed next to the code they validate, alongside example/edge tests from the Testing Strategy.

## Tasks

- [x] 1. Add the `ca_certificate` database column and model field
  - [x] 1.1 Create the Alembic migration for `ca_certificate`
    - Add `migrations/versions/<ts>_add_credential_ca_certificate.py` with `revision = 'add_credential_ca_certificate'` and `down_revision = 'remap_document_categories'`
    - `upgrade()` adds `sa.Column("ca_certificate", sa.Text(), nullable=True)` to `prerequisite_credential_config`; `downgrade()` drops it
    - _Requirements: 2.1, 2.2, 2.5_

  - [x] 1.2 Add the `ca_certificate` column to the `CredentialConfig` model
    - In `app/models/credential_config.py`, add `ca_certificate: Mapped[str | None] = mapped_column(Text, nullable=True)` among the non-secret connection fields (not encrypted)
    - _Requirements: 2.1, 2.3, 2.5_

  - [x]* 1.3 Write a migration smoke test
    - Apply the migration on a schema at `remap_document_categories`; assert the `ca_certificate` column exists and is nullable, and that `downgrade()` drops it
    - _Requirements: 2.1, 2.5_

- [x] 2. Extend the credential schemas
  - [x] 2.1 Add `ca_certificate` to the credential config schemas
    - In `app/prerequisites/schemas.py`, add `ca_certificate: str = ""` to `CredentialConfigResponse` (always returned, non-secret) and `ca_certificate: str = ""` to `CredentialConfigSaveRequest` (optional, NOT `min_length=1`)
    - _Requirements: 2.1, 2.2, 2.4, 1.3_

  - [x]* 2.2 Write unit tests for the schema field
    - Assert `ca_certificate` is present in `CredentialConfigResponse` while the secret is not, and that an empty `ca_certificate` on `CredentialConfigSaveRequest` validates successfully
    - _Requirements: 2.3, 1.3_

- [x] 3. Add the CA-certificate proxy support in `openstack.py`
  - [x] 3.1 Add `OpenStackCACertificateError` and the `_build_verify` helper
    - In `app/prerequisites/openstack.py`, add `import ssl`, define `OpenStackCACertificateError(OpenStackError)` with `code = "INVALID_CA_CERTIFICATE"`, and `_build_verify(ca_certificate: str) -> ssl.SSLContext | bool` returning `True` for empty/whitespace, an `ssl.create_default_context(cadata=...)` for valid PEM, and raising `OpenStackCACertificateError` on `ssl.SSLError`
    - _Requirements: 3.3, 3.4_

  - [x] 3.2 Thread the effective `verify` value into both outbound calls
    - Add `ca_certificate: str = ""` to `retrieve`; build `verify = _build_verify(ca_certificate)` once before any call; pass `verify` to `_get_token` and `_list_servers`, each constructing `httpx.AsyncClient(verify=verify)`
    - _Requirements: 3.1, 3.2, 3.3_

  - [x]* 3.3 Write property test P5 — verify setting used by both calls
    - **Property 5: TLS verification uses the effective CA certificate for both calls**
    - Hypothesis + mocked `httpx.AsyncClient`; parameterize empty vs. non-empty valid PEM; intercept `AsyncClient(verify=...)` for both `_get_token` and `_list_servers`; assert both receive the same expected verify (context vs. `True`); use a fixed known-valid PEM fixture
    - **Validates: Requirements 3.1, 3.2, 3.3, 3.5**

  - [x]* 3.4 Write property test P6 — invalid PEM, no outbound call
    - **Property 6: Invalid PEM yields a CA-specific error with no outbound call**
    - Generate non-empty non-PEM strings; assert `_build_verify`/`retrieve` raises `OpenStackCACertificateError` (`INVALID_CA_CERTIFICATE`) and neither OpenStack call is invoked (mock asserts zero calls)
    - **Validates: Requirements 3.4**

- [x] 4. Wire the CA certificate through the router
  - [x] 4.1 Return, persist, and resolve `ca_certificate` in the router
    - In `app/prerequisites/router.py`: `_credential_config_response` maps `ca_certificate=config.ca_certificate or ""` (and `""` on the `None`-config branch); `_upsert_credential_config` always writes `config.ca_certificate = payload.ca_certificate`; `retrieve_servers` passes `ca_certificate=config.ca_certificate or ""` to `OpenStackProxy().retrieve(...)`
    - _Requirements: 2.1, 2.2, 2.4, 3.5_

  - [x] 4.2 Add the `OpenStackCACertificateError` HTTP handler
    - Add an `except OpenStackCACertificateError` branch ordered before the generic OpenStack handlers, returning `400` with `ErrorResponse.create(code=e.code, message=str(e))`, logging only non-sensitive context (installation id), never the certificate content
    - _Requirements: 3.4_

  - [x]* 4.3 Write property test P3 — persistence round-trip
    - **Property 3: CA certificate persistence round-trip**
    - Backend Hypothesis, DB-backed; generate CA strings (incl. empty); save then load via the credentials endpoints; assert loaded `ca_certificate` equals the saved value
    - **Validates: Requirements 2.1, 2.2, 2.4**

  - [x]* 4.4 Write property test P4 — one row, last-write-wins
    - **Property 4: Exactly one CA certificate per installation (last-write-wins)**
    - Generate two distinct values; save in sequence for the same installation; assert load returns the second value and exactly one config row exists
    - **Validates: Requirements 2.5**

  - [x]* 4.5 Write example/edge tests for storage
    - 2.3 — persisted DB value equals the plaintext for a representative certificate (non-encrypted storage); 2.2 — empty-string save/load boundary
    - _Requirements: 2.2, 2.3_

- [x] 5. Checkpoint - Ensure backend tests pass
  - Ensure all tests pass, ask the user if questions arise.

- [x] 6. Add the CA certificate to the frontend service types
  - [x] 6.1 Extend `CredentialConfig` and `SaveCredentialConfigRequest`
    - In `frontend/src/services/prerequisitesService.ts`, add `ca_certificate: string` to `CredentialConfig` and optional `ca_certificate?: string` to `SaveCredentialConfigRequest`
    - _Requirements: 2.4, 1.3_

- [x] 7. Add the CA certificate field to the credentials form
  - [x] 7.1 Extend the form state and render the textarea
    - In `frontend/src/components/prerequisites/ServersTable.tsx`, add `caCertificate: string` to `CredentialsFormState`, seed it in initial state and mount prefill (`caCertificate: cfg.ca_certificate ?? ''`), render a full-width multi-line `<textarea>` below the grid using the new label key; leave `validateCredentialsForm` unchanged
    - _Requirements: 1.1, 1.2, 1.3_

  - [x] 7.2 Include the CA certificate in `toSaveRequest` and map the error code
    - Always send `ca_certificate: state.caCertificate.trim()` (including empty string); add `INVALID_CA_CERTIFICATE` to `ERROR_CODE_TO_KEY` and `ErrorMessageKey` mapping to the new localized message key
    - _Requirements: 2.1, 2.2, 3.4_

  - [x]* 7.3 Write property test P1 — textarea round-trip
    - **Property 1: CA certificate input round-trip in the form**
    - React Testing Library + fast-check; generate arbitrary strings, fire change on the CA textarea, assert the value round-trips into form state and rendered textarea
    - **Validates: Requirements 1.2**

  - [x]* 7.4 Write property test P2 — empty CA never gates validation
    - **Property 2: Empty CA certificate never gates save or retrieve**
    - Generate otherwise-valid form states with empty `caCertificate`; assert `validateCredentialsForm` returns `null`
    - **Validates: Requirements 1.3**

  - [x]* 7.5 Write example test 1.1 — labeled textarea present
    - Render `CredentialsForm` with an `installationId`; assert a labeled multi-line textarea for the CA certificate is present
    - _Requirements: 1.1_

- [x] 8. Add the i18n keys
  - [x] 8.1 Add EN/FR keys for the label and error
    - In `frontend/src/i18n/translations.ts`, add `prereq.servers.credentials.caCertificate` (FR `Certificat CA (PEM)`, EN `CA certificate (PEM)`) and `prereq.servers.error.invalidCaCertificate` (FR/EN per design) to both dictionaries to preserve key parity
    - _Requirements: 1.4, 3.4_

  - [x]* 8.2 Verify EN/FR key parity (1.4)
    - Rely on the existing EN/FR key-parity test to assert `prereq.servers.credentials.caCertificate` exists and is non-empty in both `en` and `fr`
    - _Requirements: 1.4_

- [x] 9. Include the CA certificate in installation export
  - [x] 9.1 Add `ca_certificate` to the export document
    - In `frontend/src/services/installationExport.ts`, extend `InstallationExport['servers']['credentials']` with `ca_certificate: string`, populate it in `buildInstallationExport` (`ca_certificate: cfg.ca_certificate ?? ''`), and add a credential-table row in `renderServersSection` (muted placeholder when empty; exported verbatim)
    - _Requirements: 4.1_

  - [x]* 9.2 Write property test P7 — export includes stored CA certificate
    - **Property 7: Export includes the stored CA certificate**
    - Generate CA values on the loaded config mock; assert `buildInstallationExport(...).servers.credentials.ca_certificate` equals it
    - **Validates: Requirements 4.1**

- [x] 10. Final checkpoint - Ensure all tests pass
  - Ensure all tests pass, ask the user if questions arise.

## Notes

- Tasks marked with `*` are optional test sub-tasks and can be skipped for a faster MVP.
- Each task references specific requirements (and, for test tasks, the design property number) for traceability.
- Property tests run a minimum of 100 iterations each and are tagged `Feature: openstack-ca-certificate, Property {n}: {text}`; backend property tests touching outbound calls mock `httpx.AsyncClient` (no real network), and DB round-trip tests use the prerequisites router test fixtures.
- The CA certificate is non-secret but is never interpolated into any log message.

## Task Dependency Graph

```json
{
  "waves": [
    { "id": 0, "tasks": ["1.1", "3.1"] },
    { "id": 1, "tasks": ["1.2", "3.2", "6.1", "8.1"] },
    { "id": 2, "tasks": ["1.3", "2.1", "3.3", "3.4", "7.1", "9.1"] },
    { "id": 3, "tasks": ["2.2", "4.1", "7.2", "8.2", "9.2"] },
    { "id": 4, "tasks": ["4.2", "7.3", "7.4", "7.5"] },
    { "id": 5, "tasks": ["4.3", "4.4", "4.5"] }
  ]
}
```
