# Design Document

## Overview

This feature replaces the fixed four-value document category enum (`STATUTES`, `MINUTES`, `FINANCIAL_REPORTS`, `OTHER`) with a three-value set (`documents`, `scripts`, `links`) and adds an administrator-only upload capability to the Documents interface. The category of an uploaded item is derived automatically from the file extension via a fixed `Category_Mapping`, not chosen by the uploader. Existing rows are remapped to `documents` by an Alembic migration. The upload storage path, download flow, and role-based `GET /api/documents` filtering are all preserved.

The change spans four layers:

- **Model** (`app/models/document.py`) — redefine the `DocumentCategory` enum and add the extension→category mapping plus a classification helper.
- **API** (`app/documents/router.py`, `app/documents/schemas.py`) — drop the client-supplied `category` form field on upload, classify by extension, keep `get_administrator` authorization.
- **Storage** (`app/services/storage_service.py`) — extend the accepted file types to cover `.md`, `.txt`, `.sh`, `.sql`, `.py`; validate by extension (with MIME as a secondary signal) since these types have unreliable browser MIME values.
- **Migration** (`migrations/versions/`) — convert the stored enum values and remap all existing rows to `documents`.
- **Frontend** (`DocumentsPage.tsx`, `documentService.ts`, `translations.ts`) — admin-only upload control, `uploadDocument` service method, updated `CATEGORY_ORDER` / `CATEGORY_LABEL_KEYS`, new i18n keys, post-upload list refresh.

## Architecture

```
Admin_User
   │  selects file
   ▼
DocumentsPage.tsx ── isAdmin() ──▶ render Upload_Control (admin only)
   │  FormData(file, access_level)
   ▼
documentService.uploadDocument()  ──POST /api/documents/upload──▶
   │                                                              │
   │                                             get_administrator (403 if not admin)
   │                                                              ▼
   │                                     classify_extension(filename) ─▶ DocumentCategory
   │                                                              │  (400 if extension unknown)
   │                                                              ▼
   │                                     storage_service.validate_file() ─▶ ok / 400
   │                                                              ▼
   │                                     storage_service.save_file()  (single UPLOAD_DIR)
   │                                                              ▼
   │                                     Document row (category = classified)
   ▼
documentService.listDocuments()  ──GET /api/documents──▶ role-based filter ─▶ Grouped_List refresh
```

The upload endpoint stops accepting a `category` form field. The server is now the sole authority on category, computed from the extension. All categories, including `links`, use the same `UPLOAD_DIR` storage path, so `save_file` is unchanged.

### Enum storage detail (grounding for the migration)

The `category` column is declared as `SQLEnum(DocumentCategory, name="document_category", native_enum=False)`. With `native_enum=False`, SQLAlchemy stores the value in a `VARCHAR` and, by default, persists the enum **member name** (e.g. `"STATUTES"`) rather than its `.value`. The migration must therefore remap the stored strings regardless of the exact casing present; to be safe it remaps every currently possible stored form (`STATUTES`, `MINUTES`, `FINANCIAL_REPORTS`, `OTHER` and their lowercase `.value` equivalents) to the new `documents` member name. After migration the model's enum only knows `DOCUMENTS`, `SCRIPTS`, `LINKS`, so every remapped row round-trips as `documents`.

## Components and Interfaces

### 1. Model: `DocumentCategory` and `Category_Mapping`

`app/models/document.py` — replace the enum and add the mapping + classifier.

```python
class DocumentCategory(str, enum.Enum):
    """Document category enumeration (extension-derived)."""
    DOCUMENTS = "documents"
    SCRIPTS = "scripts"
    LINKS = "links"


# Category_Mapping: file extension (lowercase, no dot) -> DocumentCategory
CATEGORY_MAPPING: dict[str, DocumentCategory] = {
    "pdf": DocumentCategory.DOCUMENTS,
    "doc": DocumentCategory.DOCUMENTS,
    "docx": DocumentCategory.DOCUMENTS,
    "md": DocumentCategory.DOCUMENTS,
    "txt": DocumentCategory.DOCUMENTS,
    "sh": DocumentCategory.SCRIPTS,
    "sql": DocumentCategory.SCRIPTS,
    "py": DocumentCategory.SCRIPTS,
    "links": DocumentCategory.LINKS,
}


def classify_extension(filename: str) -> DocumentCategory | None:
    """Return the category for a filename's extension, or None if unmapped.

    The extension is taken from the last suffix, lowercased, dot stripped.
    Returns None when the extension is absent or not in CATEGORY_MAPPING so
    the caller can reject the upload.
    """
    ext = Path(filename).suffix.lower().lstrip(".")
    return CATEGORY_MAPPING.get(ext) if ext else None
```

