# Design Document

## Overview

This feature adds live OpenStack node/server status retrieval to the **Servers nodes** tab (`servers-nodes` slug) of the OPCP installation prerequisites area. It follows the established architecture: a React/TypeScript + Vite frontend talks to a Python/FastAPI backend through the shared axios client, and the backend acts as an OpenStack proxy so credentials never leave the server.

The tab gains three new pieces while preserving the existing static `ServersTable`:

1. A **Credentials form** collecting Auth URL, Credential ID, Credential Secret (masked), and Nova endpoint.
2. A **RETRIEVE INFO** button that validates input, persists the non-secret config plus the write-only secret, and triggers the live retrieval.
3. A **live results section** rendering the Nova server list (id, name, status) below the form.

The backend persists a per-installation `Credential_Config` (Auth URL, Credential ID, Nova endpoint, and an encrypted write-only secret) and performs the two-step OpenStack flow: obtain a Keystone token via the application-credential method, then list Nova servers. The credential secret and the Keystone token are never returned to the client, on success or on error.

### Key design decisions

- **Backend-as-proxy.** All OpenStack HTTP happens server-side with `httpx.AsyncClient`, matching the existing outbound-call pattern in `app/oracle/ai_providers.py`. The browser never receives the secret or the `X-Subject-Token`.
- **Write-only secret at rest.** The secret is stored encrypted with Fernet (symmetric, from the already-present `cryptography` package) using a key derived from `settings.SECRET_KEY`. It is decrypted only in-memory during a retrieve call and is excluded from every response schema.
- **Installation-scoped persistence.** `Credential_Config` keys on `installation_id` (one config per installation), mirroring how `PrerequisiteContent`/`PrerequisiteAnswer` scope by installation. This threads `installationId` through `ServersTable`, which today renders without it.
- **New route family under the existing router.** Endpoints mount on the existing `/api/prerequisites` router, reusing its auth dependencies (`get_current_user`, `get_administrator`) and the shared `ErrorResponse` contract.
- **Secret-provided-once retrieval semantics.** Retrieve accepts an optional inline secret. When present, it is persisted and used; when absent, the stored secret is used. Validation only requires a secret when none is stored.

## Architecture

```
┌──────────────────────────────────────────────────────────────────────────┐
│ Frontend (React / TypeScript / Vite)                                       │
│                                                                            │
│  InstallationPrereqPage ── ChecklistTabs ── ServersTable(installationId)   │
│                                                │                           │
│                          ┌─────────────────────┼──────────────────────┐    │
│                          │ CredentialsForm      │ LiveResultsSection    │   │
│                          │ (Auth URL, Cred ID,  │ (loading / error /    │   │
│                          │  Secret*, Nova URL,  │  Nova server rows)    │   │
│                          │  RETRIEVE INFO)      │                       │   │
│                          └─────────────────────┼──────────────────────┘    │
│                                                │                           │
│                       prerequisitesService (shared axios client)           │
└───────────────────────────────────────────────┼──────────────────────────┘
                                                 │ /api/prerequisites/installations/{id}/servers-nodes/...
┌───────────────────────────────────────────────┼──────────────────────────┐
│ Backend (FastAPI)                              ▼                           │
│                                                                            │
│  prerequisites/router.py                                                   │
│   • GET  .../credentials      → CredentialConfigResponse (no secret)       │
│   • PUT  .../credentials      → save config (+ optional secret)            │
│   • POST .../servers/retrieve → OpenStackProxy.retrieve()                  │
│                                                                            │
│  prerequisites/openstack.py (OpenStackProxy)                               │
│   1. POST {auth_url}/auth/tokens  (application_credential)                 │
│   2. read X-Subject-Token header  → Auth_Token                            │
│   3. GET  {nova_endpoint}/servers (X-Auth-Token: Auth_Token)              │
│   4. map → [{id, name, status}]                                           │
│                                                                            │
│  models/credential_config.py (CredentialConfig)  ── Alembic migration      │
│  security: Fernet encrypt/decrypt keyed off SECRET_KEY                      │
└──────────────────────────────────────┬───────────────────────────────────┘
                                        │ httpx.AsyncClient
                                        ▼
                              OpenStack Keystone + Nova
```

