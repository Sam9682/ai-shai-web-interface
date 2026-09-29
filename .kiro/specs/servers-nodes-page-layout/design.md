# Design Document

## Overview

This feature reorganizes the Servers_Nodes_Page (rendered by `frontend/src/components/prerequisites/ServersTable.tsx`) and makes the nodes inventory editable and persistent per installation. Three things change:

1. **Layout reversal** — the nodes table renders **above** the OpenStack `CredentialsForm` block (credentials fields, RETRIEVE INFO button, and live results section move below the table).
2. **Role-gated inline editing** — members and administrators can edit all six node columns as free text; visitors keep a read-only table. No rows can be added or removed.
3. **Per-installation persistence** — edits are saved to a new Python backend endpoint and storage scoped to the installation, mirroring the existing per-installation credentials/answers pattern, so they survive reloads.

The persisted data is a **layer of per-installation overrides on top of the hardcoded default node set** (`SERVER_NODES` in `serversData.ts`), keyed by `nodeUuid`. Defaults remain the source of truth for which rows exist; overrides only change field values of existing rows. This keeps the "edit existing rows only, no add/delete" constraint (Req 2.4) structurally enforced.

The work spans:
- **Frontend component**: `ServersTable.tsx` (JSX reorder + editable table + save wiring + error banner).
- **Frontend service**: a new `loadServerNodes` / `saveServerNodes` pair on `prerequisitesService`, mirroring `loadCredentialConfig` / `saveCredentialConfig`.
- **Frontend merge util**: pure `mergeNodeOverrides(defaults, overrides)` layering logic.
- **Backend**: new `GET`/`PUT` endpoints under the existing `/prerequisites/installations/{id}/servers-nodes/...` namespace, a new `ServerNodeOverride` model + migration, and Pydantic schemas.
- **i18n**: new keys under `prereq.servers.*` for edit/save states and node save errors.

## Architecture

```
InstallationPrereqPage (archetype 'servers')         ChecklistTabs (tab.kind 'servers', variant 'embedded')
                     \                                        /
                      \                                      /
                       v                                    v
                          ServersTable.tsx (installationId)
                          ├─ NodesTable (editable, role-gated)   ← RENDERED FIRST
                          │     ├─ loads nodes on mount (loadServerNodes)
                          │     ├─ merges overrides over SERVER_NODES defaults
                          │     ├─ inline edit inputs (member/administrator)
                          │     ├─ save on confirm (saveServerNodes)
                          │     └─ error banner on save failure
                          └─ CredentialsForm (installationId)    ← RENDERED SECOND
                                └─ LiveResultsSection (unchanged)

                          prerequisitesService
                          ├─ loadServerNodes(installationId)  GET  .../servers-nodes/nodes
                          └─ saveServerNodes(installationId, nodes)  PUT  .../servers-nodes/nodes
                                              │
                                              v
                          app/prerequisites/router.py
                          ├─ GET  /installations/{id}/servers-nodes/nodes
                          └─ PUT  /installations/{id}/servers-nodes/nodes
                                              │
                                              v
                          ServerNodeOverride (prerequisite_server_node table)
                          keyed by (installation_id, node_uuid)
```

### Layout reversal

In `ServersTable`, the render body currently emits `{installationId && <CredentialsForm/>}` before the table `<div>`. The design swaps this order so the nodes table `<div>` is emitted first and the credentials block second. Because both live in the same `body` fragment, this is a JSX reordering with no change to the credentials logic. The `CredentialsForm` (with its `LiveResultsSection`) is unchanged.

### Editable nodes table

The read-only cell renderers (`MonoCell`, `StatePill`, and the plain remark cell) are kept for the **visitor** path and for non-edit display. For **member/administrator**, each cell renders an `<input>` bound to per-row edit state. All six columns become free-text inputs (Node UUID, Serial Number, Instance UUID, Power State, Provision State, Remark), consistent with Req 2.2. State pills are only used in read-only display; while editing, the raw text is shown in an input so any value is accepted.

Role is resolved once from `authService`:
- `authService.isAdmin()` → administrator.
- `authService.getCurrentUser()?.role === 'member'` → member.
- Editing is enabled when the role is member **or** administrator; otherwise (visitor / unauthenticated) the table is read-only.

Edit interaction: each editable field commits on blur or Enter ("confirm an edit"), matching Req 3.1's "confirms an edit". On confirm, the full merged node list (with the change applied) is sent to the backend via `saveServerNodes`. This mirrors the last-write-wins per-installation persistence already used for answers and credentials.

### Persistence model — overrides layered over defaults

Defaults (`SERVER_NODES`) define the canonical row set. The backend stores, per installation, only the rows that have been edited, keyed by `node_uuid`. On load:

```
merged[i] = default[i] with any stored override fields applied (matched by nodeUuid)
```

Rows in the defaults with no stored override render with default values. Stored overrides whose `node_uuid` no longer matches any default are ignored on read (defaults are authoritative for existence — Req 2.4). This layering is implemented as a pure function `mergeNodeOverrides` on the frontend and mirrored by the merge the `GET` endpoint performs (the `GET` returns the fully merged node set so the frontend does not need the defaults duplicated server-side — see Data Models).

Design decision: the **`GET` returns the merged, complete node list** (defaults with overrides applied). The backend owns the default set as a server-side constant mirroring `SERVER_NODES`, so a single source of truth for "what is a node" is not required across the wire — the frontend also holds `SERVER_NODES` and can merge defensively. To avoid drift, the authoritative merge for display uses the frontend defaults (`SERVER_NODES`) with the override values returned by the backend applied by `nodeUuid`. The backend persists and returns overrides; the frontend applies them over its own defaults. This keeps the default inventory in one place (`serversData.ts`) and treats the backend purely as an override store.

Revised contract (final):
- `GET .../servers-nodes/nodes` → `{ nodes: ServerNodeOverridePayload[] }` — the stored overrides only (may be empty).
- `PUT .../servers-nodes/nodes` → body `{ nodes: ServerNodeOverridePayload[] }` — the full set of node rows as currently displayed; the backend upserts one override row per `node_uuid` (last-write-wins) and returns the stored overrides.

The frontend always renders `mergeNodeOverrides(SERVER_NODES, storedOverrides)`.

### Error handling

Save failures surface through the same banner pattern already used for the credentials retrieve flow. A new error-code map for node saves reuses the `ERROR_CODE_TO_KEY` approach:
- `DATABASE_ERROR` / unknown → `prereq.servers.nodes.error.save` (generic save failure).
- `INSTALLATION_NOT_FOUND` → `prereq.servers.nodes.error.notFound`.

On a rejected `saveServerNodes`, `ServersTable` sets a node-save error key and renders an `role="alert"` banner above the table (mirroring the credentials `errorKey` banner). The banner clears on the next successful save or when the user edits again.

## Components and Interfaces

### Frontend: `serversData.ts` (unchanged data, reused type)

`ServerNode` and `SERVER_NODES` are unchanged. `SERVER_NODES` remains the default inventory and the merge base.

### Frontend: `mergeNodeOverrides` (new pure util)

Placed alongside `serversData.ts` (e.g. exported from `serversData.ts` or a new `serverNodeOverrides.ts`) so it is unit/property testable in isolation.

```typescript
/** A stored per-installation override of a node row, keyed by nodeUuid. */
export interface ServerNodeOverride {
  nodeUuid: string;
  serialNumber: string;
  instanceUuid: string;
  powerState: string;
  provisionState: string;
  remark: string;
}

/**
 * Layer per-installation overrides over the default inventory.
 * For each default row, if an override with the same nodeUuid exists, its
 * field values replace the defaults; otherwise the default row is kept.
 * Overrides whose nodeUuid matches no default are ignored (defaults are
 * authoritative for row existence).
 */
export function mergeNodeOverrides(
  defaults: ReadonlyArray<ServerNode>,
  overrides: ReadonlyArray<ServerNodeOverride>,
): ServerNode[] {
  const byUuid = new Map(overrides.map((o) => [o.nodeUuid, o]));
  return defaults.map((d) => {
    const o = byUuid.get(d.nodeUuid);
    return o ? { ...d, ...o, nodeUuid: d.nodeUuid } : { ...d };
  });
}
```

Note: `nodeUuid` in the merged output is pinned to the default's `nodeUuid` (the join key), so editing the Node UUID column edits the *value* stored in the override row's other fields conceptually — but since Node UUID is the key, editing it is treated as editing a field value of that row while the row identity (join key) stays the default UUID. This preserves the "edit existing rows only" invariant: the row set is always exactly the defaults.

### Frontend: `prerequisitesService` additions

Mirrors `loadCredentialConfig` / `saveCredentialConfig` style and the `SERVERS_SLUG` namespace.

```typescript
export interface ServerNodeOverridePayload {
  node_uuid: string;
  serial_number: string;
  instance_uuid: string;
  power_state: string;
  provision_state: string;
  remark: string;
}

export interface ServerNodesResponse {
  nodes: ServerNodeOverridePayload[];
}

// on prerequisitesService:
async loadServerNodes(installationId: string): Promise<ServerNodesResponse> {
  const response = await api.get(
    `/prerequisites/installations/${installationId}/${SERVERS_SLUG}/nodes`,
  );
  return response.data;
},

async saveServerNodes(
  installationId: string,
  nodes: ServerNodeOverridePayload[],
): Promise<ServerNodesResponse> {
  const response = await api.put(
    `/prerequisites/installations/${installationId}/${SERVERS_SLUG}/nodes`,
    { nodes },
  );
  return response.data;
},
```

