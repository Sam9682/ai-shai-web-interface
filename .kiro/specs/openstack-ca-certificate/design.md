# Design Document

## Overview

This feature adds an optional, non-secret **CA Certificate** field to the OpenStack credentials panel on the "OPCP Installations" > "Servers nodes" tab. Operators paste a PEM-encoded CA certificate alongside the existing credential fields. When present, the backend threads it into TLS verification for **both** outbound OpenStack calls — Keystone token acquisition (`_get_token`) and the Nova server list (`_list_servers`). When empty, the backend falls back to the system default trust store (`verify=True`).

The field mirrors the existing non-secret fields (Auth URL, Credential ID, Nova endpoint): it is stored in plaintext (unlike the Fernet-encrypted secret), returned on load, and included in installation export. It never appears in logs.

The change touches a thin vertical slice of the existing stack, extending patterns already in place rather than introducing new architecture:

- **Database**: one new nullable `ca_certificate` column on `prerequisite_credential_config`, added by a new Alembic migration chained onto the current head (`remap_document_categories`).
- **Model / schemas**: a new field on `CredentialConfig`, `CredentialConfigResponse`, and `CredentialConfigSaveRequest`.
- **Router**: the field is written on upsert, returned on load, and resolved (inline-vs-stored) on retrieve, exactly like the existing non-secret fields.
- **Proxy**: `OpenStackProxy` accepts an effective CA certificate and builds a per-call `verify` argument for `httpx.AsyncClient`; invalid PEM raises a dedicated error mapped to a CA-specific error code.
- **Frontend**: a textarea field, new `ca_certificate` on `CredentialConfig` / `SaveCredentialConfigRequest`, EN/FR i18n keys, and inclusion in the export document.

## Architecture

### Data flow (retrieve with CA certificate)

```
ServersTable / CredentialsForm (React)
  form.caCertificate ──▶ toSaveRequest ──▶ SaveCredentialConfigRequest.ca_certificate
        │
        ▼  POST /installations/{id}/servers-nodes/servers/retrieve
Prerequisites_API (router.py)
  _upsert_credential_config  ── persists ca_certificate (plaintext, non-secret)
  resolve effective ca_certificate: inline payload value else stored value
        │
        ▼
OpenStackProxy.retrieve(auth_url, credential_id, secret, nova_endpoint, ca_certificate)
  build_verify(ca_certificate)  ── PEM → ssl.SSLContext  (empty → True)
        │                                    │ invalid PEM → OpenStackCACertificateError
        ├──▶ _get_token   → httpx.AsyncClient(verify=<ctx|True>)
        └──▶ _list_servers→ httpx.AsyncClient(verify=<ctx|True>)
```

### Verify-argument selection

A single helper computes the `verify` value used by both outbound calls, keeping the empty/non-empty branch in one place:

- **Empty / whitespace-only CA certificate** → `verify=True` (system trust store), identical to today's implicit default.
- **Non-empty CA certificate** → an `ssl.SSLContext` loaded from the PEM text, applied to both calls.
- **Non-empty but unparseable PEM** → raise `OpenStackCACertificateError`, mapped by the router to a `400` with a CA-specific error code, before any network call is attempted.

The SSL context is built once per `retrieve` call and shared by `_get_token` and `_list_servers` so both calls verify identically.

### Error handling

| Condition | Backend | HTTP | Error code |
| --- | --- | --- | --- |
| Non-empty CA cert that is not valid PEM | `OpenStackCACertificateError` raised before any call | 400 | `INVALID_CA_CERTIFICATE` |
| Keystone rejects credentials | `OpenStackAuthError` (existing) | 401 | `AUTH_FAILED` |
| Network/TLS failure contacting OpenStack | `OpenStackConnectionError` (existing) | 502 | `CONNECTION_FAILED` |
| Other OpenStack error status | `OpenStackServiceError` (existing) | 502 | `OPENSTACK_ERROR` |

A TLS handshake that fails because the server certificate is not trusted by the supplied CA surfaces through `httpx` as a connection-level failure and maps to the existing `CONNECTION_FAILED` path — the certificate is structurally valid PEM, but verification failed at connect time. `INVALID_CA_CERTIFICATE` is reserved for a payload that cannot be parsed as a certificate at all.

### Logging / secret hygiene

The CA certificate is non-secret but is still excluded from all log statements. The proxy and router continue to log only non-sensitive context (endpoints, upstream status codes, installation ids). The existing invariant — secret and Keystone token never logged or returned — is preserved unchanged; the CA certificate is simply never interpolated into a log message.

## Components and Interfaces

### 1. Alembic migration (new revision)

A new migration file under `migrations/versions/` adds the nullable column and chains onto the current head.

