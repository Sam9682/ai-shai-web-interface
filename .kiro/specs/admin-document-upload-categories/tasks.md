# Implementation Plan: Admin Document Upload & Categories

## Overview

Implement the extension-derived three-category document system and admin-only upload capability incrementally, backend-first. Start with the pure model logic (enum, mapping, classifier) that everything else depends on, extend storage validation, wire the upload router and schemas, add the Alembic remap migration, then build the frontend service method, upload control, category constants, and i18n keys. Each step builds on the previous one and ends wired into the existing documents flow, with property and unit tests placed close to the code they validate.

## Tasks

- [x] 1. Redefine `DocumentCategory` enum, add `CATEGORY_MAPPING` and `classify_extension`
  - In `app/models/document.py`, replace the four-value enum with `DOCUMENTS`, `SCRIPTS`, `LINKS`
  - Add the `CATEGORY_MAPPING` dict (extension → category) and the `classify_extension(filename)` helper returning `DocumentCategory | None`, using `Path(filename).suffix.lower().lstrip(".")`
  - Keep `AccessLevel`, the `category` column type (`SQLEnum(..., native_enum=False)`), and `idx_documents_category` unchanged
  - _Requirements: 1.1, 2.1, 2.2, 2.3_

  - [x]* 1.1 Write property test for extension classification
    - **Property 1: Extension classification matches the mapping**
    - Assert `pdf/doc/docx/md/txt → documents`, `sh/sql/py → scripts`, `links → links`, case-insensitive; returned value always in the three-value set
    - **Validates: Requirements 1.1, 2.1, 2.2**

  - [x]* 1.2 Write property test for unknown-extension classification
    - **Property 3: Unknown extensions are rejected** (classifier portion)
    - Assert `classify_extension` returns `None` for any extension not in `CATEGORY_MAPPING` and for filenames with no extension
    - **Validates: Requirements 2.4**

- [x] 2. Extend storage validation to the new file types
  - In `app/services/storage_service.py`, add `ALLOWED_EXTENSIONS` (same key set as `CATEGORY_MAPPING`) and rewrite `validate_file(file_size, filename)` to check size then extension allow-list
  - Leave `save_file` unchanged so all categories persist under the single `UPLOAD_DIR`
  - _Requirements: 4.1, 4.2, 4.3_

  - [x]* 2.1 Write property test for accepted types
    - **Property 2: Allowed types are accepted**
    - For any allowed extension within the size limit, `validate_file` returns valid (include `md`, `txt`, `sh`, `sql`, `py`)
    - **Validates: Requirements 4.1**

  - [x]* 2.2 Write property test for storage-path invariance
    - **Property 4: Storage path is category-independent**
    - For any accepted upload of any category, the saved file path resides under the configured `UPLOAD_DIR`
    - **Validates: Requirements 2.3, 4.2**

- [x] 3. Update upload router and schemas for server-side classification
  - In `app/documents/router.py` `upload_document`, remove the `category` form field, classify via `classify_extension`, return `400 INVALID_FILE_TYPE` when `None` (no row created), call the extension-based `validate_file` (`400 INVALID_FILE` on failure), and persist the `Document` with the server-assigned category
  - Keep `access_level` form field and the `get_administrator` dependency; leave `list_documents`, `download_document`, `delete_document` unchanged
  - In `app/documents/schemas.py`, remove `DocumentUploadRequest.category`; keep `DocumentResponse.category` typed as `DocumentCategory`
  - _Requirements: 2.4, 3.3, 3.4, 3.5, 4.3, 5.3_

  - [x]* 3.1 Write property test for unknown-extension upload rejection
    - **Property 3: Unknown extensions are rejected** (endpoint portion)
    - Assert an upload with an unmapped extension yields an error response and creates no document row
    - **Validates: Requirements 2.4, 4.3**

  - [x]* 3.2 Write integration test for admin-only upload authorization
    - **Property 5: Upload is administrator-only**
    - Using FastAPI TestClient, assert a non-admin `POST /api/documents/upload` returns an authorization error and creates no row; an admin upload succeeds
    - **Validates: Requirements 3.4, 3.5**

  - [x]* 3.3 Write property test for role-based listing filter
    - **Property 6: Role-based listing filter**
    - For arbitrary stored documents and each principal (anonymous/visitor/member/administrator), `GET /api/documents` returns exactly the permitted `access_level` set
    - **Validates: Requirements 5.3**

- [x] 4. Checkpoint - backend classification, storage, and API
  - Ensure all tests pass, ask the user if questions arise.