### Retrieve sequence

```
Operator        CredentialsForm     prerequisitesService     router      OpenStackProxy    Keystone/Nova
   │                  │                     │                   │              │                 │
   │ click RETRIEVE   │                     │                   │              │                 │
   │─────────────────▶│ validate required   │                   │              │                 │
   │                  │ fields (client-side)│                   │              │                 │
   │                  │────────────────────▶│ POST .../servers/retrieve        │                 │
   │                  │                     │──────────────────▶│ persist config + secret         │
   │                  │                     │                   │─────────────▶│ POST /auth/tokens│
   │                  │                     │                   │              │────────────────▶│
   │                  │                     │                   │              │◀── X-Subject-Token
   │                  │                     │                   │              │ GET /servers     │
   │                  │                     │                   │              │────────────────▶│
   │                  │                     │                   │              │◀── server list   │
   │                  │                     │◀── {servers:[...]}│◀─ [{id,name,status}]            │
   │◀── render rows / error message         │                   │              │                 │
```

## Components and Interfaces

### Frontend

#### `ServersTable.tsx` (modified)

`ServersTable` gains an optional `installationId` prop and, when present, renders the credentials form and live results section above the existing static table. The static table rendering is unchanged (Req 1.4).

```tsx
interface ServersTableProps {
  title: string;
  variant?: 'card' | 'embedded';
  nodes?: ReadonlyArray<ServerNode>;
  /** When present, enables the live-retrieval credentials form + results. */
  installationId?: string;
}
```

Internal composition (kept in the same file or split into local subcomponents):

- `CredentialsForm` — controlled inputs for `authUrl`, `credentialId`, `credentialSecret` (masked `type="password"`), `novaEndpoint`; the RETRIEVE INFO button; inline validation messages; a "secret stored" indicator.
- `LiveResultsSection` — loading indicator, error banner (invalid-credentials / connection / OpenStack), and a table of `{ id, name, status }` rows.

On mount (when `installationId` is set) it calls `loadCredentialConfig` to prefill non-secret fields and set the `secretStored` flag (Req 4.1, 4.2).

#### `ChecklistTabs.tsx` and `InstallationPrereqPage.tsx` (modified)

Thread `installationId` into the servers tab. `ChecklistTabs` already receives `installationId`; pass it to `ServersTable`:

```tsx
{tab.kind === 'servers' ? (
  <ServersTable title={tab.title} variant="embedded" installationId={installationId} />
) : ( /* ... */ )}
```

`InstallationPrereqPage`'s single-slug `servers` branch passes the route `installationId`:

```tsx
if (config.archetype === 'servers') {
  return <ServersTable title={config.title} installationId={installationId} />;
}
```

#### `prerequisitesService.ts` (extended)

New TypeScript types and methods using the shared axios `api` client (Req 4.3):

```ts
export interface CredentialConfig {
  auth_url: string;
  credential_id: string;
  nova_endpoint: string;
  secret_stored: boolean; // secret is never returned; only whether one exists
}

export interface SaveCredentialConfigRequest {
  auth_url: string;
  credential_id: string;
  nova_endpoint: string;
  credential_secret?: string; // omitted when reusing the stored secret
}

export interface NovaServer {
  id: string;
  name: string;
  status: string;
}

export interface RetrieveServersResponse {
  servers: NovaServer[];
}

const SERVERS_SLUG = 'servers-nodes';

// added to prerequisitesService:
async loadCredentialConfig(installationId: string): Promise<CredentialConfig>;
async saveCredentialConfig(installationId: string, cfg: SaveCredentialConfigRequest): Promise<CredentialConfig>;
async retrieveServers(installationId: string, cfg: SaveCredentialConfigRequest): Promise<RetrieveServersResponse>;
```

