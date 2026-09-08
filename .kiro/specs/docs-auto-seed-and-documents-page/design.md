# Design Document

## Overview

This feature adds two capabilities to the existing OPCP application:

1. **Backend startup seeding** — a new `Seeding_Process` that, during the FastAPI lifespan (immediately after `create_default_admin()`), discovers every file directly inside the repository `docs/` folder, classifies each into a `DocumentCategory`, resolves its MIME type from the extension, and registers it as a `members`-level `Document` record owned by the resolved `Seeding_Admin`. Seeding is idempotent across restarts and re-synchronizes files whose content changed, without creating duplicate rows or stored files.

2. **Frontend Documents page** — a new `/documents` route (gated by the existing `ProtectedRoute`) with a `documentService` that talks to the existing document API. The page lists documents grouped by category with French labels, supports a case-insensitive name search filter, shows human-readable sizes, and triggers browser downloads via the existing `GET /api/documents/{id}/download` endpoint.

The design reuses the existing `Document` model, `StorageService`, and document router unchanged. No schema migration is required, and the upload endpoint's MIME validation is left intact.

## Architecture

### Backend flow

```
FastAPI lifespan (app/main.py)
  └─ create_default_admin()          # existing, unchanged
  └─ seed_docs_folder()              # NEW — added right after admin creation
        ├─ resolve Seeding_Admin (admin@opcp-psmc.com | first ADMINISTRATOR)
        │     └─ none  → log warning, return (no-op)
        ├─ resolve Docs_Folder (settings.DOCS_SEED_DIR, default ./docs)
        │     └─ missing → log info, return (no-op)
        ├─ for each top-level file (non-recursive):
        │     ├─ size > MAX_UPLOAD_SIZE → log + skip
        │     ├─ resolve MIME from extension
        │     ├─ infer DocumentCategory from filename
        │     ├─ compute Content_Hash (sha256) of source bytes
        │     ├─ match existing Document by original_name
        │     │     ├─ none      → save_file + INSERT Document (access=members)
        │     │     ├─ unchanged → skip (hash of stored file == source hash)
        │     │     └─ changed   → overwrite stored file + UPDATE same row
        │     └─ try/except per file (log, continue on error)
        └─ commit (rollback on failure)
  └─ task_scheduler.start()          # existing, unchanged
```

The seeding runs synchronously inside the async lifespan using a blocking `SessionLocal()` session (the same pattern `create_default_admin()` already uses). Volume of `docs/` files is small (tens of files), so blocking startup briefly is acceptable and matches the existing admin-creation approach.

### Frontend flow

```
App.tsx Routes (inside Layout, nested Routes)
  └─ /documents  → <ProtectedRoute><DocumentsPage/></ProtectedRoute>   # NEW route

DocumentsPage (mount)
  └─ documentService.listDocuments()  → GET /api/documents  → {documents,total}
  └─ group by category → French sections
  └─ search input → case-insensitive name filter
  └─ per item → size + download button → documentService.downloadDocument(id, name)
                                              └─ GET /api/documents/{id}/download (blob)
                                              └─ createObjectURL + anchor click
```

`Layout.tsx` already renders a `/documents` nav link (desktop and mobile) — no navigation change is needed. This is verified against the current `Layout.tsx`.

## Components and Interfaces

### Backend

#### 1. Configuration addition — `app/config.py`

Add one optional setting so the docs folder location is robust and testable, defaulting to the container layout (`WORKDIR /app`, `COPY . .` ⇒ docs at `/app/docs`):

```python
# File Storage
DOCS_SEED_DIR: str = "./docs"  # repository docs/ folder, baked into the image
```

Resolving relative to the process CWD (`/app` in the container) yields `/app/docs`. Tests override this by pointing `settings.DOCS_SEED_DIR` (or passing an explicit path argument) at a `tmp_path`.

#### 2. New module — `app/services/document_seed_service.py`

Pure, unit-testable helpers plus one orchestrating function. Helpers take explicit inputs (no DB, no I/O) so they can be property-tested directly.

