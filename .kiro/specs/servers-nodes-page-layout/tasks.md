# Implementation Plan: Servers Nodes Page Layout

## Overview

This plan implements the reorganized Servers_Nodes_Page: the nodes table moves above the OpenStack credentials section, becomes role-gated editable (free text for members/administrators, read-only for visitors), and persists edits per installation as a layer of overrides over the hardcoded default node set.

The work builds bottom-up: the pure merge util first (frontend and backend can rely on it), then the service wire layer, then the component reorder + editing + save wiring, then i18n, then the backend model/migration/schemas/endpoints, and finally the cross-cutting property tests. Each step ends wired into the previous ones so no code is left orphaned.

The design uses TypeScript for the frontend and Python for the backend — both are established in this workspace, so no language selection is required.

## Tasks

- [x] 1. Frontend override merge util
  - [x] 1.1 Implement `mergeNodeOverrides` pure util and `ServerNodeOverride` type
    - Add `ServerNodeOverride` interface and `mergeNodeOverrides(defaults, overrides)` in `frontend/src/components/prerequisites/serverNodeOverrides.ts` (or export from `serversData.ts`)
    - Merge by `nodeUuid`: override field values replace defaults for matching rows; non-matching defaults kept; overrides with no matching default ignored; merged `nodeUuid` pinned to the default join key
    - Keep `ServerNode` / `SERVER_NODES` unchanged as the default inventory and merge base
    - _Requirements: 2.4, 3.3_

  - [ ]* 1.2 Write property test for override merge round-trip
    - **Property 4: Override merge round-trip preserves edits over defaults**
    - **Validates: Requirements 2.4, 3.2, 3.3**
    - Min 100 iterations; tag `Feature: servers-nodes-page-layout, Property 4: ...`
    - Assert merged list has exactly the default rows (same count and `nodeUuid`s in order); overridden rows equal the override values, non-overridden rows equal defaults

  - [ ]* 1.3 Write property test for edit-apply free text
    - **Property 3: Edit applies free text to the target field**
    - **Validates: Requirements 2.2**
    - Min 100 iterations; tag `Feature: servers-nodes-page-layout, Property 3: ...`
    - For any row, any of the six fields, and any free-text string, applying the edit sets the target field to the string and leaves other fields unchanged

- [x] 2. Frontend prerequisitesService node persistence
  - [x] 2.1 Add `loadServerNodes` / `saveServerNodes` and wire types
    - Add `ServerNodeOverridePayload` (snake_case) and `ServerNodesResponse` interfaces
    - Add `loadServerNodes(installationId)` → GET `/prerequisites/installations/{id}/{SERVERS_SLUG}/nodes`
    - Add `saveServerNodes(installationId, nodes)` → PUT the same path with `{ nodes }`
    - Reuse the existing `SERVERS_SLUG` namespace; mirror `loadCredentialConfig` / `saveCredentialConfig` style
    - _Requirements: 3.1, 3.2, 3.3_

  - [ ]* 2.2 Write unit tests for the service methods
    - Test URL construction, snake_case payload shape, and response passthrough with a mocked `api`
    - _Requirements: 3.1, 3.3_

- [x] 3. Frontend ServersTable layout and editing
  - [x] 3.1 Reorder JSX so the nodes table renders above CredentialsForm
    - Emit the nodes table `<div>` first, then `{installationId && <CredentialsForm/>}` (with its `LiveResultsSection`) second, within the same body fragment
    - No change to credentials logic
    - _Requirements: 1.1, 1.2, 1.3, 1.4_

  - [x] 3.2 Load overrides on mount and render merged nodes
    - When `installationId` is present, call `loadServerNodes` on mount, map snake_case payloads to `ServerNodeOverride`, store in `nodesOverrides` state
    - Render `mergeNodeOverrides(SERVER_NODES, nodesOverrides)`; on load failure leave table on defaults (no blocking error)
    - _Requirements: 3.3_

  - [x] 3.3 Add role-gated inline editable inputs
    - Derive `isEditable` from `authService` (member or administrator); visitor/unauthenticated is read-only
    - For editable role, render a free-text `<input>` per cell for all six columns bound to per-row edit state; otherwise keep existing read-only renderers (`MonoCell`, `StatePill`, plain remark)
    - Render no add/remove row controls in either mode
    - _Requirements: 2.1, 2.2, 2.3, 2.4_

  - [x] 3.4 Wire save-on-confirm and save-failure error banner
    - On blur/Enter confirm, map the full merged node list to snake_case and call `saveServerNodes`; store returned overrides
    - Add `NODE_ERROR_CODE_TO_KEY` (`DATABASE_ERROR`/unknown → `prereq.servers.nodes.error.save`, `INSTALLATION_NOT_FOUND` → `prereq.servers.nodes.error.notFound`) reusing `extractErrorCode`
    - On rejection set `saveErrorKey` and render an `role="alert"` banner above the table; clear it on next successful save or next edit
    - _Requirements: 3.1, 3.4_

- [x] 4. Frontend i18n keys
  - [x] 4.1 Add `prereq.servers.nodes.*` keys (French + English)
    - Add `prereq.servers.nodes.saving`, `prereq.servers.nodes.saved`, `prereq.servers.nodes.error.save`, `prereq.servers.nodes.error.notFound` (and `prereq.servers.nodes.title` if a heading is used) to both language blocks in `frontend/src/i18n/translations.ts`
    - _Requirements: 3.4_