Routes (consistent with the existing `/prerequisites/installations/{installationId}/{slug}/...` shape):

- `GET  /prerequisites/installations/{installationId}/servers-nodes/credentials`
- `PUT  /prerequisites/installations/{installationId}/servers-nodes/credentials`
- `POST /prerequisites/installations/{installationId}/servers-nodes/servers/retrieve`

`retrieveServers` persists config (Req 3.1, 3.2) and returns the live list in one call, matching the "RETRIEVE INFO saves then retrieves" flow.

### Backend

#### `app/prerequisites/router.py` (extended)

Three new endpoints on the existing router. All reuse `_get_installation_or_404` and the `ErrorResponse` contract.

```python
@router.get(
    "/installations/{installation_id}/servers-nodes/credentials",
    response_model=CredentialConfigResponse,
)
async def get_credential_config(installation_id: UUID, ...):
    """Return stored config (never the secret); secret_stored flags presence."""

@router.put(
    "/installations/{installation_id}/servers-nodes/credentials",
    response_model=CredentialConfigResponse,
)
async def save_credential_config(installation_id: UUID, payload: CredentialConfigSaveRequest, ...):
    """Upsert config by installation_id; encrypt+store secret only when provided."""

@router.post(
    "/installations/{installation_id}/servers-nodes/servers/retrieve",
    response_model=RetrieveServersResponse,
)
async def retrieve_servers(installation_id: UUID, payload: CredentialConfigSaveRequest, ...):
    """Persist config, resolve secret (inline or stored), run the OpenStack flow."""
```

`retrieve_servers` logic:

1. `_get_installation_or_404`.
2. Upsert `CredentialConfig` with `auth_url`, `credential_id`, `nova_endpoint` (Req 3.1). If `credential_secret` is provided, encrypt and store it (Req 3.2).
3. Resolve the effective secret: inline value if provided, else decrypt the stored value. If neither exists → `MISSING_CREDENTIAL_SECRET` 400 (defense in depth behind client validation, Req 2.4).
4. Call `OpenStackProxy.retrieve(auth_url, credential_id, secret, nova_endpoint)`.
5. Return `RetrieveServersResponse(servers=[...])`. The secret and token are never included in the response (Req 5.3, 6.2).

#### `app/prerequisites/openstack.py` (new — OpenStackProxy)

Encapsulates the two OpenStack calls with `httpx.AsyncClient`. Never logs or returns the secret/token.

```python
class OpenStackError(Exception):
    """Base for proxy failures, carrying a stable error code."""
    code: str

class OpenStackAuthError(OpenStackError):        # invalid credentials  → code AUTH_FAILED
class OpenStackConnectionError(OpenStackError):  # network failure      → code CONNECTION_FAILED
class OpenStackServiceError(OpenStackError):     # nova/keystone 4xx/5xx → code OPENSTACK_ERROR

async def retrieve(auth_url, credential_id, secret, nova_endpoint) -> list[NovaServerDTO]:
    token = await _get_token(auth_url, credential_id, secret)   # POST {auth_url}/auth/tokens
    return await _list_servers(nova_endpoint, token)            # GET  {nova_endpoint}/servers
```

`_get_token` posts the Keystone application-credential body (Req 5.1):

```json
{
  "auth": {
    "identity": {
      "methods": ["application_credential"],
      "application_credential": { "id": "<credential_id>", "secret": "<secret>" }
    }
  }
}
```

On success it reads `X-Subject-Token` from the response headers (Req 5.2). `401/403` → `OpenStackAuthError`; connection/timeout (`httpx.ConnectError`, `httpx.TimeoutException`) → `OpenStackConnectionError`; other non-2xx → `OpenStackServiceError`.

`_list_servers` issues `GET {nova_endpoint}/servers` with header `X-Auth-Token: <token>` (Req 6.1), then maps each Nova server to `{id, name, status}` (Req 6.2). Non-2xx → `OpenStackServiceError`; connection/timeout → `OpenStackConnectionError`.