```python
"""Startup seeding of repository docs/ files into the Document system.
Feature: docs-auto-seed-and-documents-page
Validates Requirements 1-6.
"""
import hashlib
import logging
from pathlib import Path
from typing import Optional

from sqlalchemy.orm import Session

from app.config import settings
from app.database import SessionLocal
from app.models.user import User, UserRole
from app.models.document import Document, DocumentCategory, AccessLevel
from app.services.storage_service import storage_service

logger = logging.getLogger(__name__)

# Extension -> MIME mapping (Requirement 3.1-3.4)
MIME_BY_EXTENSION: dict[str, str] = {
    ".md": "text/markdown",
    ".txt": "text/plain",
    ".pdf": "application/pdf",
    ".doc": "application/msword",
}
DEFAULT_MIME = "application/octet-stream"

# Ordered category keyword rules (Requirement 4). First match wins => deterministic.
# Keywords are matched case-insensitively as substrings of the filename.
CATEGORY_KEYWORDS: list[tuple[DocumentCategory, tuple[str, ...]]] = [
    (DocumentCategory.STATUTES, ("statut",)),
    (DocumentCategory.MINUTES, ("minute", "compte")),
    (DocumentCategory.FINANCIAL_REPORTS, ("financ", "report", "rapport")),
]


def resolve_mime_type(filename: str) -> str:
    """Resolve MIME type from the file extension (Requirement 3.1-3.4)."""
    ext = Path(filename).suffix.lower()
    return MIME_BY_EXTENSION.get(ext, DEFAULT_MIME)


def infer_category(filename: str) -> DocumentCategory:
    """Infer DocumentCategory from filename keywords (Requirement 4.1-4.4).

    Deterministic precedence: statutes > minutes > financial_reports > other.
    """
    lowered = filename.lower()
    for category, keywords in CATEGORY_KEYWORDS:
        if any(keyword in lowered for keyword in keywords):
            return category
    return DocumentCategory.OTHER


def compute_hash(content: bytes) -> str:
    """Deterministic sha256 over byte content (Content_Hash)."""
    return hashlib.sha256(content).hexdigest()


def resolve_seeding_admin(db: Session) -> Optional[User]:
    """Resolve the Seeding_Admin (Requirement 1.2, 1.3).

    Prefer admin@opcp-psmc.com; otherwise the first ADMINISTRATOR user.
    Returns None if no administrator exists.
    """
    admin = db.query(User).filter(User.email == "admin@opcp-psmc.com").first()
    if admin and admin.role == UserRole.ADMINISTRATOR:
        return admin
    return (
        db.query(User)
        .filter(User.role == UserRole.ADMINISTRATOR)
        .order_by(User.created_at.asc())
        .first()
    )


def discover_source_files(docs_dir: Path) -> list[Path]:
    """Enumerate top-level files only, non-recursive (Requirement 2.1, 2.2)."""
    if not docs_dir.exists() or not docs_dir.is_dir():
        return []
    return sorted(p for p in docs_dir.iterdir() if p.is_file())


def _seed_single_file(db: Session, admin: User, source: Path) -> None:
    """Seed or re-sync one Source_File. Raises on unexpected error (caller logs)."""
    content = source.read_bytes()
    size = len(content)

    # Requirement 2.3: skip oversized files.
    if size > settings.MAX_UPLOAD_SIZE:
        logger.warning(
            "Skipping %s: size %d exceeds MAX_UPLOAD_SIZE %d",
            source.name, size, settings.MAX_UPLOAD_SIZE,
        )
        return

    source_hash = compute_hash(content)
    mime_type = resolve_mime_type(source.name)
    category = infer_category(source.name)

    # Requirement 6.1: match existing record by original_name.
    existing = (
        db.query(Document)
        .filter(Document.original_name == source.name)
        .first()
    )

    if existing is None:
        # Requirement 6.2: create one Document + one Stored_File.
        unique_filename, _ = storage_service.save_file(content, source.name)
        document = Document(
            filename=unique_filename,
            original_name=source.name,
            mime_type=mime_type,
            size=size,
            category=category,
            access_level=AccessLevel.MEMBERS,   # Requirement 5.1
            uploaded_by=admin.id,               # Requirement 1.2
            download_count=0,
        )
        db.add(document)
        logger.info("Seeded new document: %s (%s, %s)", source.name, category.value, mime_type)
        return

    # Requirement 6.3/6.4: compare source hash against the currently Stored_File.
    stored_path = storage_service.get_file_path(existing.filename)
    stored_hash = compute_hash(stored_path.read_bytes()) if stored_path else None

    if stored_hash == source_hash and existing.size == size:
        # Unchanged: leave record and stored file untouched (Requirement 6.3).
        logger.debug("Unchanged document, skipping re-sync: %s", source.name)
        return

    # Changed: overwrite the SAME stored file, update the SAME row (Requirement 6.4).
    if stored_path is not None:
        stored_path.write_bytes(content)          # overwrite in place, keeps filename/id stable
    else:
        # Stored file missing on disk — re-create and repoint filename.
        unique_filename, _ = storage_service.save_file(content, source.name)
        existing.filename = unique_filename
    existing.size = size
    existing.mime_type = mime_type
    # category left as-is on re-sync to respect any manual reclassification; size/mime/updated_at change.
    logger.info("Re-synced changed document (same id=%s): %s", existing.id, source.name)


def seed_docs_folder(docs_dir: Optional[Path] = None) -> None:
    """Entry point invoked from the FastAPI lifespan after create_default_admin().

    Validates Requirements 1, 2, 3, 4, 5.1, 6.
    """
    resolved_dir = docs_dir or Path(settings.DOCS_SEED_DIR)

    db: Session = SessionLocal()
    try:
        admin = resolve_seeding_admin(db)
        if admin is None:
            # Requirement 1.3: no administrator => no-op + warning.
            logger.warning("Docs seeding skipped: no administrator user found.")
            return

        files = discover_source_files(resolved_dir)
        if not files:
            # Requirement 2.2: missing folder (or empty) => no-op + log.
            logger.info("Docs seeding: no files found in %s", resolved_dir)
            return

        for source in files:
            try:
                _seed_single_file(db, admin, source)
            except Exception:  # Requirement: one bad file must not abort the whole seed.
                logger.exception("Docs seeding failed for file: %s", source)
                db.rollback()

        db.commit()
        logger.info("Docs seeding complete (%d file(s) processed).", len(files))
    except Exception:
        db.rollback()
        logger.exception("Docs seeding aborted due to unexpected error.")
    finally:
        db.close()
```

