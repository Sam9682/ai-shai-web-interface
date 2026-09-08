# Implementation Plan: Docs Auto-Seed and Documents Page

## Overview

The implementation is split into a backend seeding pipeline (Python/pytest) and a frontend Documents page (React/TS, Vitest + React Testing Library + fast-check). Work proceeds bottom-up: backend configuration and pure helpers first, then the orchestrator, then lifespan wiring; on the frontend, the service first, then the page, then the route. Property tests for the design's Correctness Properties 1-9 are attached as optional (`*`) sub-tasks placed close to the code they validate. Checkpoints follow the backend and frontend blocks.

The existing `Document` model, `StorageService`, and document router are reused unchanged. No schema migration is required, and `ALLOWED_MIME_TYPES` is not modified.

## Tasks

- [x] 1. Add docs seed directory setting
  - Add `DOCS_SEED_DIR: str = "./docs"` to the `Settings` class in `app/config.py`, in the File Storage section alongside `UPLOAD_DIR`
  - Keep it optional with the default pointing at the repository `docs/` folder (resolves to `/app/docs` in the container)
  - _Requirements: 2.1_

- [x] 2. Implement seeding pure helpers and orchestrator
  - [x] 2.1 Create the seeding module with pure helpers
    - Create `app/services/document_seed_service.py` with module docstring tagging the feature
    - Define `MIME_BY_EXTENSION`, `DEFAULT_MIME`, and ordered `CATEGORY_KEYWORDS`
    - Implement `resolve_mime_type(filename)` (extension-based, case-insensitive; default `application/octet-stream`)
    - Implement `infer_category(filename)` (deterministic precedence statutes > minutes > financial_reports > other)
    - Implement `compute_hash(content)` (sha256 hexdigest)
    - Implement `resolve_seeding_admin(db)` (prefer `admin@opcp-psmc.com` ADMINISTRATOR, else first ADMINISTRATOR by `created_at`, else `None`)
    - Implement `discover_source_files(docs_dir)` (non-recursive, files only, sorted; empty list when folder missing)
    - _Requirements: 1.2, 1.3, 2.1, 2.2, 3.1, 3.2, 3.3, 3.4, 4.1, 4.2, 4.3, 4.4_

  - [x]* 2.2 Write property test for MIME resolution
    - **Property 1: MIME resolution mapping**
    - **Validates: Requirements 3.1, 3.2, 3.3, 3.4**
    - Use Hypothesis (min 100 iterations); assert `.md`/`.txt`/`.pdf`/`.doc` map correctly and any other/absent extension yields `application/octet-stream`; result depends only on case-insensitive extension

  - [x]* 2.3 Write property test for category inference
    - **Property 2: Category inference determinism and mapping**
    - **Validates: Requirements 4.1, 4.2, 4.3, 4.4**
    - Use Hypothesis (min 100 iterations); assert determinism and the fixed precedence (statut > minute/compte > financ/report/rapport > other)

  - [x] 2.4 Implement per-file seeding and the orchestrator
    - Implement `_seed_single_file(db, admin, source)`: read bytes, skip if `size > settings.MAX_UPLOAD_SIZE` (log), resolve MIME + category, compute source hash, match existing `Document` by `original_name`
    - New match → `storage_service.save_file` + INSERT `Document` (`access_level=MEMBERS`, `uploaded_by=admin.id`, `download_count=0`)
    - Existing + unchanged (stored-file hash and size equal) → skip; existing + changed → overwrite same stored file in place (or re-create if missing) and UPDATE same row's `size`/`mime_type` (id and filename stable)
    - Write via `storage_service.save_file`; do NOT call `validate_file`; do NOT modify `ALLOWED_MIME_TYPES`
    - Implement `seed_docs_folder(docs_dir=None)`: resolve dir from `settings.DOCS_SEED_DIR`, open `SessionLocal()`, resolve admin (no-op + warning if none), discover files (no-op + log if none), per-file `try/except` with `rollback`, final `commit` (rollback on unexpected error), `close` in `finally`
    - _Requirements: 1.2, 2.2, 2.3, 3.5, 5.1, 6.1, 6.2, 6.3, 6.4, 6.5_

  - [x]* 2.5 Write property test for access level and ownership
    - **Property 3: Seeded records are always members-level and admin-owned**
    - **Validates: Requirements 1.2, 5.1**
    - Seed arbitrary valid (non-oversized) files with an admin present; assert every created record has `access_level == members` and `uploaded_by == admin.id`

  - [x]* 2.6 Write property test for discovery and oversized skipping
    - **Property 4: Non-recursive oversized-aware discovery and skipping**
    - **Validates: Requirements 2.1, 2.3**
    - Build arbitrary folder trees with `tmp_path`; assert only top-level files are considered and exactly files `<= MAX_UPLOAD_SIZE` are registered while oversized files are skipped

  - [x]* 2.7 Write property test for idempotency across runs
    - **Property 5: Idempotency across repeated runs**
    - **Validates: Requirements 6.1, 6.2, 6.3, 6.5**
    - Run `seed_docs_folder` repeatedly over unchanged content; assert at most one record and one stored file per `original_name` and no new records/ids on re-run

  - [x]* 2.8 Write property test for content-change re-sync
    - **Property 6: Content-change detection re-syncs the same record**
    - **Validates: Requirements 6.3, 6.4, 6.5**
    - Assert unchanged content leaves record and stored bytes untouched; changed content keeps the same id and replaces stored bytes with the new content (updated size/mime)

  - [x]* 2.9 Write unit and example tests for the orchestrator
    - Unit-test `compute_hash` determinism and `resolve_seeding_admin` selection order
    - Missing-folder no-op; no-admin no-op + warning log; oversized-skip boundary at `MAX_UPLOAD_SIZE`
    - `.md` file seeds successfully despite `text/markdown` not being in `ALLOWED_MIME_TYPES`
    - Use `tmp_path` and existing `db_session`/`test_user` fixtures; patch `settings.UPLOAD_DIR` and `settings.DOCS_SEED_DIR`
    - _Requirements: 1.3, 2.2, 2.3, 3.5_