The router maps these exceptions to responses (Req 8):

| Exception | HTTP status | Error code | Frontend message key |
|-----------|-------------|------------|----------------------|
| `OpenStackAuthError` | 401 | `AUTH_FAILED` | `prereq.servers.error.invalidCredentials` |
| `OpenStackConnectionError` | 502 | `CONNECTION_FAILED` | `prereq.servers.error.connection` |
| `OpenStackServiceError` | 502 | `OPENSTACK_ERROR` | `prereq.servers.error.openstack` |

None of these error bodies include the secret or token (Req 8.4). Error `details` carry only non-sensitive context (e.g. the failing endpoint, upstream status code).

#### `app/prerequisites/security.py` (new — secret encryption)

```python
def _fernet() -> Fernet:
    # Derive a 32-byte urlsafe key from settings.SECRET_KEY (SHA-256 → base64url).
    ...

def encrypt_secret(plaintext: str) -> str: ...   # returns Fernet token (str)
def decrypt_secret(ciphertext: str) -> str: ...   # raises on tamper/rotation
```

Uses `cryptography.fernet.Fernet`, already available through `python-jose[cryptography]`. The plaintext secret exists only transiently in memory during a save/retrieve; only the ciphertext is persisted.

## Data Models

### Persistence: `CredentialConfig` (new — `app/models/credential_config.py`)

```python
class CredentialConfig(Base):
    __tablename__ = "prerequisite_credential_config"

    id: Mapped[uuid.UUID] = mapped_column(primary_key=True, default=uuid.uuid4,
                                           server_default=text("gen_random_uuid()"))
    installation_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("installations.id",
                   name="fk_credential_config_installation_id",
                   ondelete="CASCADE"),
        nullable=False)
    auth_url: Mapped[str] = mapped_column(String(1000), nullable=False, default="")
    credential_id: Mapped[str] = mapped_column(String(255), nullable=False, default="")
    nova_endpoint: Mapped[str] = mapped_column(String(1000), nullable=False, default="")
    # Encrypted (Fernet) write-only secret; NULL when never provided.
    credential_secret_encrypted: Mapped[str | None] = mapped_column(Text, nullable=True)
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False,
        default=lambda: datetime.now(timezone.utc), onupdate=lambda: datetime.now(timezone.utc))
    updated_by: Mapped[uuid.UUID | None] = mapped_column(ForeignKey("users.id"), nullable=True)

    installation = relationship("Installation", back_populates="credential_config")

    __table_args__ = (
        UniqueConstraint("installation_id",
                         name="uq_credential_config_installation"),
        Index("ix_credential_config_installation_id", "installation_id"),
    )
```

`Installation` gains `credential_config = relationship("CredentialConfig", back_populates="installation", cascade="all, delete-orphan", uselist=False)`. The model is registered in `app/models/__init__.py`.

One config row per installation (unique on `installation_id`); the encrypted secret is a nullable column so a config can exist before a secret is supplied.

### Alembic migration (new)

`migrations/versions/20260927_0000_add_credential_config_add_openstack_credential_config.py`

- `revision = 'add_openstack_credential_config'`
- `down_revision = 'add_event_assignments'` (current head)

```python
def upgrade() -> None:
    op.create_table(
        "prerequisite_credential_config",
        sa.Column("id", sa.Uuid(), server_default=sa.text("gen_random_uuid()"), nullable=False),
        sa.Column("installation_id", sa.Uuid(), nullable=False),
        sa.Column("auth_url", sa.String(length=1000), nullable=False, server_default=""),
        sa.Column("credential_id", sa.String(length=255), nullable=False, server_default=""),
        sa.Column("nova_endpoint", sa.String(length=1000), nullable=False, server_default=""),
        sa.Column("credential_secret_encrypted", sa.Text(), nullable=True),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("updated_by", sa.Uuid(), nullable=True),
        sa.ForeignKeyConstraint(["installation_id"], ["installations.id"],
                                name="fk_credential_config_installation_id", ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["updated_by"], ["users.id"]),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("installation_id", name="uq_credential_config_installation"),
    )
    op.create_index("ix_credential_config_installation_id",
                    "prerequisite_credential_config", ["installation_id"], unique=False)

def downgrade() -> None:
    op.drop_index("ix_credential_config_installation_id",
                  table_name="prerequisite_credential_config")
    op.drop_table("prerequisite_credential_config")
```