**Idempotency / change-detection decision (Requirement 6):**

Two options were considered:

- **(a) Add a `content_hash` column** to `documents`. Cleaner to query but requires an Alembic migration, changes the schema, and adds risk to an existing table with production data.
- **(b) Compare the source hash against the hash of the currently `Stored_File`** on disk (`get_file_path(document.filename)`), matching records by `original_name`. No schema change, no migration, and the `Stored_File` is the authoritative record of what was last seeded.

**Chosen: option (b).** It is the lower-risk approach: it introduces no migration and reuses the existing `filename → stored bytes` relationship as the change-detection anchor. On re-sync we overwrite the same `Stored_File` in place, which keeps both the `Document.id` and `Document.filename` stable and guarantees at most one row and one stored file per `original_name` across restarts (Requirement 6.5). Matching by `original_name` gives idempotent identity; comparing hash+size against the stored bytes gives change detection without persisting extra metadata.

**MIME validation (Requirement 3.5):** Seeding calls `storage_service.save_file()` directly and never calls `storage_service.validate_file()`. This means `.md`/`.txt` files (whose MIME types are not in `ALLOWED_MIME_TYPES`) seed successfully. The upload endpoint's validation is deliberately left unchanged so user uploads remain restricted. `ALLOWED_MIME_TYPES` is not modified.

#### 3. Lifespan wiring — `app/main.py`

Insert the call immediately after `create_default_admin()` and before `task_scheduler.start()`:

```python
from app.services.document_seed_service import seed_docs_folder
# ...
    # Create default admin user if no users exist
    create_default_admin()

    # Seed repository docs/ files into the document system (after admin exists)
    seed_docs_folder()

    # Start background task scheduler
    task_scheduler.start()
```

This exact call site satisfies Requirement 1.1 (runs once, after admin creation).

### Frontend

#### 4. New service — `frontend/src/services/documentService.ts`

Uses the shared `api` axios instance (adds the bearer token via the existing request interceptor).