- [x] 5. Add the Alembic category remap migration
  - Create `migrations/versions/20260928_0000_remap_document_categories_remap_document_categories.py` with `revision = 'remap_document_categories'` and `down_revision = 'add_openstack_credential_config'`
  - `upgrade()` runs `UPDATE documents SET category = 'DOCUMENTS'` for all rows; `downgrade()` resets to `'OTHER'` (documented lossy)
  - _Requirements: 6.1, 6.2, 6.3_

  - [x]* 5.1 Write property test for migration remap
    - **Property 7: Migration remaps all rows to `documents`**
    - For arbitrary pre-migration rows with legacy categories, after `upgrade()` every row's category is `documents` and the API returns them as `documents`
    - **Validates: Requirements 6.1, 6.2, 6.3**

- [x] 6. Add `uploadDocument` and update category type in `documentService.ts`
  - Change the exported type to `export type DocumentCategory = 'documents' | 'scripts' | 'links';`
  - Add `uploadDocument(file, accessLevel = 'public')` that posts `FormData` with `file` and `access_level` (no category) to `/documents/upload` and returns the created `Document`
  - _Requirements: 2, 3.3_

  - [x]* 6.1 Write unit test for `uploadDocument` wiring
    - Assert it posts multipart form data to `/documents/upload`, includes `file` and `access_level`, omits `category`, and returns the document
    - _Requirements: 3.3_

- [x] 7. Update category constants and add admin-only upload control in `DocumentsPage.tsx`
  - Update `CATEGORY_LABEL_KEYS` and `CATEGORY_ORDER` to `documents`/`scripts`/`links`; set the `grouped` initializer to `{ documents: [], scripts: [], links: [] }`
  - Extract a `loadDocuments()` helper from the existing effect; add `authService.isAdmin()` gating so the upload control (file input + submit) renders only for admins
  - Implement `handleUpload` calling `documentService.uploadDocument(file)` then `loadDocuments()`; surface failures via a `setUploadError` banner mirroring the `downloadError` pattern
  - Preserve existing search, grouping, download, `formatSize`, loading, and error behavior
  - _Requirements: 1.2, 3.1, 3.2, 5.1, 5.2_

  - [x]* 7.1 Write unit test for category ordering
    - Assert `CATEGORY_ORDER` is `['documents', 'scripts', 'links']` and drives grouped rendering order
    - _Requirements: 1.2_

  - [x]* 7.2 Write unit test for admin-only upload control rendering
    - Assert the upload control renders when `isAdmin()` is true and is hidden when false
    - _Requirements: 3.1, 3.2_

  - [x]* 7.3 Write unit test for post-upload refresh and download wiring
    - Assert a successful upload triggers `loadDocuments()` and the new item appears under its assigned category; assert selecting an item requests `GET /api/documents/{id}/download`
    - _Requirements: 5.1, 5.2_

- [x] 8. Add and replace i18n keys in `translations.ts`
  - In both French and English tables, remove `statutes`/`minutes`/`financialReports`/`other` category keys and add `page.documents.category.documents|scripts|links`, `page.documents.upload.label`, `page.documents.upload.button`, `page.documents.error.upload`
  - _Requirements: 1.2, 1.3_

  - [x]* 8.1 Write property test for category label coverage
    - **Property 8: Category labels resolve in both locales**
    - For each category in `CATEGORY_ORDER`, `CATEGORY_LABEL_KEYS[category]` resolves to a non-empty string in both French and English tables
    - **Validates: Requirements 1.2, 1.3**

- [x] 9. Final checkpoint - Ensure all tests pass
  - Ensure all tests pass, ask the user if questions arise.

## Notes

- Tasks marked with `*` are optional and can be skipped for faster MVP.
- Each task references specific requirements for traceability.
- Property tests use Hypothesis (Python, min 100 iterations) and Vitest (frontend); integration tests use FastAPI TestClient.
- Each property test should be tagged `Feature: admin-document-upload-categories, Property {n}: {text}`.
- Checkpoints ensure incremental validation before moving to the next layer.

## Task Dependency Graph

```json
{
  "waves": [
    { "id": 0, "tasks": ["1", "6", "8"] },
    { "id": 1, "tasks": ["1.1", "1.2", "2", "6.1", "7", "8.1"] },
    { "id": 2, "tasks": ["2.1", "2.2", "3", "7.1", "7.2", "7.3"] },
    { "id": 3, "tasks": ["3.1", "3.2", "3.3", "5"] },
    { "id": 4, "tasks": ["5.1"] }
  ]
}
```