Notes:
- `AccessLevel` is unchanged.
- The `idx_documents_category` index and `category` column type are unchanged structurally; only the set of legal values changes (enforced at the application layer via the enum).
- `links` is treated as a file extension in the mapping per Requirement 2.3 — an item uploaded with a `.links` extension is stored like any other file and classified `links`.

### 2. Storage: accepted file types

`app/services/storage_service.py` — the current `validate_file` checks only MIME type against `ALLOWED_MIME_TYPES`. Browsers report inconsistent or empty MIME types for `.md`, `.sh`, `.sql`, `.py` (often `application/octet-stream` or `text/plain`), so validation moves to an **extension allow-list** as the primary check, keeping size validation intact.

```python
ALLOWED_EXTENSIONS = {
    "pdf", "doc", "docx", "md", "txt",   # documents
    "sh", "sql", "py",                    # scripts
    "links",                              # links
}

def validate_file(self, file_size: int, filename: str) -> Tuple[bool, Optional[str]]:
    if file_size > self.max_size:
        max_mb = self.max_size / (1024 * 1024)
        return False, f"File size exceeds maximum allowed size of {max_mb}MB"
    ext = Path(filename).suffix.lower().lstrip(".")
    if ext not in ALLOWED_EXTENSIONS:
        return False, f"File type .{ext} is not supported"
    return True, None
```

- `save_file` is unchanged: it generates a UUID filename preserving the original suffix and writes into the single `UPLOAD_DIR`. This keeps the storage path identical across all three categories (Requirement 2.3, 4.2).
- The allowed-extension set is intentionally the same key set as `CATEGORY_MAPPING`, so any file that classifies to a category is also accepted by storage, and vice versa. This keeps the two checks consistent.

### 3. API: extension-based auto-assignment

`app/documents/router.py` — `upload_document`:

- Remove the `category: Annotated[DocumentCategory, Form(...)]` parameter. The endpoint no longer accepts a client-supplied category.
- Keep `access_level: Annotated[AccessLevel, Form(...)]` and the `current_user: User = Depends(get_administrator)` dependency (Requirement 3.4, 3.5).
- After reading the file, classify by extension. If `classify_extension` returns `None`, return `400` with an `INVALID_FILE_TYPE` error and do not persist anything (Requirement 2.4).
- Call `storage_service.validate_file(file_size, file.filename)` (now extension-based). On failure return `400` (Requirement 4.3).
- Persist the `Document` with `category` set to the classified value.

```python
async def upload_document(
    file: Annotated[UploadFile, File(...)],
    access_level: Annotated[AccessLevel, Form(...)],
    current_user: User = Depends(get_administrator),
    db: Session = Depends(get_db),
) -> DocumentUploadResponse:
    file_content = await file.read()
    file_size = len(file_content)

    category = classify_extension(file.filename or "")
    if category is None:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=ErrorResponse.create(
                code="INVALID_FILE_TYPE",
                message="File extension is not a supported category",
                details={"filename": file.filename},
            ),
        )

    is_valid, error_message = storage_service.validate_file(file_size, file.filename or "")
    if not is_valid:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=ErrorResponse.create(
            code="INVALID_FILE", message=error_message,
            details={"filename": file.filename, "size": file_size}))

    unique_filename, file_path = storage_service.save_file(file_content, file.filename)
    document = Document(
        filename=unique_filename,
        original_name=file.filename,
        mime_type=file.content_type or "application/octet-stream",
        size=file_size,
        category=category,          # server-assigned, not client-supplied
        access_level=access_level,
        uploaded_by=current_user.id,
        download_count=0,
    )
    db.add(document); db.commit(); db.refresh(document)
    return DocumentUploadResponse(success=True, message="Document uploaded successfully",
                                  document=DocumentResponse.model_validate(document))
```

- `GET /api/documents` (`list_documents`) is unchanged — the existing role-based filtering (anonymous → public only; member/visitor → public + members; administrator → all) stays exactly as-is (Requirement 5.3). The optional `category` query filter now accepts the new enum values automatically.
- `download_document` and `delete_document` are unchanged.

`app/documents/schemas.py`:
- `DocumentResponse.category` remains typed as `DocumentCategory` and now serializes the new values.
- `DocumentUploadRequest.category` field is removed (the request no longer carries a category). `DocumentUploadResponse` is unchanged.

### 4. Migration: `Category_Migration`

New file `migrations/versions/20260928_0000_remap_document_categories_remap_document_categories.py`.

- `revision = 'remap_document_categories'`
- `down_revision = 'add_openstack_credential_config'` (current head; confirmed no other migration references it as a parent).