- [ ] 5. Frontend tests for layout, gating, and persistence
  - [ ]* 5.1 Update existing read-only-inventory tests
    - Update `ServersTable.preservation.test.tsx` (and any related read-only-inventory assertions) to reflect editable table for member/administrator, read-only for visitor, and the new layout order
    - Confirm `ServersTable.caCertificate*`, `ServersTable.results.test.tsx`, `ServersTable.validation.test.tsx` still pass with credentials relocated below the table
    - _Requirements: 1.1, 2.1, 2.3_

  - [ ]* 5.2 Add layout order and role-gating tests
    - Assert the nodes table renders above the credentials section (Property-informed placement)
    - **Property 1: Editable fields for members and administrators** — every row exposes an editable control for each of the six fields; tag `Feature: servers-nodes-page-layout, Property 1: ...`, min 100 iterations
    - **Property 2: Read-only for visitors** — no editable input present for any field/row; tag `Feature: servers-nodes-page-layout, Property 2: ...`, min 100 iterations
    - **Validates: Requirements 1.1, 2.1, 2.2, 2.3**

  - [ ]* 5.3 Add save wiring, save-failure banner, and load/prefill tests
    - Free-text edit calls `saveServerNodes` with the full merged list (mocked `prerequisitesService`)
    - Rejected save renders the `role="alert"` error banner with the mapped key
    - Load prefills the table from returned overrides via `mergeNodeOverrides`
    - _Requirements: 3.1, 3.3, 3.4_

- [x] 6. Checkpoint - frontend
  - Ensure all frontend tests pass, ask the user if questions arise.

- [x] 7. Backend model and migration
  - [x] 7.1 Add `ServerNodeOverride` model and Installation relationship
    - Add `ServerNodeOverride` SQLAlchemy model mapping `prerequisite_server_node` (id, installation_id FK CASCADE, node_uuid indexed, five text fields default "", updated_at, updated_by)
    - Add `UniqueConstraint(installation_id, node_uuid)` and installation-id index
    - Add `Installation.server_node_overrides` relationship (cascade delete), matching `answers` / `credential_config`
    - _Requirements: 3.2_

  - [x] 7.2 Create Alembic migration for `prerequisite_server_node`
    - New migration in `migrations/versions/` (e.g. `..._add_server_node_overrides_...py`) creating the table with the unique constraint and index
    - _Requirements: 3.2_

- [x] 8. Backend schemas
  - [x] 8.1 Add Pydantic schemas
    - `ServerNodePayload` (`node_uuid` min_length 1, five string fields default ""), `ServerNodesResponse`, `ServerNodesSaveRequest`
    - _Requirements: 3.1, 3.2, 3.3_

- [x] 9. Backend endpoints
  - [x] 9.1 Implement GET/PUT under `/servers-nodes/nodes`
    - `GET /installations/{id}/servers-nodes/nodes`: `_get_installation_or_404` then return stored overrides as `ServerNodesResponse` (empty when none); read auth via `get_current_user`
    - `PUT /installations/{id}/servers-nodes/nodes`: `_get_installation_or_404`, require member/administrator via `get_answering_member`, upsert one override per `node_uuid` (last-write-wins on `(installation_id, node_uuid)`), commit, return stored overrides
    - `INSTALLATION_NOT_FOUND` (404); DB failure rolls back and returns `DATABASE_ERROR` (500)
    - _Requirements: 3.1, 3.2, 3.3, 3.4_

  - [ ]* 9.2 Write endpoint unit tests
    - GET returns empty by default and stored overrides after save; PUT upserts; unknown installation → `INSTALLATION_NOT_FOUND`; visitor cannot write, member/administrator can
    - _Requirements: 3.1, 3.2, 3.4_

- [ ] 10. Backend property tests
  - [ ]* 10.1 Save/load round-trip and idempotency property test
    - **Property 5: Save/load round-trip is faithful and idempotent**
    - **Validates: Requirements 3.1, 3.2, 3.3**
    - Min 100 iterations; tag `Feature: servers-nodes-page-layout, Property 5: ...`
    - Save then load returns equal override data; saving the same data again yields the same stored state (idempotent upsert keyed by installation + node UUID)

  - [ ]* 10.2 Per-installation isolation property test
    - **Property 6: Per-installation isolation**
    - **Validates: Requirements 3.2, 3.3**
    - Min 100 iterations; tag `Feature: servers-nodes-page-layout, Property 6: ...`
    - For two distinct installations, overrides saved to one do not affect loading the other

  - [ ]* 10.3 Authorization property test
    - Members/administrators may write; visitors are rejected across arbitrary payloads
    - **Validates: Requirements 2.1, 2.3, 3.1**
    - Min 100 iterations; tag `Feature: servers-nodes-page-layout, Property 5: ...` (authorization facet of the save path)

- [x] 11. Final checkpoint - Ensure all tests pass
  - Ensure all frontend and backend tests pass, ask the user if questions arise.

## Notes

- Tasks marked with `*` are optional (tests) and can be skipped for a faster MVP; core implementation tasks are never optional.
- Each task references specific requirements for traceability.
- Property tests run a minimum of 100 iterations and are tagged `Feature: servers-nodes-page-layout, Property N: ...` referencing the design's correctness properties.
- Defaults (`SERVER_NODES`) are authoritative for row existence; the backend is purely an override store keyed by `(installation_id, node_uuid)`.
- Checkpoints ensure incremental validation of the frontend and backend halves.

## Task Dependency Graph

```json
{
  "waves": [
    { "id": 0, "tasks": ["1.1", "2.1", "4.1", "7.1", "8.1"] },
    { "id": 1, "tasks": ["1.2", "1.3", "2.2", "3.1", "7.2", "9.1"] },
    { "id": 2, "tasks": ["3.2", "3.3", "9.2", "10.1", "10.2", "10.3"] },
    { "id": 3, "tasks": ["3.4"] },
    { "id": 4, "tasks": ["5.1", "5.2", "5.3"] }
  ]
}
```