```typescript
import api from './api';

export type DocumentCategory = 'statutes' | 'minutes' | 'financial_reports' | 'other';
export type AccessLevel = 'public' | 'members' | 'administrators';

export interface Document {
  id: string;
  filename: string;
  original_name: string;
  mime_type: string;
  size: number;
  category: DocumentCategory;
  access_level: AccessLevel;
  uploaded_by: string;
  download_count: number;
  created_at: string;
  updated_at: string;
}

export interface DocumentListResponse {
  documents: Document[];
  total: number;
}

export const documentService = {
  async listDocuments(): Promise<DocumentListResponse> {
    const response = await api.get<DocumentListResponse>('/documents');
    return response.data;
  },

  async downloadDocument(id: string, originalName: string): Promise<void> {
    const response = await api.get(`/documents/${id}/download`, { responseType: 'blob' });
    const url = window.URL.createObjectURL(response.data as Blob);
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = originalName;
    document.body.appendChild(anchor);
    anchor.click();
    anchor.remove();
    window.URL.revokeObjectURL(url);
  },
};
```

Note: `api` baseURL is `/api`, so `'/documents'` resolves to `GET /api/documents` and `'/documents/{id}/download'` to `GET /api/documents/{id}/download` (Requirements 7.3, 10.1).

#### 5. New page — `frontend/src/pages/DocumentsPage.tsx` (named export)

Responsibilities: fetch on mount; loading/error/empty states; search filter; category grouping with French labels; per-item name + human-readable size + download button; French UI; `#000E9C` theme with Tailwind consistent with `NewTopicPage.tsx` (`card p-6`, `text-2xl font-bold text-[#000E9C]`, `focus:ring-[#4949FF]`, `bg-[#000E9C] hover:bg-[#4949FF]`).

```typescript
import { useEffect, useMemo, useState } from 'react';
import { documentService, type Document, type DocumentCategory } from '../services/documentService';

const CATEGORY_LABELS: Record<DocumentCategory, string> = {
  statutes: 'Statuts',
  minutes: 'Comptes rendus',
  financial_reports: 'Rapports financiers',
  other: 'Autre',
};
const CATEGORY_ORDER: DocumentCategory[] = ['statutes', 'minutes', 'financial_reports', 'other'];

export function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} o`;
  const units = ['Ko', 'Mo', 'Go'];
  let value = bytes / 1024;
  let unitIndex = 0;
  while (value >= 1024 && unitIndex < units.length - 1) {
    value /= 1024;
    unitIndex += 1;
  }
  return `${value.toFixed(1)} ${units[unitIndex]}`;
}

export const DocumentsPage = () => {
  const [documents, setDocuments] = useState<Document[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [downloadError, setDownloadError] = useState<string | null>(null);
  const [search, setSearch] = useState('');

  useEffect(() => {
    let active = true;
    documentService
      .listDocuments()
      .then((res) => { if (active) setDocuments(res.documents); })
      .catch(() => { if (active) setError('Impossible de charger les documents'); })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, []);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return documents;                                   // Requirement 9.2
    return documents.filter((d) => d.original_name.toLowerCase().includes(q)); // Requirement 9.1
  }, [documents, search]);

  const grouped = useMemo(() => {
    const map: Record<DocumentCategory, Document[]> = {
      statutes: [], minutes: [], financial_reports: [], other: [],
    };
    for (const doc of filtered) map[doc.category].push(doc);   // Requirement 8.1 partition
    return map;
  }, [filtered]);

  const handleDownload = async (doc: Document) => {
    try {
      setDownloadError(null);
      await documentService.downloadDocument(doc.id, doc.original_name); // Requirement 10.1
    } catch {
      setDownloadError(`Échec du téléchargement de « ${doc.original_name} »`); // Requirement 10.3
    }
  };

  if (loading) return <div className="card p-6 text-gray-600">Chargement des documents…</div>;
  if (error) return (
    <div className="card p-6 bg-red-50 border border-red-200 text-red-700">{error}</div>
  );

  return (
    <div>
      <h1 className="text-2xl font-bold text-[#000E9C] mb-5">Documents</h1>

      <div className="mb-5">
        <input
          type="text"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Rechercher un document…"
          aria-label="Rechercher un document"
          className="w-full px-3 py-2.5 border border-gray-300 rounded text-sm focus:ring-2 focus:ring-[#4949FF] focus:border-transparent"
        />
      </div>

      {downloadError && (
        <div className="mb-4 bg-red-50 border border-red-200 text-red-700 px-3 py-2 rounded text-sm">
          {downloadError}
        </div>
      )}

      {filtered.length === 0 ? (
        <div className="card p-6 text-gray-600">Aucun document disponible.</div>
      ) : (
        CATEGORY_ORDER.map((category) =>
          grouped[category].length > 0 ? (
            <section key={category} className="card p-6 mb-5">
              <h2 className="text-lg font-semibold text-[#000E9C] mb-3">{CATEGORY_LABELS[category]}</h2>
              <ul className="divide-y divide-gray-100">
                {grouped[category].map((doc) => (
                  <li key={doc.id} className="flex items-center justify-between py-2.5">
                    <div>
                      <p className="text-sm font-medium text-gray-800">{doc.original_name}</p>
                      <p className="text-xs text-gray-500">{formatSize(doc.size)}</p>
                    </div>
                    <button
                      onClick={() => handleDownload(doc)}
                      className="px-3 py-1.5 text-sm font-medium text-white bg-[#000E9C] rounded hover:bg-[#4949FF] transition-colors"
                    >
                      Télécharger
                    </button>
                  </li>
                ))}
              </ul>
            </section>
          ) : null
        )
      )}
    </div>
  );
};
```

#### 6. Route registration — `frontend/src/App.tsx`

Add the import and a nested protected route inside the existing `<Layout>` `<Routes>`:

```typescript
import { DocumentsPage } from './pages/DocumentsPage';
// ...
<Route
  path="/documents"
  element={
    <ProtectedRoute>
      <DocumentsPage />
    </ProtectedRoute>
  }