The component maps between `ServerNode` (camelCase, frontend) and `ServerNodeOverridePayload` (snake_case, wire) at the service boundary.

### Frontend: `ServersTable` component changes

- Add `isEditable` derived from `authService` (member or administrator).
- Add state: `nodesOverrides` (loaded overrides), `saveErrorKey` (node-save error), and per-cell edit state.
- On mount (when `installationId` present), call `loadServerNodes` and store overrides; render `mergeNodeOverrides(nodes, overrides)`.
- Render editable inputs for each cell when `isEditable`; otherwise the existing read-only renderers.
- On confirm (blur/Enter), send the full node list via `saveServerNodes`; on rejection set `saveErrorKey`.
- Reorder JSX: nodes table first, `CredentialsForm` second.
- No add/remove controls are rendered in either mode.

### Backend: `ServerNodeOverride` model (new)

New SQLAlchemy model mapping a `prerequisite_server_node` table, mirroring `PrerequisiteAnswer`'s per-installation, keyed structure.

```python
class ServerNodeOverride(Base):
    __tablename__ = "prerequisite_server_node"

    id: Mapped[uuid.UUID] = mapped_column(
        primary_key=True, default=uuid.uuid4,
        server_default=text("gen_random_uuid()"),
    )
    installation_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("installations.id",
                   name="fk_server_node_installation_id",
                   ondelete="CASCADE"),
        nullable=False,
    )
    node_uuid: Mapped[str] = mapped_column(String(255), index=True, nullable=False)
    serial_number: Mapped[str] = mapped_column(Text, nullable=False, default="")
    instance_uuid: Mapped[str] = mapped_column(Text, nullable=False, default="")
    power_state: Mapped[str] = mapped_column(Text, nullable=False, default="")
    provision_state: Mapped[str] = mapped_column(Text, nullable=False, default="")
    remark: Mapped[str] = mapped_column(Text, nullable=False, default="")
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False,
        default=lambda: datetime.now(timezone.utc),
        onupdate=lambda: datetime.now(timezone.utc),
    )
    updated_by: Mapped[uuid.UUID | None] = mapped_column(
        ForeignKey("users.id"), nullable=True,
    )
    installation = relationship("Installation", back_populates="server_node_overrides")

    __table_args__ = (
        UniqueConstraint("installation_id", "node_uuid",
                         name="uq_server_node_installation_node"),
        Index("ix_server_node_installation_id", "installation_id"),
    )
```

`Installation` gains a `server_node_overrides` relationship (cascade delete), matching how `answers` and `credential_config` are declared.

A new Alembic migration (following the existing `migrations/versions/` naming convention, e.g. `..._add_server_node_overrides_...py`) creates `prerequisite_server_node` with the unique constraint and index above.

### Backend: schemas (new)

```python
class ServerNodePayload(BaseModel):
    node_uuid: str = Field(min_length=1)
    serial_number: str = ""
    instance_uuid: str = ""
    power_state: str = ""
    provision_state: str = ""
    remark: str = ""

class ServerNodesResponse(BaseModel):
    nodes: list[ServerNodePayload]

class ServerNodesSaveRequest(BaseModel):
    nodes: list[ServerNodePayload]
```

### Backend: endpoints (new, under existing namespace)

```
GET  /api/prerequisites/installations/{installation_id}/servers-nodes/nodes
PUT  /api/prerequisites/installations/{installation_id}/servers-nodes/nodes
```

- Both call `_get_installation_or_404` first (structured `INSTALLATION_NOT_FOUND`).
- `GET` returns the stored override rows for the installation as `ServerNodesResponse` (empty list when none).
- `PUT` requires an authorized member/administrator (reuse `get_answering_member`, matching the answers write path). It upserts one `ServerNodeOverride` per `node_uuid` in the payload (last-write-wins by `(installation_id, node_uuid)`), commits, and returns the stored overrides. DB failures roll back and return `DATABASE_ERROR` (500).
- Authorization: read via `get_current_user`; write via the member/administrator dependency, consistent with the existing answers/credentials write authorization.

## Data Models

**Wire (frontend ↔ backend):** `{ nodes: ServerNodePayload[] }` where each payload is snake_case `{ node_uuid, serial_number, instance_uuid, power_state, provision_state, remark }`.

**Persisted (`prerequisite_server_node`):** one row per `(installation_id, node_uuid)` holding the five editable field values plus tracking columns. Deleted with its installation (ON DELETE CASCADE).