### Pydantic schemas (new — in `app/prerequisites/schemas.py`)

```python
class CredentialConfigResponse(BaseModel):
    """Config returned to the client. The secret is NEVER present; only a flag."""
    auth_url: str
    credential_id: str
    nova_endpoint: str
    secret_stored: bool
    model_config = ConfigDict(from_attributes=False)

class CredentialConfigSaveRequest(BaseModel):
    auth_url: str = Field(min_length=1)
    credential_id: str = Field(min_length=1)
    nova_endpoint: str = Field(min_length=1)
    credential_secret: Optional[str] = None  # omit to reuse stored secret

class NovaServerSchema(BaseModel):
    id: str
    name: str
    status: str

class RetrieveServersResponse(BaseModel):
    servers: list[NovaServerSchema]
```

`CredentialConfigResponse` deliberately has no secret field, so the secret cannot be serialized back to the client on any path (Req 3.3, 5.3, 8.4).

## Error Handling

- **Client-side validation (Req 2).** RETRIEVE INFO is blocked and an inline message shown when `authUrl`, `credentialId`, or `novaEndpoint` is empty, or when `credentialSecret` is empty *and* no secret is stored (`secretStored === false`). This prevents the request entirely.
- **Server-side validation.** `CredentialConfigSaveRequest` enforces non-empty non-secret fields (422). Retrieve re-checks secret presence and returns `MISSING_CREDENTIAL_SECRET` (400) if none is available — defense in depth behind the client gate.
- **OpenStack auth rejection (Req 8.1).** `OpenStackAuthError` → 401 `AUTH_FAILED`; the results section shows the invalid-credentials message.
- **Network failure (Req 8.2).** `OpenStackConnectionError` → 502 `CONNECTION_FAILED`; shows the connection-error message.
- **OpenStack service error (Req 8.3).** `OpenStackServiceError` → 502 `OPENSTACK_ERROR`; shows the OpenStack-error message.
- **Secret/token leakage prevention (Req 5.3, 8.4).** The secret and `X-Subject-Token` are held only in local variables inside `OpenStackProxy`. They are never placed in response bodies, error `details`, or logs. Logging uses identifiers (installation id, endpoint, upstream status) but never credential material.
- **DB failures.** Follow the existing router pattern: `db.rollback()` and a `DATABASE_ERROR` 500 with a non-sensitive message.

The frontend maps backend error codes to i18n message keys; an unrecognized code falls back to `prereq.servers.error.generic`.

## Internationalization

New `prereq.*` keys added to both `fr` and `en` in `frontend/src/i18n/translations.ts` (Req 9). Both dictionaries share the identical key set.

| Key | Purpose |
|-----|---------|
| `prereq.servers.credentials.title` | Credentials form heading |
| `prereq.servers.credentials.authUrl` | Auth URL label |
| `prereq.servers.credentials.credentialId` | Credential ID label |
| `prereq.servers.credentials.credentialSecret` | Credential Secret label |
| `prereq.servers.credentials.novaEndpoint` | Nova endpoint label |
| `prereq.servers.credentials.secretStored` | "A secret is stored" indicator |
| `prereq.servers.retrieve` | RETRIEVE INFO button label |
| `prereq.servers.retrieving` | Loading indicator text |
| `prereq.servers.validation.authUrlRequired` | Auth URL required message |
| `prereq.servers.validation.credentialIdRequired` | Credential ID required message |
| `prereq.servers.validation.novaEndpointRequired` | Nova endpoint required message |
| `prereq.servers.validation.secretRequired` | Secret required (none stored) message |
| `prereq.servers.results.title` | Live results section heading |
| `prereq.servers.results.colId` | Results column: id |
| `prereq.servers.results.colName` | Results column: name |
| `prereq.servers.results.colStatus` | Results column: status |
| `prereq.servers.results.empty` | No servers returned |
| `prereq.servers.error.invalidCredentials` | Auth failure message |
| `prereq.servers.error.connection` | Connection failure message |
| `prereq.servers.error.openstack` | OpenStack error message |
| `prereq.servers.error.generic` | Fallback error message |