- [x] 3. Wire seeding into the application lifespan
  - Import `seed_docs_folder` in `app/main.py` and call it inside the lifespan immediately after `create_default_admin()` and before `task_scheduler.start()`
  - _Requirements: 1.1_

- [x]* 4. Write access-control integration tests for seeded documents
  - A `members`-level seeded document is visible to a Registered_User via `GET /api/documents`
  - An Anonymous_User is denied download of a seeded document (403)
  - Use existing `db_session`/`test_user` fixtures; patch `settings.UPLOAD_DIR` and `settings.DOCS_SEED_DIR`
  - _Requirements: 5.2, 5.3_

- [x] 5. Checkpoint - backend seeding
  - Ensure all tests pass, ask the user if questions arise.

- [x] 6. Implement the frontend document service
  - Create `frontend/src/services/documentService.ts` using the shared `api` axios instance
  - Export types `Document`, `DocumentCategory`, `AccessLevel`, and `DocumentListResponse`
  - Implement `listDocuments()` → `GET /documents` returning `{ documents, total }`
  - Implement `downloadDocument(id, originalName)` → `GET /documents/{id}/download` as a blob, then `createObjectURL` + anchor click + revoke
  - _Requirements: 7.3, 10.1_

- [x] 7. Implement the Documents page
  - [x] 7.1 Create the Documents page component
    - Create `frontend/src/pages/DocumentsPage.tsx` with named export `DocumentsPage`
    - Fetch documents on mount; handle loading, list-load error, empty, and per-download error states (French messages)
    - Group by category into fixed order with French labels (`Statuts`, `Comptes rendus`, `Rapports financiers`, `Autre`); render only non-empty sections
    - Case-insensitive `original_name` search filter; empty query shows all
    - Per item: name + `formatSize(size)` + `Télécharger` button calling `documentService.downloadDocument`
    - Export `formatSize` helper; apply French UI and `#000E9C` Tailwind theme consistent with existing pages
    - _Requirements: 7.1, 8.1, 8.2, 8.3, 8.4, 9.1, 9.2, 10.1, 10.3_

  - [x]* 7.2 Write property test for category grouping partition
    - **Property 7: Grouping is a partition by category**
    - **Validates: Requirements 8.1**
    - fast-check (min 100 iterations); assert each displayed document appears in exactly its category section, sections are disjoint, and their union equals the displayed set

  - [x]* 7.3 Write property test for displayed item content
    - **Property 8: Displayed item content**
    - **Validates: Requirements 8.2, 8.3**
    - fast-check (min 100 iterations); assert every rendered item shows the name, a formatted size, and a download control

  - [x]* 7.4 Write property test for search filter
    - **Property 9: Search filter subset and membership**
    - **Validates: Requirements 9.1, 9.2**
    - fast-check (min 100 iterations); assert the displayed set equals the case-insensitive substring filter of `original_name`, is a subset of the full list, and equals the full list when the query is empty

  - [x]* 7.5 Write unit and example tests for the page and service
    - `formatSize` returns a defined, non-empty string with a unit for arbitrary non-negative byte counts (property, fast-check min 100 iterations)
    - Mount calls `documentService.listDocuments`; clicking download calls `documentService.downloadDocument(id, name)` (mock service)
    - List-load rejection shows a French error message; download rejection shows a French per-download error message
    - _Requirements: 7.3, 10.1, 10.3_

- [x] 8. Register the Documents route
  - Import `DocumentsPage` in `frontend/src/App.tsx` and add a nested `/documents` route wrapped in `ProtectedRoute` inside the `Layout` `Routes`
  - Verify `Layout.tsx` already links `/documents` (no nav change required)
  - _Requirements: 7.1, 7.2_

- [x]* 9. Write auth-gated route test
  - Authenticated render shows the Documents page at `/documents`; unauthenticated navigation redirects to `/login` via `ProtectedRoute`
  - _Requirements: 7.1, 7.2_

- [x] 10. Checkpoint - frontend Documents page
  - Ensure all tests pass, ask the user if questions arise.

## Notes

- Tasks marked with `*` are optional (tests) and can be skipped for a faster MVP.
- Each implementation task references specific requirements for traceability.
- Property tests validate Correctness Properties 1-9 from the design and run a minimum of 100 iterations (Hypothesis on the backend, fast-check on the frontend).
- Same-file edits are separated across waves: `config.py` (task 1) precedes the seed service; on the frontend `documentService.ts` → `DocumentsPage.tsx` → the `App.tsx` route are ordered.

## Task Dependency Graph

```json
{
  "waves": [
    { "id": 0, "tasks": ["1", "2.1", "6"] },
    { "id": 1, "tasks": ["2.2", "2.3", "2.4", "7.1"] },
    { "id": 2, "tasks": ["2.5", "2.6", "2.7", "2.8", "2.9", "3", "7.2", "7.3", "7.4", "7.5", "8"] },
    { "id": 3, "tasks": ["4", "9"] }
  ]
}
```