**Display (frontend):** `ServerNode[]` = `mergeNodeOverrides(SERVER_NODES, overrides)`. Defaults define existence; overrides define values.

## Error Handling

| Condition | Backend | Frontend |
| --- | --- | --- |
| Unknown installation | 404 `INSTALLATION_NOT_FOUND` | error banner (`prereq.servers.nodes.error.notFound`) |
| DB failure on save | 500 `DATABASE_ERROR` (rollback) | error banner (`prereq.servers.nodes.error.save`) |
| Any save rejection | — | error banner via `NODE_ERROR_CODE_TO_KEY` with generic fallback |
| Load failure | — | leave table on defaults (empty overrides), no blocking error |

The frontend node-save error map mirrors `ERROR_CODE_TO_KEY`/`extractErrorCode` already in `ServersTable.tsx`.

## i18n

New keys under `prereq.servers.*` (add to both the French and English blocks in `frontend/src/i18n/translations.ts`):

- `prereq.servers.nodes.title` — nodes table heading (if a heading is added above the table).
- `prereq.servers.nodes.saving` — in-flight save indicator.
- `prereq.servers.nodes.saved` — optional saved confirmation.
- `prereq.servers.nodes.error.save` — generic save failure.
- `prereq.servers.nodes.error.notFound` — installation not found.
- Column header keys may be introduced if the currently hardcoded English headers ("Node UUID", etc.) should be localized; otherwise headers stay as-is (out of scope of the requirements, which only specify column identity and order).

## Testing Strategy

**Frontend (Vitest + Testing Library):**
- Update `ServersTable.preservation.test.tsx` and related tests that currently assert a strictly read-only inventory — they must reflect the editable table for member/administrator and read-only for visitor, and the new layout order. Existing credential/CA tests (`ServersTable.caCertificate*`, `ServersTable.results.test.tsx`, `ServersTable.validation.test.tsx`) should continue to pass with the credentials block relocated below the table.
- New tests: layout order (table above credentials), role gating (editable vs read-only), free-text editing, save call wiring (mocked `prerequisitesService`), save-failure error banner, and load/prefill from overrides.
- New property tests for `mergeNodeOverrides` (see Correctness Properties) and edit-apply/free-text.

**Backend (pytest, alongside `tests/prerequisites/`):**
- Endpoint tests: `GET` returns stored overrides (empty by default), `PUT` upserts and is idempotent, `INSTALLATION_NOT_FOUND` for unknown installations, authorization (member/administrator may write, visitor cannot), and per-installation isolation.
- Property tests for the override round-trip and upsert idempotency, mirroring existing `test_prerequisites_upsert_idempotency_property.py` and cross-installation isolation tests.

**Property test configuration:** minimum 100 iterations per property test; each references its design property via the tag format **Feature: servers-nodes-page-layout, Property {number}: {property_text}**.

## Correctness Properties

*A property is a characteristic or behavior that should hold true across all valid executions of a system — essentially, a formal statement about what the system should do. Properties serve as the bridge between human-readable specifications and machine-verifiable correctness guarantees.*

### Property 1: Editable fields for members and administrators

*For any* list of node rows rendered with a member or administrator role, every row exposes an editable free-text control for each of the six fields (Node UUID, Serial Number, Instance UUID, Power State, Provision State, Remark).

**Validates: Requirements 2.1, 2.2**

### Property 2: Read-only for visitors

*For any* list of node rows rendered with a visitor (or unauthenticated) role, no editable input control is present for any field of any row.

**Validates: Requirements 2.3**

### Property 3: Edit applies free text to the target field

*For any* node row, any of the six fields, and any free-text string, applying an edit of that field to that string yields a node whose target field equals the string and whose other fields are unchanged.

**Validates: Requirements 2.2**

### Property 4: Override merge round-trip preserves edits over defaults

*For any* default node set and any set of overrides whose keys are a subset of the default `nodeUuid`s, `mergeNodeOverrides(defaults, overrides)` yields a list with exactly the default rows (same count and same `nodeUuid`s in order), where each overridden row's field values equal the override and each non-overridden row equals its default.

**Validates: Requirements 2.4, 3.2, 3.3**

### Property 5: Save/load round-trip is faithful and idempotent

*For any* set of node overrides for an installation, saving them then loading returns override data equal to what was saved, and saving the same data again produces the same stored state (idempotent upsert keyed by installation and node UUID).

**Validates: Requirements 3.1, 3.2, 3.3**

### Property 6: Per-installation isolation

*For any* two distinct installations and any overrides saved to one of them, loading the other installation's node overrides is unaffected by the first.

**Validates: Requirements 3.2, 3.3**