## Testing Strategy

### Frontend (vitest)

`ServersTable.*.test.tsx` (Req 10.1):
- Required-field validation blocks retrieval and shows the matching message for each empty field, including the "secret required only when none stored" branch.
- Successful retrieval renders one row per Nova server with id, name, status; loading indicator appears while the request is pending and results replace prior results on a second retrieve (Req 7.2, 7.3).
- Each error code renders its mapped message.
- The existing static table still renders alongside the form (Req 1.4) — extend `ServersTable.preservation.test.tsx`.

`prerequisitesService.test.ts` (Req 10.2):
- `saveCredentialConfig` / `loadCredentialConfig` / `retrieveServers` call the correct installation-scoped URLs on the shared axios mock, and the response never carries a secret field.

### Backend (pytest)

`tests/prerequisites/test_openstack_credentials.py` (Req 10.3):
- **Persistence with write-only secret:** PUT/POST stores the encrypted secret; GET returns config with `secret_stored=True` and no secret field; the stored ciphertext differs from the plaintext.
- **Successful token-and-servers retrieval:** with `httpx` mocked, POST `/auth/tokens` returns `X-Subject-Token`, `GET /servers` returns a list, and the endpoint returns mapped `{id, name, status}` with no secret/token in the body.
- **Error handling:** 401 from Keystone → `AUTH_FAILED`; connection error → `CONNECTION_FAILED`; Nova 5xx → `OPENSTACK_ERROR`; every error body is asserted to contain neither the secret nor the token.

Property-based tests (`hypothesis`, already available) back the round-trip property below with ≥100 iterations.

## Correctness Properties

*A property is a characteristic or behavior that should hold true across all valid executions of a system — a formal statement about what the system should do. Properties bridge human-readable specifications and machine-verifiable correctness guarantees.*

### Property 1: Secret encryption round-trip

For any credential secret string, encrypting it and then decrypting the result yields the original secret, and the stored ciphertext is never equal to the plaintext.

**Validates: Requirements 3.2**

### Property 2: Secret never appears in any response

For any credential configuration save, load, retrieve, or error response produced by the backend, the serialized response body contains neither the credential secret nor the Keystone auth token.

**Validates: Requirements 3.3, 5.3, 8.4**

### Property 3: Required-field validation gates retrieval

For any credentials form state where Auth URL, Credential ID, or Nova endpoint is empty — or the secret is empty while no secret is stored — activating RETRIEVE INFO produces a validation message and no retrieval request is sent.

**Validates: Requirements 2.1, 2.2, 2.3, 2.4**

### Property 4: Non-secret configuration persistence round-trip

For any valid non-secret configuration (Auth URL, Credential ID, Nova endpoint) saved for an installation, a subsequent load for that installation returns exactly those values.

**Validates: Requirements 3.1, 4.1**

### Property 5: Live results reflect the retrieved server list

For any Nova server list returned by the proxy, the live results section renders exactly one row per server, each showing that server's id, name, and status, and a subsequent successful retrieval replaces the previously rendered rows.

**Validates: Requirements 6.2, 7.1, 7.3**

### Property 6: Error responses map to the correct client message

For any OpenStack failure — invalid credentials, network failure, or OpenStack service error — the backend returns the corresponding error code and the live results section displays the matching localized message.

**Validates: Requirements 8.1, 8.2, 8.3**