```python
# revision identifiers
revision = 'add_credential_ca_certificate'
down_revision = 'remap_document_categories'
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column(
        "prerequisite_credential_config",
        sa.Column("ca_certificate", sa.Text(), nullable=True),
    )


def downgrade() -> None:
    op.drop_column("prerequisite_credential_config", "ca_certificate")
```

Rationale for `Text` + `nullable=True`: PEM content is multi-line and unbounded in practice (chains), matching the `Text` type already used for `credential_secret_encrypted`. Nullable lets existing rows and secret-only configs exist without a value; the model normalizes `None` to `""` on read.

### 2. Model — `app/models/credential_config.py`

Add a nullable non-secret column, placed with the other non-secret connection fields:

```python
# OpenStack CA certificate (PEM). Non-secret, optional; NULL/empty means
# "use the system default trust store" for TLS verification.
ca_certificate: Mapped[str | None] = mapped_column(
    Text,
    nullable=True,
)
```

`Text` is already imported. The column is intentionally NOT encrypted (contrast with `credential_secret_encrypted`).

### 3. Schemas — `app/prerequisites/schemas.py`

`CredentialConfigResponse` gains a returned non-secret field; `CredentialConfigSaveRequest` gains an optional field:

```python
class CredentialConfigResponse(BaseModel):
    auth_url: str
    credential_id: str
    nova_endpoint: str
    ca_certificate: str = ""      # non-secret, always returned (empty when unset)
    secret_stored: bool
    model_config = ConfigDict(from_attributes=False)


class CredentialConfigSaveRequest(BaseModel):
    auth_url: str = Field(min_length=1)
    credential_id: str = Field(min_length=1)
    nova_endpoint: str = Field(min_length=1)
    credential_secret: Optional[str] = None  # omit to reuse stored secret
    ca_certificate: str = ""                  # optional; empty => system trust store
```

`ca_certificate` on the save request is NOT `min_length=1`: an empty value is valid and must be permitted (Requirement 1.3). Unlike the secret, an empty CA certificate is a meaningful state (clear it / use defaults) and is persisted as empty rather than "preserve previous".

### 4. Router — `app/prerequisites/router.py`

- **`_credential_config_response`** maps the new field, normalizing `None` to `""`:

```python
return CredentialConfigResponse(
    auth_url=config.auth_url,
    credential_id=config.credential_id,
    nova_endpoint=config.nova_endpoint,
    ca_certificate=config.ca_certificate or "",
    secret_stored=config.credential_secret_encrypted is not None,
)
```
The `None`-config branch returns `ca_certificate=""` as well.

- **`_upsert_credential_config`** always writes the CA certificate (like the other non-secret fields, and unlike the secret which is preserve-on-omit):

```python
config.ca_certificate = payload.ca_certificate  # always written; "" clears it
```

- **`retrieve_servers`** resolves the effective CA certificate and passes it to the proxy. The value follows the same inline-vs-stored precedence as the secret, but since it is always persisted on the preceding upsert, the stored value already equals the payload value:

```python
servers = await OpenStackProxy().retrieve(
    auth_url=config.auth_url,
    credential_id=config.credential_id,
    secret=secret,
    nova_endpoint=config.nova_endpoint,
    ca_certificate=config.ca_certificate or "",
)
```

- A new exception mapping is added alongside the existing OpenStack handlers:

```python
except OpenStackCACertificateError as e:
    logger.warning(
        f"Invalid CA certificate for installation_id={installation_id}"
    )
    raise HTTPException(
        status_code=status.HTTP_400_BAD_REQUEST,
        detail=ErrorResponse.create(code=e.code, message=str(e)),
    )
```

This handler is ordered before the generic OpenStack handlers. The message identifies the CA certificate as the cause without echoing the (non-secret) certificate content.

### 5. Proxy — `app/prerequisites/openstack.py`

A new error type and a `verify`-building helper; `retrieve`, `_get_token`, and `_list_servers` accept the effective CA certificate.

```python
import ssl

class OpenStackCACertificateError(OpenStackError):
    """The supplied CA certificate could not be parsed as valid PEM."""
    code = "INVALID_CA_CERTIFICATE"


def _build_verify(ca_certificate: str) -> ssl.SSLContext | bool:
    """Return an httpx `verify` value for the effective CA certificate.

    Empty/whitespace-only -> True (system default trust store). Otherwise build
    an SSLContext from the PEM text; unparseable PEM raises
    OpenStackCACertificateError before any network call is attempted.
    """
    if not ca_certificate or not ca_certificate.strip():
        return True
    try:
        context = ssl.create_default_context(cadata=ca_certificate)
    except ssl.SSLError:
        raise OpenStackCACertificateError(
            "Le certificat CA fourni est invalide (format PEM illisible)."
        )
    return context
```

`retrieve` builds the verify value once and passes it to both calls:

```python
async def retrieve(self, auth_url, credential_id, secret, nova_endpoint,
                   ca_certificate: str = "") -> List[NovaServerDTO]:
    verify = _build_verify(ca_certificate)   # may raise before any call
    token = await self._get_token(auth_url, credential_id, secret, verify)
    return await self._list_servers(nova_endpoint, token, verify)
```

Each call threads `verify` into its client:

```python
async with httpx.AsyncClient(verify=verify) as client:
    ...
```

`_build_verify` runs before either network call, so an invalid PEM never triggers an outbound request. Building the context once and sharing it guarantees both calls verify identically.

### 6. Frontend service types — `frontend/src/services/prerequisitesService.ts`

```typescript
export interface CredentialConfig {
  auth_url: string;
  credential_id: string;
  nova_endpoint: string;
  ca_certificate: string;   // non-secret; returned by the backend
  secret_stored: boolean;
}

export interface SaveCredentialConfigRequest {
  auth_url: string;
  credential_id: string;
  nova_endpoint: string;
  credential_secret?: string;
  ca_certificate?: string;  // optional; omitted/empty => system trust store
}
```

### 7. Credentials form — `frontend/src/components/prerequisites/ServersTable.tsx`

- Extend `CredentialsFormState` with `caCertificate: string` and seed it in the initial state and mount prefill (`setForm({ ..., caCertificate: cfg.ca_certificate ?? '' })`).
- Render a multi-line `<textarea>` (not an `<input>`) below the existing grid, since PEM content is multi-line. The existing `fields` array is text/password inputs rendered in a two-column grid; the CA certificate is added as a separate full-width textarea block using a new label key.
- `validateCredentialsForm` is **unchanged** — no CA-certificate rule is added, so an empty value never blocks save/retrieve (Requirement 1.3).
- `toSaveRequest` includes the CA certificate as-is (trimmed), and always sends it (including empty string) so an operator can clear it:

```typescript
const request: SaveCredentialConfigRequest = {
  auth_url: state.authUrl.trim(),
  credential_id: state.credentialId.trim(),
  nova_endpoint: state.novaEndpoint.trim(),
  ca_certificate: state.caCertificate.trim(),
};
if (state.credentialSecret.trim()) {
  request.credential_secret = state.credentialSecret;
}
return request;
```

- Add an entry to `ERROR_CODE_TO_KEY` and `ErrorMessageKey` for `INVALID_CA_CERTIFICATE` → a new localized message key so an unparseable certificate shows a clear banner.

### 8. i18n — `frontend/src/i18n/translations.ts`

Add matching keys to both the French (`fr`) and English (`en`) dictionaries under `prereq.servers.credentials.*` and the error group:

| Key | FR | EN |
| --- | --- | --- |
| `prereq.servers.credentials.caCertificate` | `Certificat CA (PEM)` | `CA certificate (PEM)` |
| `prereq.servers.error.invalidCaCertificate` | `Le certificat CA fourni est invalide (format PEM).` | `The provided CA certificate is invalid (PEM format).` |

Both dictionaries must receive both keys to preserve EN/FR key parity.

### 9. Installation export — `frontend/src/services/installationExport.ts`

- Extend `InstallationExport['servers']['credentials']` with `ca_certificate: string`.
- In `buildInstallationExport`, populate it from the loaded config: `ca_certificate: cfg.ca_certificate ?? ''`.
- In `renderServersSection`, add a row to the credential table showing the CA certificate (or a muted placeholder when empty). Unlike the secret, the CA certificate is non-secret and is exported verbatim.

## Data Models

### `prerequisite_credential_config` (updated)

| Column | Type | Nullable | Notes |
| --- | --- | --- | --- |
| id | Uuid | no | PK |
| installation_id | Uuid | no | FK installations.id, unique (one row per installation) |
| auth_url | String(1000) | no | non-secret |
| credential_id | String(255) | no | non-secret |
| nova_endpoint | String(1000) | no | non-secret |
| **ca_certificate** | **Text** | **yes** | **new; non-secret PEM; NULL/empty ⇒ system trust store** |
| credential_secret_encrypted | Text | yes | Fernet ciphertext, write-only |
| updated_at | DateTime(tz) | no | |
| updated_by | Uuid | yes | FK users.id |

The existing `uq_credential_config_installation` unique constraint already guarantees exactly one CA certificate value per installation (Requirement 2.5); no new constraint is needed.

### Effective CA certificate resolution (retrieve)

```
effective_ca = payload.ca_certificate (persisted on upsert) → config.ca_certificate or ""
verify = True                 if effective_ca is empty/whitespace
       = SSLContext(cadata=…) if effective_ca is non-empty and valid PEM
       = raise INVALID_CA_CERTIFICATE  if non-empty and unparseable
```

## Correctness Properties