Because the column is a non-native enum (`VARCHAR`), the conversion is a data update, not a DDL type change. `upgrade()` remaps every existing row to the new `documents` member name and leaves the column type as-is (application-level enum enforces the new set).

```python
revision = 'remap_document_categories'
down_revision = 'add_openstack_credential_config'

OLD_VALUES = (
    'STATUTES', 'MINUTES', 'FINANCIAL_REPORTS', 'OTHER',   # member-name form
    'statutes', 'minutes', 'financial_reports', 'other',   # value form (defensive)
)

def upgrade() -> None:
    conn = op.get_bind()
    # Requirement 6.2 / 6.3: every existing row becomes `documents`.
    conn.execute(
        sa.text("UPDATE documents SET category = :new").bindparams(new='DOCUMENTS')
    )

def downgrade() -> None:
    # Best-effort reversal: prior category information is lost by the remap,
    # so restore all rows to the previous default `OTHER`.
    conn = op.get_bind()
    conn.execute(sa.text("UPDATE documents SET category = :old").bindparams(old='OTHER'))
```

Design decisions:
- The stored form written by the model for the new enum is the member name `DOCUMENTS`. The migration writes exactly that so freshly migrated rows deserialize as `DocumentCategory.DOCUMENTS` (Requirement 6.1, 6.3).
- A blanket `UPDATE ... SET category = 'DOCUMENTS'` remaps all four legacy categories in one statement (Requirement 6.2). `OLD_VALUES` is documented for clarity; the unconditional update covers every row regardless of casing.
- `downgrade` cannot recover the original per-row categories (information is destroyed by design), so it resets to the previous `OTHER` default and is documented as lossy.

### 5. Frontend: `documentService.ts`

- Update the exported type: `export type DocumentCategory = 'documents' | 'scripts' | 'links';`
- Add `uploadDocument`:

```typescript
async uploadDocument(file: File, accessLevel: AccessLevel = 'public'): Promise<Document> {
  const form = new FormData();
  form.append('file', file);
  form.append('access_level', accessLevel);
  const response = await api.post<{ document: Document }>('/documents/upload', form);
  return response.data.document;
}
```

The `access_level` field is still required by the backend form; the upload control defaults it (see below). Category is intentionally **not** sent — the server derives it (Requirement 2, 3.3).

### 6. Frontend: `DocumentsPage.tsx`

- Update the category constants:

```typescript
const CATEGORY_LABEL_KEYS: Record<DocumentCategory, string> = {
  documents: 'page.documents.category.documents',
  scripts: 'page.documents.category.scripts',
  links: 'page.documents.category.links',
};
const CATEGORY_ORDER: DocumentCategory[] = ['documents', 'scripts', 'links'];
```

- Update the `grouped` initializer to `{ documents: [], scripts: [], links: [] }`.
- Add admin detection with `authService.isAdmin()` and render the `Upload_Control` only when true (Requirement 3.1, 3.2). The control is a file input plus a submit action.
- On submit, call `documentService.uploadDocument(file)`, then re-fetch the list so the new item appears under its assigned category (Requirement 5.1). Reuse a small `loadDocuments()` helper extracted from the existing effect so upload success can trigger a refresh.
- Surface upload errors (unknown extension / rejected type / 403) in an error banner mirroring the existing `downloadError` pattern.

```typescript
const isAdmin = authService.isAdmin();

const handleUpload = async (file: File) => {
  try {
    setUploadError(null);
    await documentService.uploadDocument(file);
    await loadDocuments();            // Requirement 5.1: refresh so item appears
  } catch {
    setUploadError(t('page.documents.error.upload'));
  }
};
```

Existing search, grouping, download, `formatSize`, loading, and error behavior are preserved.

### 7. i18n keys (`translations.ts`)

Replace the four old category keys with three, in both the French and English tables, and add upload-related keys.

French:
```
'page.documents.category.documents': 'Documents',
'page.documents.category.scripts': 'Scripts',
'page.documents.category.links': 'Liens',
'page.documents.upload.label': 'Téléverser un document',
'page.documents.upload.button': 'Téléverser',
'page.documents.error.upload': "Échec du téléversement du document.",
```

English:
```
'page.documents.category.documents': 'Documents',
'page.documents.category.scripts': 'Scripts',
'page.documents.category.links': 'Links',
'page.documents.upload.label': 'Upload a document',
'page.documents.upload.button': 'Upload',
'page.documents.error.upload': 'Failed to upload the document.',
```

The old `statutes` / `minutes` / `financialReports` / `other` keys are removed from both tables (Requirement 1.3).