/>
```

This satisfies Requirements 7.1 (renders when authenticated) and 7.2 (`ProtectedRoute` redirects anonymous users to `/login`).

## Data Models

No schema changes. The existing `Document` model is reused as-is:

| Field | Seeding value |
|---|---|
| `filename` | unique name from `storage_service.save_file` (stable across re-sync) |
| `original_name` | the Source_File name (identity key for idempotency) |
| `mime_type` | resolved from extension (updated on content change) |
| `size` | byte length (updated on content change) |
| `category` | inferred from filename on create |
| `access_level` | always `AccessLevel.MEMBERS` |
| `uploaded_by` | resolved `Seeding_Admin.id` |
| `download_count` | `0` on create |
| `created_at` / `updated_at` | model defaults / `onupdate` |

The frontend `Document` TypeScript interface mirrors the backend `DocumentResponse` shape exactly.

## Error Handling

- **No administrator (Req 1.3):** log a warning and return; no rows created.
- **Missing/empty docs folder (Req 2.2):** log info and return; no rows created.
- **Oversized file (Req 2.3):** log a warning, skip that file, continue with the rest.
- **Per-file failure:** each file is processed in its own `try/except`; on error, log with stack trace, `rollback` partial work, and continue with the next file so one bad file cannot abort the whole seed.
- **Unexpected top-level failure:** `rollback` and log; startup still proceeds (seeding is best-effort).
- **Frontend list load failure:** show a French error message instead of the list.
- **Frontend download failure (Req 10.3):** catch, show a French per-download error message, leave the list intact.

## Testing Strategy

### Backend (pytest)

Reuse existing fixtures (`db_session`, `test_user`) and add helpers that create administrator users and `tmp_path` docs folders. Pure helpers (`resolve_mime_type`, `infer_category`, `compute_hash`) are tested directly; orchestration (`seed_docs_folder`) is tested against `db_session` with `settings.UPLOAD_DIR`/`DOCS_SEED_DIR` patched to `tmp_path`.

- **Unit / property:** MIME resolution mapping and default fallback; category inference and precedence; oversized-skip boundary at `MAX_UPLOAD_SIZE`; non-recursive discovery.
- **Idempotency:** run `seed_docs_folder` twice over the same folder; assert per-`original_name` row count stays `1` and ids are unchanged.
- **Content-change re-sync:** seed, mutate a file's bytes, seed again; assert same id, updated `size`/`mime_type`, and stored bytes equal new content; unchanged file leaves row and stored bytes untouched.
- **Edge/example:** missing folder no-op; no-admin no-op + warning; `.md` file seeds despite `text/markdown` not being in `ALLOWED_MIME_TYPES`; members-level doc visible to a member via `GET /api/documents`; anonymous download denied (403).

Property tests use a property-based library (e.g. Hypothesis) with a minimum of 100 iterations and are tagged **Feature: docs-auto-seed-and-documents-page, Property {number}: {property_text}**.

### Frontend (Vitest + React Testing Library + fast-check)

- **Grouping partition (property):** for arbitrary document lists, every displayed document appears in exactly its category section (disjoint sections whose union equals the displayed set).
- **Search filter (property):** for arbitrary lists and query strings, the displayed set equals the case-insensitive substring filter of `original_name` and is a subset of the full list; empty query shows all.
- **Size formatting (property):** for arbitrary non-negative byte counts, `formatSize` returns a defined, non-empty string containing a unit.
- **Item content (property):** every rendered item shows the name, a formatted size, and a download control.
- **Examples:** mount calls `documentService.listDocuments`; clicking download calls `documentService.downloadDocument(id, name)`; download rejection shows a French error message; authenticated render shows the page; unauthenticated route redirects to `/login`.

Property tests run a minimum of 100 iterations and are tagged **Feature: docs-auto-seed-and-documents-page, Property {number}: {property_text}**.

## Correctness Properties

*A property is a characteristic or behavior that should hold true across all valid executions of a system-essentially, a formal statement about what the system should do. Properties serve as the bridge between human-readable specifications and machine-verifiable correctness guarantees.*

### Property 1: MIME resolution mapping

*For any* filename, `resolve_mime_type` returns `text/markdown` for a `.md` extension, `text/plain` for `.txt`, `application/pdf` for `.pdf`, `application/msword` for `.doc`, and `application/octet-stream` for any other or absent extension; the result depends only on the (case-insensitive) extension.

**Validates: Requirements 3.1, 3.2, 3.3, 3.4**

### Property 2: Category inference determinism and mapping

*For any* filename, `infer_category` is deterministic and returns `statutes` when the name contains "statut", otherwise `minutes` when it contains "minute" or "compte", otherwise `financial_reports` when it contains "financ", "report", or "rapport", otherwise `other`; the first matching rule in that fixed precedence always wins.

**Validates: Requirements 4.1, 4.2, 4.3, 4.4**

### Property 3: Seeded records are always members-level and admin-owned

*For any* set of valid (non-oversized) Source_Files seeded when a Seeding_Admin exists, every created Document_Record has `access_level == members` and `uploaded_by == Seeding_Admin.id`.

**Validates: Requirements 1.2, 5.1**

### Property 4: Non-recursive oversized-aware discovery and skipping

*For any* Docs_Folder tree, only files located directly in the folder are considered, and among those, exactly the files whose size is less than or equal to `MAX_UPLOAD_SIZE` are registered while every file whose size exceeds `MAX_UPLOAD_SIZE` is skipped.

**Validates: Requirements 2.1, 2.3**

### Property 5: Idempotency across repeated runs

*For any* Docs_Folder and *for any* number of repeated seeding runs over unchanged content, the number of Document_Records with a given `original_name` is at most one and the number of Stored_Files for that record is at most one, and re-running creates no new records and no new stored files.

**Validates: Requirements 6.1, 6.2, 6.3, 6.5**

### Property 6: Content-change detection re-syncs the same record

*For any* Source_File that already has a Document_Record, if its size and Content_Hash equal those of the currently Stored_File then seeding leaves the record and stored file unmodified, and if either differs then seeding updates the same Document_Record identifier and replaces the stored bytes so the Stored_File content equals the new Source_File content.

**Validates: Requirements 6.3, 6.4, 6.5**

### Property 7: Grouping is a partition by category

*For any* list of documents displayed by the Documents_Page, each displayed document appears in exactly one category section — the section whose label maps to that document's category ("Statuts" for `statutes`, "Comptes rendus" for `minutes`, "Rapports financiers" for `financial_reports`, "Autre" for `other`) — so the sections are disjoint and their union equals the displayed set.

**Validates: Requirements 8.1**

### Property 8: Displayed item content

*For any* document displayed on the Documents_Page, the rendered item contains the document name, a human-readable size, and a download control.

**Validates: Requirements 8.2, 8.3**

### Property 9: Search filter subset and membership

*For any* document list and *for any* search text, the set of documents the Documents_Page displays equals exactly the documents whose name contains the search text case-insensitively, is always a subset of the full retrieved list, and equals the full list when the search text is empty.

**Validates: Requirements 9.1, 9.2**