*A property is a characteristic or behavior that should hold true across all valid executions of a system — essentially, a formal statement about what the system should do. Properties serve as the bridge between human-readable specifications and machine-verifiable correctness guarantees.*

### Property 1: CA certificate input round-trip in the form

*For any* text value entered into the CA certificate textarea, the credentials form state SHALL retain exactly that value, and the rendered textarea SHALL display it (controlled-input round-trip).

**Validates: Requirements 1.2**

### Property 2: Empty CA certificate never gates save or retrieve

*For any* credentials form state whose required fields (auth URL, credential id, Nova endpoint, and secret-when-none-stored) are otherwise valid, an empty CA certificate SHALL NOT produce a validation failure — `validateCredentialsForm` returns `null`.

**Validates: Requirements 1.3**

### Property 3: CA certificate persistence round-trip

*For any* CA certificate string (including the empty string), saving the credential configuration for an installation and then loading it SHALL return a configuration whose `ca_certificate` equals the saved value.

**Validates: Requirements 2.1, 2.2, 2.4**

### Property 4: Exactly one CA certificate per installation (last-write-wins)

*For any* sequence of two saves of different CA certificate values to the same installation, loading the configuration SHALL return the value from the most recent save, and exactly one configuration row SHALL exist for that installation.

**Validates: Requirements 2.5**

### Property 5: TLS verification uses the effective CA certificate for both calls

*For any* effective CA certificate value supplied for a retrieval, both the Keystone token acquisition and the Nova server list SHALL construct their HTTP client with the same TLS verification setting derived from that value: a certificate context built from the CA certificate when it is non-empty and valid, or the system default trust store when it is empty.

**Validates: Requirements 3.1, 3.2, 3.3, 3.5**

### Property 6: Invalid PEM yields a CA-specific error with no outbound call

*For any* non-empty CA certificate string that cannot be parsed as valid PEM, the retrieval SHALL return an error response whose code identifies the CA certificate as the cause (`INVALID_CA_CERTIFICATE`), and SHALL NOT attempt either OpenStack call.

**Validates: Requirements 3.4**

### Property 7: Export includes the stored CA certificate

*For any* stored credential configuration, the installation export document's `servers.credentials.ca_certificate` SHALL equal the loaded configuration's CA certificate value.

**Validates: Requirements 4.1**

## Testing Strategy

**Dual approach.** Property tests cover the universal behaviors above; example and edge-case tests cover fixed presence and boundary conditions.

**Property tests** (minimum 100 iterations each; tagged `Feature: openstack-ca-certificate, Property {n}: {text}`):

- **P1** (frontend, React Testing Library + fast-check): generate arbitrary strings, fire a change on the CA textarea, assert value round-trips.
- **P2** (frontend): generate otherwise-valid form states with empty `caCertificate`; assert `validateCredentialsForm` returns `null`.
- **P3** (backend, Hypothesis, DB-backed): generate CA certificate strings (incl. empty); save then load via the credentials endpoints; assert equality.
- **P4** (backend): generate two distinct values; save in sequence; assert load returns the second and only one row exists.
- **P5** (backend, Hypothesis + mocked `httpx.AsyncClient`): parameterize over empty vs. non-empty valid CA cert and inline vs. stored source; intercept `AsyncClient(verify=…)` construction for both `_get_token` and `_list_servers`; assert both receive the expected verify (context vs. `True`). Use a fixed known-valid PEM fixture for the non-empty branch to keep generation cheap.
- **P6** (backend): generate non-empty non-PEM strings; assert retrieve returns `INVALID_CA_CERTIFICATE` and that neither OpenStack call was invoked (mock asserts zero calls).
- **P7** (frontend): generate CA cert values on the loaded config mock; assert `buildInstallationExport(...).servers.credentials.ca_certificate` equals it.

**Example / edge tests:**

- 1.1 — render `CredentialsForm` with an `installationId`; assert a labeled multi-line textarea for the CA certificate is present.
- 1.4 — assert `prereq.servers.credentials.caCertificate` exists and is non-empty in both `en` and `fr` (covered by the existing EN/FR key-parity test once keys are added).
- 2.3 — assert `ca_certificate` is present in `CredentialConfigResponse` (whereas the secret is not) and the persisted DB value equals the plaintext for a representative certificate (verifies non-encrypted storage).
- 2.2 — empty-string save/load boundary (also exercised by P3's generator).
- Migration smoke — apply the new migration on a schema at `remap_document_categories`; assert the `ca_certificate` column exists and is nullable, and that `downgrade()` drops it.

**Property-test configuration:** minimum 100 iterations per property; each property test references its design-document property number in the tag. Backend property tests that touch outbound calls use mocks for `httpx.AsyncClient` (no real network); the DB round-trip tests use the test database/session fixtures already used by the prerequisites router tests.