## Data Models

`Document` table is structurally unchanged. Only the `category` column's legal value set changes:

| Column | Type | Change |
| --- | --- | --- |
| `category` | `SQLEnum(DocumentCategory, native_enum=False)` → VARCHAR | Legal values now `documents` / `scripts` / `links`; existing rows remapped to `documents` |

Frontend `Document` interface is unchanged except the `category` field's union type.

## Error Handling

| Condition | Layer | Response |
| --- | --- | --- |
| Extension not in `CATEGORY_MAPPING` | API | `400 INVALID_FILE_TYPE`, no row created (Req 2.4) |
| Extension not in allowed set / size exceeded | Storage → API | `400 INVALID_FILE` (Req 4.3) |
| Non-admin calls `POST /upload` | `get_administrator` | `403 ADMIN_ACCESS_REQUIRED`, no row created (Req 3.5) |
| DB failure after file write | API | Uploaded file cleaned up via `storage_service.delete_file`, `500 DATABASE_ERROR` (existing behavior retained) |
| Frontend upload failure | UI | Error banner via `page.documents.error.upload` |
| Migration downgrade | Alembic | Lossy reset to `OTHER`, documented |

## Testing Strategy

**Dual approach.** Property-based tests cover the pure classification/validation/filtering logic and the migration remap; example and integration tests cover UI conditional rendering, service wiring, and auth enforcement.

- **Property tests** (Python, Hypothesis; min 100 iterations each): extension classification, type acceptance, unknown-extension rejection, storage-path invariance, role-based list filtering, migration remap, i18n label coverage.
- **Example/unit tests** (Vitest for frontend): `CATEGORY_ORDER` ordering, admin-only render of the upload control, `uploadDocument` posts multipart to the right URL, post-upload refresh shows the item under its category, download wiring.
- **Integration test** (FastAPI TestClient): admin vs non-admin authorization on `POST /upload`; migration smoke (a row with a new category value round-trips).

Each property test is tagged `Feature: admin-document-upload-categories, Property {n}: {text}` and references its design property below.

## Correctness Properties

*A property is a characteristic or behavior that should hold true across all valid executions of a system — a formal statement about what the system should do. Properties serve as the bridge between human-readable specifications and machine-verifiable correctness guarantees.*

### Property 1: Extension classification matches the mapping

*For any* filename whose lowercased extension is a key in `Category_Mapping`, `classify_extension` returns the mapped `DocumentCategory`, and that value is always one of `documents`, `scripts`, or `links`. Specifically, extensions `pdf`, `doc`, `docx`, `md`, `txt` map to `documents`; `sh`, `sql`, `py` map to `scripts`; `links` maps to `links`. Classification is case-insensitive.

**Validates: Requirements 1.1, 2.1, 2.2**

### Property 2: Allowed types are accepted

*For any* file whose extension is in the allowed set and whose size is within the maximum limit, `Storage_Service.validate_file` returns valid (in particular for `md`, `txt`, `sh`, `sql`, `py`).

**Validates: Requirements 4.1**

### Property 3: Unknown extensions are rejected

*For any* filename whose extension is not present in `Category_Mapping` (including files with no extension), the upload is rejected with an error response and no document row is created.

**Validates: Requirements 2.4, 4.3**

### Property 4: Storage path is category-independent

*For any* accepted upload, regardless of its assigned category (`documents`, `scripts`, or `links`), the persisted file resides under the single configured `UPLOAD_DIR` storage path.

**Validates: Requirements 2.3, 4.2**

### Property 5: Upload is administrator-only

*For any* authenticated user whose role is not administrator, a request to `POST /api/documents/upload` is rejected with an authorization error and creates no document row.

**Validates: Requirements 3.4, 3.5**

### Property 6: Role-based listing filter

*For any* collection of stored documents and *any* requesting principal (anonymous, visitor, member, or administrator), `GET /api/documents` returns exactly the documents whose `access_level` is permitted for that principal: anonymous → `public` only; visitor/member → `public` and `members`; administrator → all.

**Validates: Requirements 5.3**

### Property 7: Migration remaps all rows to `documents`

*For any* set of pre-migration document rows with arbitrary legacy categories (`statutes`, `minutes`, `financial_reports`, `other`), after the migration runs every row's category equals `documents`, and the API returns each such document with category `documents`.

**Validates: Requirements 6.1, 6.2, 6.3**

### Property 8: Category labels resolve in both locales

*For any* category in `CATEGORY_ORDER`, `CATEGORY_LABEL_KEYS[category]` resolves to a non-empty display string in both the French and English translation tables.

**Validates: Requirements 1.2, 1.3**
